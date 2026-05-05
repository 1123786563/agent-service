# Auth Expansion & Security Hardening Stack -- 2025 Recommendations

## Context

Hermes Agent Marketplace runs Next.js 15 App Router with React 19, Prisma 5, PostgreSQL, Stripe, and S3-compatible storage. Auth is currently a custom magic link system with cookie-based sessions (`hermes_market_session` cookie, opaque tokens, SHA-256 hashes in `Session` table). The project has no middleware (`middleware.ts` is absent), no CSRF protection, and no rate limiting.

This milestone adds: password login, Google OAuth, GitHub OAuth, CSRF protection, rate limiting, and production hardening -- all alongside the existing magic link flow.

---

## 1. Authentication Framework: Extend Custom Auth

### Recommendation: Do NOT adopt Auth.js / NextAuth

**Use the existing custom auth system and extend it.** Auth.js (formerly NextAuth) v5 is the dominant community choice for greenfield Next.js auth, but this project has specific reasons to avoid it:

| Factor | Auth.js v5 | Custom (extend existing) |
|--------|-----------|------------------------|
| Migration cost | Replace session management, cookie handling, user upsert, magic link, admin checks; rewrite all `getCurrentSession`/`requireCreator`/`requireAdmin` calls across 13+ API routes | Add new auth methods alongside existing ones |
| Existing session schema | Auth.js expects its own `Adapter` pattern; current `Session` table (cuid ID, tokenHash, userId, expiresAt) does not match | Reuse as-is |
| Control over session tokens | Abstracted away; opaque cookie tokens managed internally | Full control (already have opaque tokens with SHA-256 hashing, timing-safe cookie writes, transactional rollback) |
| Magic link coexistence | Possible via `CredentialsProvider` hackery, but awkward -- magic links are not a first-class Auth.js provider | Already works perfectly |
| OAuth provider setup | First-class, but trivial to replicate with 3 API routes per provider (Google, GitHub) | ~150 lines per provider using standard OAuth 2.0 flows |
| Bundle size | `next-auth` adds ~150KB to server bundle (JWT/JWS/JWE dependencies even when using database sessions) | Zero additional framework weight |
| Next.js 15 compat | Auth.js v5 works with App Router but has rough edges around Server Actions, Route Handlers, and middleware integration; ongoing breaking changes in RC cycle | No external framework coupling |
| Chinese-localized error UX | Must override Auth.js error pages/callbacks | Already have `AuthFlowError` with Chinese messages |

**The existing custom auth is well-architected.** The code in `src/server/auth/session.ts` and `src/server/auth/magic-link.ts` is clean: opaque tokens, SHA-256 hashing, Prisma transactions with rollback, proper cookie security (httpOnly, sameSite, secure in production). Replacing this with Auth.js would be a rewrite, not an enhancement.

### What to build instead

Extend the `src/server/auth/` module with three new files following the established patterns:

```
src/server/auth/
  magic-link.ts    (existing -- keep as-is)
  session.ts       (existing -- keep as-is, add minor helpers)
  password.ts      (NEW -- registration, login, password hashing)
  oauth.ts         (NEW -- OAuth 2.0 flow for Google and GitHub)
```

Add corresponding API routes:

```
src/app/api/auth/
  request-link/route.ts    (existing)
  consume/route.ts          (existing)
  register/route.ts         (NEW -- POST email+password registration)
  login/route.ts            (NEW -- POST email+password login)
  google/callback/route.ts  (NEW -- OAuth callback)
  github/callback/route.ts  (NEW -- OAuth callback)
```

All methods converge on the same `createSession()` call from `session.ts`, so the session cookie behavior is identical regardless of auth method.

---

## 2. Password Hashing: `argon2`

### Recommendation: `argon2` v0.41+ (via `@node-rs/argon2`)

| Package | Version | Algorithm | Why |
|---------|---------|-----------|-----|
| `@node-rs/argon2` | ^2.0.0 | Argon2id | Winner of the 2015 Password Hashing Competition. Memory-hard, resistant to GPU/ASIC attacks. Native Rust binding via NAPI-RS -- no native compilation issues on modern Node.js |

**Why Argon2id over bcrypt:**
- bcrypt has a 72-byte password limit and does not resist GPU attacks as effectively
- Argon2id is the OWASP-recommended algorithm for new systems (2024 guidelines)
- `@node-rs/argon2` provides pre-built binaries for all platforms (Linux x64/ARM, macOS, Windows) via NAPI-RS -- no node-gyp, no build step
- The `node:crypto.scrypt` alternative exists but Argon2id is a stronger choice and just as easy to use

