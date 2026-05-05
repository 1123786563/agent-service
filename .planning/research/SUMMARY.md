# Auth Expansion & Security Hardening — Research Summary

Synthesized from STACK.md, FEATURES.md, ARCHITECTURE.md, and PITFALLS.md. This document feeds into requirements and roadmap creation.

---

## 1. Stack Recommendations

**Core principle: extend the existing custom auth system. Do NOT adopt Auth.js/NextAuth.** The current session management is well-architected (opaque tokens, SHA-256 hashing, httpOnly + sameSite cookies, Prisma transactions). Replacing it would be a rewrite, not an enhancement.

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@node-rs/argon2` | ^2.0.0 | Password hashing | OWASP-recommended Argon2id; NAPI-RS pre-built binaries; memory-hard (resists GPU attacks) |
| `arctic` | ^3.0.0 | OAuth 2.0 client (Google, GitHub) | 15KB, zero opinions about sessions, handles PKCE/state/token exchange; from the Lucia ecosystem |
| `@upstash/ratelimit` | ^2.0.0 | Rate limiting | HTTP-based Redis client; works in Edge Runtime and serverless; 5KB, zero deps |
| `@upstash/redis` | ^1.34.0 | Backend for rate limiter | No TCP connection; free tier sufficient for auth rate limiting |
| `resend` | ^4.0.0 | Production email delivery | Modern API, React Email templates, generous free tier (100 emails/day) |

**Total: 5 new packages, ~255KB.** No framework-level auth dependency (no Auth.js, no Passport, no Lucia).

**Explicitly rejected:** Auth.js (rewrite cost), bcryptjs (CPU-only hardness), csurf (abandoned), express-rate-limit (no Edge Runtime), JWT sessions (revocation complexity), Supabase/Clerk (replaces entire system).

---

## 2. Table Stakes Features — Must-Haves for Security

Eighteen features cataloged; these are the non-negotiable ones:

### Blocking for Production Deploy (Phase 1)
- **T1** — Guard dev payment route behind `NODE_ENV` check (currently accepts unauthenticated requests)
- **T2** — Add auth to consultation creation endpoint (currently allows spam with arbitrary emails)
- **T7** — Production env var validation at startup (secrets fall back to hardcoded dev values)
- **T13** — Wrap refund + dispute resolution in `$transaction` (non-atomic; double-refund risk)
- **T14** — Catch P2002 on payment ledger (concurrent webhooks cause unhandled errors)
- **T17** — Add logout functionality (sessions expire at 30 days with no way to end them)

### High Priority (Phase 2)
- **T3** — CSRF protection for all `/api/*` POST routes (Origin header validation; no token library needed)
- **T4** — Rate limiting (in-memory now, Upstash Redis later; per-route for email/user-keyed limits)
- **T5/T6** — File upload size and type validation (delivery uploads have zero validation today)
- **T11** — Add `role === CREATOR` check to `requireCreator()` (currently only checks whitelist)
- **T15** — Atomic order status transitions (use `updateMany` with expected-status `where` clause)

### Auth Expansion (Phase 3)
- **T8** — Password login (Argon2id hashing, nullable `passwordHash` on User model)
- **T9/T10** — Google and GitHub OAuth (via Arctic; new `OAuthAccount` model, PKCE for Google)
- **T18** — Production email provider (Resend adapter following existing dev-mailer pattern)

---

## 3. Architecture Decisions — Extending Existing Auth

### Provider-Agnostic Session Convergence
All auth methods (magic link, password, Google OAuth, GitHub OAuth) converge on the same `createSession(userId)` call. No changes to cookie name, hashing scheme, or `getCurrentSession()` logic. Each provider only needs to: verify credentials, resolve/create the User row, then call the shared function.

### Schema Changes (All Additive)
```
User model:  + passwordHash (String?, nullable)
             + emailVerified (Boolean, default false)
             + oauthAccounts (OAuthAccount[])

New model:   OAuthAccount (id, provider, providerAccountId, userId, ...)
             @@unique([provider, providerAccountId])
```
No changes to `Session`, `MagicLinkToken`, or other existing models.

### New File Structure
```
src/server/auth/
  magic-link.ts       (existing — unchanged)
  session.ts          (existing — unchanged public API)
  password.ts         (NEW — registration, login, Argon2id hashing)
  oauth.ts            (NEW — shared OAuth utilities)
  oauth-google.ts     (NEW — Google-specific logic with PKCE)
  oauth-github.ts     (NEW — GitHub-specific logic)
  csrf.ts             (NEW — HMAC-based synchronizer token)
  rate-limit.ts       (NEW — sliding-window counter, Map-based)
  cleanup.ts          (NEW — expired session/token deletion)

middleware.ts         (NEW — CSRF + IP rate limiting + security headers)
instrumentation.ts   (NEW — startup validation hook)
```

### CSRF: Origin Header Verification (Not Token Library)
Modern browsers send `Origin` on all mutating requests. Verify it matches `APP_URL` in middleware. Exempt: Stripe webhook (has its own signature), OAuth callbacks (validated by state/PKCE), unauthenticated auth routes. This is simpler and equally secure vs. double-submit cookie libraries.

### Rate Limiting: Hybrid Approach
- **Middleware layer:** Generic IP-based limits for all `/api/*` routes (100 req/min)
- **Per-route layer:** Specific limits keyed by email (auth endpoints) or user ID (creator actions), called at top of each handler

---

## 4. Critical Pitfalls — Top Risks to Watch

### Race Conditions (Will Cause Real Data Corruption)
1. **OAuth user creation race** — Two concurrent callbacks for the same email can create duplicate Users. Prevention: always use `upsert` by email, never find-then-create. Catch P2002 defensively.
2. **Refund double-spend** — `requestRefund()` then `resolveDispute()` without a transaction. If resolve fails, retry triggers second refund. Prevention: wrap in `$transaction`, add idempotency guard before Stripe call.
3. **Consultation-to-order race** — `consultationHasOrder` check is outside the transaction that creates the order. Prevention: add unique constraint on `ServiceOrder.consultationId`.

### OAuth-Specific
4. **Unverified email from GitHub** — GitHub returns unverified emails. If code trusts `profile.email` without checking `email_verified`, attacker creates GitHub account with victim's email to take over account.
5. **OAuth state not bound to browser** — State parameter must be stored in an httpOnly cookie and verified in the callback, not just passed in the URL.
6. **Open redirect via `returnTo` parameter** — Only allow relative URLs starting with `/`. Never redirect to full URLs from user input.

### Session Management
7. **No session invalidation on privilege change** — Demoted admin retains access for 30 days. Prevention: delete all sessions when role/whitelist status changes.
8. **Order routes check buyer by email, not user ID** — Breaks when OAuth adds multiple emails per user. Must fix before OAuth ships.

### Production Traps
9. **Dev adapters active in production** — `dev-mailer.ts` and `dev/complete` route have no `NODE_ENV` guard. Magic links silently write to disk; anyone can mark orders as paid.
10. **Missing middleware.ts** — No centralized defense layer. Every route must independently remember auth checks. Single forgotten check exposes an endpoint.

---

## 5. Recommended Phase Order

### Phase 1: Critical Security Fixes (no schema changes, standalone)
- T1 (dev route guard), T2 (consultation auth), T7 (env validation), T11 (role check)
- T13 (atomic refund), T14 (ledger race), T17 (logout)
- **Why first:** Zero dependencies, fixes active vulnerabilities, unblocks production.

### Phase 2: Input Validation & Access Control
- T3 (CSRF via middleware), T4 (rate limiting), T5/T6 (file validation)
- T12 (duplicate reviews), T15 (atomic order transitions)
- **Why second:** Establishes middleware pattern (needed by Phase 3) and hardens mutation endpoints before new auth methods increase attack surface.

### Phase 3: Authentication Expansion (schema changes)
- T8 (password auth), T9 (Google OAuth), T10 (GitHub OAuth), T18 (production email)
- **Why third:** Depends on middleware existing (CSRF, rate limiting). Schema migration introduces `passwordHash` and `OAuthAccount`. T8 and T9/T10 can be parallelized since they share no code.

### Phase 4: Security Hardening & Polish
- T16 (session cleanup), D1 (session revocation), D2 (auth audit), D3 (security headers)
- D4 (account lockout), D5 (webhook hardening), D6 (full CSP)
- **Why last:** Enhancements, not blockers. D1 and D2 become more valuable after Phase 3 adds more auth methods to audit.

---

## 6. Dependencies Between Features and Phases

```
Phase 1 (all standalone, no inter-dependencies):
  T1, T2, T7, T11, T13, T14, T17 — can be parallelized

Phase 2 (middleware is the backbone):
  T3 (CSRF) — establishes middleware.ts pattern
  T4 (rate limiting) — shares middleware with T3; must be sequential with T3
  T5, T6, T12, T15 — standalone, parallelizable with each other

Phase 3 (auth chain):
  T8 (password) — do first, establishes registration + session patterns
  T9 (Google OAuth) — shares OAuthAccount model with T10
  T10 (GitHub OAuth) — reuses T9 infrastructure; depends on T9
  T8 and T9/T10 can be parallelized (no shared code)
  T18 (email) — standalone within Phase 3

Phase 4 (enhancements):
  D1, D2, D3, D5 — standalone
  D4 (account lockout) — depends on T4 + T8
  D6 (full CSP) — depends on D3, benefits from T9/T10 (need OAuth domains whitelisted)
```

**Critical path:** Phase 1 -> Phase 2 (middleware) -> Phase 3 (auth expansion). Phase 4 can be interleaved after Phase 2 middleware exists.

---

*Synthesized: 2026-05-05 | Sources: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md*