**Why NOT `bcryptjs`:**
- Pure JavaScript implementation, significantly slower than native alternatives
- While slowness is traditionally desirable in password hashing, bcryptjs is slow in the wrong dimension (CPU) while being memory-light (easy to parallelize on GPUs)
- Argon2id's memory hardness is the correct modern trade-off

**Usage pattern:**
```typescript
import { hash, verify } from "@node-rs/argon2";

const HASH_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 }; // OWASP recommended
const hash = await hash(password, HASH_OPTIONS);
const valid = await verify(hash, password);
```

### Schema addition

Add to `User` model:
```prisma
model User {
  // ...existing fields...
  passwordHash  String?   // null for magic-link-only or OAuth-only users
  emailVerified Boolean   @default(false)
}
```

`passwordHash` is nullable to support users who registered via magic link or OAuth and have not set a password.

---

## 3. OAuth: Google & GitHub via `arctic`

### Recommendation: `arctic` ^3.0.0

| Package | Version | Purpose |
|---------|---------|---------|
| `arctic` | ^3.0.0 | Lightweight OAuth 2.0 / OpenID Connect client for major providers |

**Why `arctic` over rolling your own or using Auth.js:**
- Arctic is a purpose-built OAuth client library from the Lucia Auth ecosystem (now maintained independently). It handles the PKCE flow, state parameter generation, token exchange, and claims parsing for 20+ providers
- Zero opinions about sessions or cookies -- it only handles the OAuth dance. Perfect for our custom session system
- ~15KB, no framework coupling
- Supports exactly the providers we need (Google, GitHub) with type-safe APIs
- Active maintenance, compatible with Node.js 22+ and Next.js 15

**Why NOT `next-auth`/Auth.js just for OAuth:**
- Would require migrating sessions, cookies, and user management to Auth.js conventions
- OAuth flows are 3 API routes each (authorize redirect, callback, user fetch) -- ~100 lines of trivial code with Arctic
- Auth.js brings 150KB+ of JWT/JWS dependencies we do not need (we use database sessions)

**Why NOT raw `fetch`-based OAuth:**
- Arctic handles edge cases: PKCE code verifier generation, state parameter CSRF protection, proper `application/x-www-form-urlencoded` token exchange, ID token validation
- These are easy to get wrong and security-critical; Arctic gets them right in ~50 lines per provider

### Schema addition

```prisma
model OAuthAccount {
  id           String   @id @default(cuid())
  provider     String   // "google" | "github"
  providerAccountId String
  accessToken  String?  // encrypted at rest; optional since we don't need ongoing API access
  refreshToken String?
  expiresAt    DateTime?
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}
```

Add relation to User:
```prisma
model User {
  // ...existing...
  oauthAccounts OAuthAccount[]
}
```

### OAuth flow with Arctic

```
1. User clicks "Sign in with Google"
   GET /api/auth/google -> generate state + codeVerifier, store in cookie, redirect to Google
2. Google redirects back
   GET /api/auth/google/callback?code=...&state=...
   -> validate state, exchange code for tokens, fetch userinfo
   -> upsert User + OAuthAccount
   -> createSession() (reuse existing)
   -> redirect to /creator
3. GitHub: identical pattern, different Arctic provider
```

---

## 4. CSRF Protection: Double Submit Cookie via Middleware

### Recommendation: Custom middleware -- no library needed

**Why no CSRF library:**
- Next.js 15 App Router Route Handlers that receive `FormData` via POST are naturally protected by the browser's Same-Origin Policy when `sameSite: "lax"` cookies are used
- The actual CSRF risk is for JSON `Content-Type` API requests (which attackers can send cross-origin via `fetch`). The project's current POST routes use `FormData` (magic link request) or are server actions
- The standard Next.js defense is: verify the `Origin` / `Sec-Fetch-Site` headers on all mutating requests in middleware

**Implementation: Create `src/middleware.ts`**

This is the single most impactful security addition. The middleware should:

1. **Verify Origin header** on all POST/PUT/PATCH/DELETE requests to `/api/*`
   - Compare `Origin` or `Referer` header against the app's known origin
   - Reject requests where `Origin` does not match (blocks cross-origin form submissions and fetch)
   - Exempt: Stripe webhook (`/api/payments/webhook`) -- Stripe sends its own signature verification
   - Exempt: Dev payment routes -- behind `NODE_ENV` guard already

2. **No CSRF token generation needed** -- the combination of `sameSite: "lax"` cookies + Origin header verification is the modern standard recommended by OWASP and used by Next.js itself

**Why NOT `csrf-csrf` / `csurf`:**
- `csurf` is deprecated and abandoned
- `csrf-csrf` (double-submit cookie library) is well-maintained but adds unnecessary complexity when Origin verification achieves the same security property
- The double-submit cookie pattern is strictly weaker than Origin verification for modern browsers (both rely on same-origin enforcement, but Origin is simpler)

### Key Next.js 15 middleware detail

Next.js 15 middleware runs on the Edge Runtime by default. Cookie reads/writes work via `NextRequest`/`NextResponse`. The `Origin` header check is a simple string comparison -- no Node.js APIs needed.

---

## 5. Rate Limiting: Upstash Redis `@upstash/ratelimit`

### Recommendation: `@upstash/ratelimit` ^2.0.0 + `@upstash/redis` ^1.34.0

| Package | Version | Purpose |
|---------|---------|---------|
| `@upstash/ratelimit` | ^2.0.0 | Token bucket / sliding window rate limiting |
| `@upstash/redis` | ^1.34.0 | HTTP-based Redis client (works on Edge Runtime) |

**Why Upstash:**
- HTTP-based Redis client -- works in Next.js Edge Runtime (middleware), Vercel serverless functions, and standard Node.js
- No persistent TCP connection required; perfect for serverless/edge deployments
- Free tier: 10,000 commands/day, more than sufficient for auth rate limiting
- `@upstash/ratelimit` provides sliding window, fixed window, and token bucket algorithms out of the box
- The library is ~5KB and has zero dependencies

**Rate limit configuration:**

| Endpoint | Limit | Rationale |
|----------|-------|-----------|
| `POST /api/auth/request-link` | 5 per email per hour, 20 per IP per hour | Prevent magic link spam |
| `POST /api/auth/register` | 5 per IP per hour | Prevent bulk account creation |
| `POST /api/auth/login` | 10 per email per 15 min, 20 per IP per hour | Prevent credential stuffing |
| `GET /api/auth/google/callback` | 10 per IP per minute | Prevent OAuth abuse |
| `GET /api/auth/github/callback` | 10 per IP per minute | Prevent OAuth abuse |
| `POST /api/consultations` | 10 per user per hour | Prevent consultation spam |
| `POST /api/creator/agents` | 10 per user per hour | Prevent upload abuse |
| `POST /api/payments/webhook` | 100 per minute per Stripe signature | Protect webhook processing |
| All other `/api/*` POST | 30 per IP per minute | General abuse protection |

**Why NOT `express-rate-limit` / custom in-memory:**
- `express-rate-limit` does not work with Next.js middleware (Edge Runtime)
- In-memory stores do not persist across serverless function invocations
- No need for a full Redis server -- Upstash's HTTP API is purpose-built for this

**Development fallback:**

For local development without Upstash, implement an in-memory `Map`-based rate limiter that respects the same interface:

```typescript
// src/server/rate-limit.ts
const isDev = process.env.NODE_ENV !== "production";

export function getRateLimiter(limit: number, window: string) {
  if (isDev) return new InMemoryRateLimiter(limit, window);
  return new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(limit, window) });
}
```

**Why NOT `rate-limiter-flexible`:**
- Requires a persistent Redis or MongoDB connection (TCP-based)
- Does not work in Edge Runtime
- Heavier dependency for what is essentially a counter with TTL

---

## 6. Session Security Enhancements

### Current state (keep)
- `httpOnly: true` -- good
- `sameSite: "lax"` -- good
- `secure: true` in production -- good
- Opaque tokens (not JWTs) -- good
- SHA-256 token hashing in database -- good
- 30-day expiration -- reasonable

### Additions

1. **Session rotation on privilege escalation**: When a user goes from `USER` to `CREATOR` role (whitelist approval), rotate the session token. This prevents session fixation if the user was previously unauthenticated or had a different role.

2. **Add `lastActiveAt` to Session model** (optional): Track activity for cleanup of stale sessions. Not blocking for launch.

3. **No JWT needed**: The current opaque token + database lookup approach is correct for this application. JWTs add complexity (revocation, key management) with no benefit when every authenticated request already hits the database for authorization checks (role, whitelist status).

---

## 7. Production Environment Validation

### Recommendation: Custom startup validation module

Create `src/server/config.ts` that validates all required environment variables at application startup:

```typescript
// Fail fast if production config is missing
const required = [
  "DATABASE_URL",
  "DOWNLOAD_TICKET_SECRET",
  "DOWNLOAD_TICKET_ACTIVE_KEY_ID",
  // ... conditional checks for payment/storage providers
];
```

This runs at module import time in `src/instrumentation.ts` (Next.js 15 supports this natively).

**Why NOT `@t3-oss/env-nextjs`:**
- Adds `@t3-oss/env-core` + `zod` dependency (we already have zod, but the wrapper is thin)
- Our requirements are simple: check existence of env vars at startup
- A 30-line module is clearer than introducing a framework dependency for validation

---

## 8. Additional Security Libraries

### Helmet equivalent: Custom security headers via middleware

Next.js does not use Express, so `helmet` is not applicable. Instead, add security headers in `next.config.mjs`:

```javascript
const nextConfig = {
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        // Content-Security-Policy: set after OAuth URLs are known
      ]
    }];
  }
};
```

### Email for production: Resend

| Package | Version | Purpose |
|---------|---------|---------|
| `resend` | ^4.0.0 | Production email delivery (magic links, email verification) |

**Why Resend:**
- Modern API, excellent developer experience, generous free tier (100 emails/day)
- Built for Next.js (React Email templates)
- Simpler API than SendGrid or AWS SES
- The existing dev mailer adapter pattern makes this a clean swap

---

## 9. What NOT to Use

| Library / Approach | Why Not |
|---|---|
| **Auth.js / NextAuth v5** | Would require rewriting session management, magic link flow, and all auth helpers. The custom system is well-architected; Auth.js adds complexity without proportional benefit for our three-provider needs |
| **Passport.js** | Express middleware; not compatible with Next.js App Router Route Handlers |
| **bcrypt / bcryptjs** | Inferior to Argon2id for new systems. bcrypt's 72-byte limit and CPU-only hardness are drawbacks |
| **csurf / csrf-csrf** | csurf is abandoned. csrf-csrf adds complexity when Origin header verification achieves the same protection |
| **express-rate-limit** | Requires Express; does not work in Next.js middleware (Edge Runtime) |
| **JWT-based sessions** | Adds revocation complexity. Our database-backed sessions already do a lookup for authorization; JWTs would add key rotation and revocation lists for no latency benefit |
| **Supabase Auth / Clerk / Firebase Auth** | Hosted auth services that would replace our entire session system. Overkill when we need to add 3 auth methods to an existing custom system |
| **Lucia Auth** | Deprecated as of 2024. Arctic (its OAuth component) lives on independently, which is what we use |

---

## 10. New Dependencies Summary

| Package | Version | Size (gzip) | Purpose |
|---------|---------|-------------|---------|
| `@node-rs/argon2` | ^2.0.0 | ~200KB native | Password hashing (Argon2id) |
| `arctic` | ^3.0.0 | ~15KB | OAuth 2.0 client (Google, GitHub) |
| `@upstash/ratelimit` | ^2.0.0 | ~5KB | Rate limiting |
| `@upstash/redis` | ^1.34.0 | ~15KB | HTTP-based Redis for rate limiting |
| `resend` | ^4.0.0 | ~20KB | Production email delivery |

**Total new production dependencies: 5 packages, ~255KB**

---

## 11. Implementation Order

The order matters because of dependencies between components:

1. **Middleware (`src/middleware.ts`)** -- Origin verification + security headers. Foundation for everything else.
2. **Password auth** -- `@node-rs/argon2` + `src/server/auth/password.ts` + registration/login routes. Schema migration: add `passwordHash`, `emailVerified` to User.
3. **OAuth (Google + GitHub)** -- `arctic` + `src/server/auth/oauth.ts` + callback routes. Schema migration: add `OAuthAccount` model.
4. **Rate limiting** -- `@upstash/ratelimit` + `src/server/rate-limit.ts`. Apply to all auth endpoints and mutation routes.
5. **Production email** -- `resend` + adapter following existing `dev-mailer.ts` pattern.
6. **Environment validation** -- `src/server/config.ts` + `src/instrumentation.ts`.

Steps 2 and 3 can be parallelized since they share no code. Steps 1 and 4 both touch middleware and should be sequential.

---

## 12. Schema Changes Summary

```prisma
// User model additions
model User {
  // ...existing fields...
  passwordHash   String?           // Argon2id hash; null = no password set
  emailVerified  Boolean @default(false)
  oauthAccounts  OAuthAccount[]
}

// New model
model OAuthAccount {
  id                String   @id @default(cuid())
  provider          String   // "google" | "github"
  providerAccountId String
  userId            String
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}
```

No changes to `Session`, `MagicLinkToken`, or any other existing models. The `OAuthAccount` model is additive.

---

*Last updated: 2026-05-05 -- stack research for auth expansion milestone*
