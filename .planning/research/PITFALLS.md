# Security Hardening Pitfalls — Hermes Agent Marketplace

Critical mistakes commonly made when implementing Next.js authentication and security hardening, mapped to this codebase's specific vulnerabilities and architecture.

---

## 1. OAuth Implementation Gotchas

### 1.1 Linking Multiple Providers to One User Without Race Protection

**Pitfall:** When adding Google/GitHub OAuth alongside magic link, two concurrent OAuth callbacks for the same email can race to create the user. The existing `upsert` in `requestMagicLink` (`src/server/auth/magic-link.ts` line 64) handles single-provider creation, but OAuth callbacks arrive via separate routes that each need to resolve "does this user exist?" independently.

**Warning signs:**
- Two `User` records with the same email created milliseconds apart in the database.
- OAuth callback route does `findUnique` then `create` in separate operations (the same anti-pattern already present in `src/server/payments/ledger.ts` lines 62-75).

**Prevention strategy:**
- Always use `upsert` with the email as the unique key when resolving OAuth users, never find-then-create.
- Add a unique constraint on `User.email` (already exists per schema line 103) and catch `P2002` errors defensively.
- Consider a single unified `resolveOrCreateUser(email, providerInfo)` function shared by all auth methods.

**Phase:** Password + OAuth implementation phase (before any OAuth route ships).

### 1.2 Not Invalidating Sessions When Adding a New Auth Method

**Pitfall:** Adding password/OAuth login creates new session tokens but does not invalidate existing magic link sessions. A user who enables password auth still has their old magic link session floating around. If the magic link token leaks (e.g., from browser history), the attacker gains access even after password is set.

**Warning signs:**
- No `DELETE FROM Session WHERE userId = ?` triggered when a user sets their first password or links an OAuth provider.
- Sessions have no `authMethod` field to distinguish which login method created them.

**Prevention strategy:**
- When a user first sets a password or links an OAuth provider, invalidate all existing sessions and force re-login.
- Optionally add an `authMethod` column to the `Session` model for audit visibility.

**Phase:** Password + OAuth implementation phase, specifically in the "link provider" or "set password" handlers.

### 1.3 OAuth State Parameter Not Tied to Session or Cookie

**Pitfall:** The OAuth `state` parameter prevents CSRF on the OAuth flow itself. If `state` is stored only in a cookie but the code does not verify the cookie's `SameSite` attribute or the callback route does not use `POST`, an attacker can forge the callback. The current session cookie uses `sameSite: "lax"` (`src/server/auth/session.ts` line 104), which protects against cross-site POST but not GET-based redirects.

**Warning signs:**
- OAuth callback is a `GET` route (Next.js API routes default to supporting all methods).
- `state` parameter is verified but not bound to a specific browser session.

**Prevention strategy:**
- Generate a cryptographically random `state`, store it in a short-lived `HttpOnly` cookie, and verify the cookie value matches the callback `state` parameter.
- Consider making the OAuth callback a route that only responds to specific methods.
- Ensure the `state` cookie uses `sameSite: "lax"` at minimum.

**Phase:** OAuth implementation phase.

### 1.4 OAuth Email Claim Trusted Without Verification

**Pitfall:** Google and GitHub OAuth providers return an email claim, but GitHub returns unverified emails by default. If the code trusts `profile.email` without checking `profile.email_verified`, an attacker can create a GitHub account with a victim's email and take over their account.

**Warning signs:**
- OAuth user creation code does `upsert({ where: { email: profile.email } })` without checking a `verified` flag.
- No distinction between verified and unverified email in the OAuth profile handler.

**Prevention strategy:**
- For Google: check `profile.verified === true`.
- For GitHub: either require `email_verified` from the GitHub API response or use GitHub's `/user/emails` endpoint which includes a `verified` boolean.
- If email is unverified, either reject the login or create the user in an "unverified" state that cannot perform sensitive operations.

**Phase:** OAuth implementation phase, during provider profile parsing.

---

## 2. Password Hashing Mistakes

### 2.1 Using Anything Other Than bcrypt/scrypt/Argon2

**Pitfall:** The codebase already uses `crypto.createHash("sha256")` for session tokens and download tickets. It is tempting to reach for the same API for password hashing. SHA-256 is fast by design -- exactly the wrong property for password hashing. A single SHA-256 hash of an 8-character password can be cracked in seconds.

**Warning signs:**
- Password verification code calls `crypto.createHash`, `crypto.pbkdf2`, or any Node.js crypto function directly instead of a dedicated password hashing library.
- `package.json` does not include `bcrypt`, `argon2`, or `scrypt` as a dependency.

**Prevention strategy:**
- Use `bcrypt` with a work factor of 12+ (or `argon2id` for new projects). Do not use Node.js built-in `crypto.scryptSync` without proper salt and iteration management.
- Store the hash in a dedicated `passwordHash` column on the `User` model, never in `metadataJson` or a generic field.
- The hash string should include the algorithm identifier and parameters (bcrypt does this by default with the `$2b$12$` prefix).

**Phase:** Password implementation phase, as the very first dependency decision.

### 2.2 Not Hashing on the Server Side

**Pitfall:** Some implementations hash the password on the client with JavaScript before sending it. This turns the hash into the effective password -- if the database leaks, the attacker can replay the hash directly. It also breaks if you ever need to change the hashing algorithm.

**Warning signs:**
- Login form has client-side JavaScript that hashes the password before form submission.
- The server receives something that is already a hash rather than plaintext.

**Prevention strategy:**
- Always transmit plaintext passwords over HTTPS and hash server-side only.
- Use HTTPS everywhere (enforced by `secure: true` in production cookie settings, already present in `src/server/auth/session.ts` line 105).

**Phase:** Password implementation phase.

### 2.3 Timing Attack on Password Verification

**Pitfall:** If password comparison is done with `===` instead of a constant-time comparison, an attacker can measure response times to progressively guess the hash. This is a real attack when the hash is stored in a format where partial matches leak timing information.

**Warning signs:**
- Password check code uses `===` or `==` to compare hashes.
- The codebase does use `crypto.timingSafeEqual` for download ticket verification (`src/server/storage/download-tickets.ts` line 97) but this is not applied to any password path.

**Prevention strategy:**
- `bcrypt.compare()` and `argon2.verify()` are already constant-time internally. Use these libraries and do not wrap them in manual comparisons.

**Phase:** Password implementation phase.

---

## 3. CSRF Bypass Patterns

### 3.1 API Routes vs Server Actions Confusion in Next.js 15

**Pitfall:** This codebase has a mix of Next.js server actions (`"use server"` in `src/app/admin/actions.ts`) and API routes (`src/app/api/*`). Server actions in Next.js 15 have built-in CSRF protection via Origin header checks. API routes do not. The OAuth flow, magic link consume, order mutations, and delivery uploads all go through API routes that accept `POST` with no CSRF protection.

**Warning signs:**
- A `POST` API route that accepts `FormData` and authenticates via session cookie (e.g., `src/app/api/orders/[id]/cancel/route.ts`, `src/app/api/orders/[id]/deliveries/route.ts`).
- No `Origin` or `CSRF-Token` header validation at the top of the route handler.
- Forms that submit to `/api/*` endpoints directly rather than invoking server actions.

**Prevention strategy:**
- The cleanest fix for this codebase: migrate form-submission API routes to server actions, which get automatic CSRF protection.
- If keeping API routes: add a middleware or route wrapper that checks the `Origin` header against the `Host` header for all `POST`/`PUT`/`DELETE` requests to `/api/*`.
- Alternatively, implement a double-submit cookie pattern: generate a CSRF token, set it in a non-`HttpOnly` cookie, and require the same value in a request header.

**Phase:** CSRF protection phase (first security hardening phase).

### 3.2 SameSite=Lax Is Not Sufficient for All Routes

**Pitfall:** The session cookie uses `sameSite: "lax"` (`src/server/auth/session.ts` line 104). This blocks cross-site `POST` requests from carrying the cookie, but it allows cross-site top-level navigations (GET requests with redirects). Routes like `/api/auth/consume` (`src/app/api/auth/consume/route.ts`) are `GET` handlers that perform state changes (creating sessions). An attacker can craft a link that navigates the victim to `/api/auth/consume?token=<attacker-token>`, logging the victim into the attacker's account.

**Warning signs:**
- `GET` API routes that perform mutations (consume magic link, dev payment completion).
- Session cookie set to `sameSite: "lax"` with no additional CSRF protection.

**Prevention strategy:**
- Magic link consume should use `POST` or require a nonce that binds to the original request's IP/fingerprint.
- The dev payment route (`src/app/api/payments/dev/complete/route.ts`) must not be a `GET` handler that mutates state.
- Add `Origin` header validation for any `GET` route that mutates state.

**Phase:** CSRF protection phase.

---

## 4. Race Condition Patterns

### 4.1 Check-Then-Act Without Database-Level Enforcement

**Pitfall:** Multiple places in this codebase do `findUnique` to check a condition, then `update` or `create` based on the result, without wrapping in a transaction. The payment ledger (`src/server/payments/ledger.ts` lines 62-75) and all order status transitions (`src/server/orders/service.ts` lines 272-458) have this pattern. Two concurrent requests pass the check, then both proceed to act.

**Warning signs:**
- Code pattern: `const existing = await find(); if (!existing) { await create(); }` without `$transaction`.
- Code pattern: `const order = await find(); if (order.status === EXPECTED) { await update(); }` without conditional update.
- No `updateMany({ where: { id, status: expected } })` pattern used anywhere.

**Prevention strategy:**
- For deduplication (ledger): wrap find+create in `$transaction` with serializable isolation, or catch the `P2002` unique constraint error and treat it as a duplicate. The unique constraint on `providerEventId` already exists -- just catch the error instead of letting it propagate.
- For state transitions: use `updateMany` with a `where` clause that includes the expected current state, and check `count === 1`. Example: `prisma.serviceOrder.updateMany({ where: { id, status: 'PENDING_PAYMENT' }, data: { status: 'IN_PROGRESS' } })`.
- For non-atomic admin operations (refund + dispute resolve in `src/app/admin/actions.ts` lines 158-171): wrap both calls in a single `$transaction`.

**Phase:** Data integrity fix phase (before or concurrent with auth hardening).

### 4.2 Refund Double-Spend from Non-Atomic Refund+Dispute

**Pitfall:** `refundDisputedOrder` in `src/app/admin/actions.ts` (lines 158-171) calls `requestRefund` then `resolveLatestOpenDisputeForOrder` as two separate operations. If the refund succeeds but dispute resolution fails, the dispute stays open. A retry would trigger a second refund.

**Warning signs:**
- Two mutating operations called sequentially outside a transaction.
- No idempotency check before the second attempt (e.g., "does a refund already exist for this dispute?").

**Prevention strategy:**
- Wrap both in `$transaction`. If that is infeasible (e.g., `requestRefund` calls an external Stripe API), add an idempotency guard: check for an existing refund on the dispute before calling the provider, and mark the dispute as "refund in progress" atomically before the Stripe call.

**Phase:** Data integrity fix phase.

### 4.3 Consultation-to-Order Race

**Pitfall:** `createServiceOrder` checks `consultationHasOrder` (line 232) then creates the order (line 236). Two requests for the same consultation can both see "no order exists" and create two orders. The `createOrderForConsultation` does use a transaction (line 110), but the check happens outside the transaction.

**Warning signs:**
- `consultationHasOrder` check is separate from the transaction that creates the order.
- No unique constraint on `ServiceOrder.consultationId` that would catch duplicates at the database level.

**Prevention strategy:**
- Add a unique constraint on `ServiceOrder.consultationId` (or a partial unique index allowing multiple orders per consultation if that is intended business logic).
- Move the "has order" check into the same transaction as the order creation.

**Phase:** Data integrity fix phase.

---

## 5. Rate Limiting Circumvention

### 5.1 Rate Limiting by IP Only When Behind a Reverse Proxy

**Pitfall:** Next.js deployed on Vercel or behind a CDN receives requests from a small number of proxy IPs. If rate limiting uses `request.ip` or socket address, all users share the same rate limit bucket and legitimate users get blocked.

**Warning signs:**
- Rate limiting middleware uses `req.socket.remoteAddress` directly.
- No `X-Forwarded-For` header parsing.
- No distinction between trusted proxy IPs and direct connections.

**Prevention strategy:**
- Use a rate limiting library that supports trusted proxy configuration (e.g., `rate-limiter-flexible` with `trustProxy: true`).
- Rate limit by user ID for authenticated endpoints (session-based) and by IP for unauthenticated endpoints.
- For the magic link endpoint specifically: rate limit per email address to prevent inbox flooding, but also per IP to prevent enumeration of valid emails.

**Phase:** Rate limiting implementation phase.

### 5.2 Rate Limiting the Webhook Endpoint Without Stripe Replay Protection

**Pitfall:** Adding rate limiting to `/api/payments/webhook` (`src/app/api/payments/webhook/route.ts`) without understanding that Stripe retries failed webhooks with exponential backoff. If the rate limit is too aggressive, legitimate payment confirmations get blocked, leaving orders stuck in `PENDING_PAYMENT`.

**Warning signs:**
- Webhook endpoint returns 429 to Stripe.
- No distinction between rate-limited public endpoints and provider webhooks.

**Prevention strategy:**
- Do NOT rate limit webhook endpoints from trusted providers. Instead, verify the webhook signature (already done via `adapter.parseWebhook`) and rely on deduplication.
- If rate limiting is required for cost reasons, set the limit high enough to accommodate Stripe's retry schedule (Stripe retries up to 3 days with exponential backoff).

**Phase:** Rate limiting implementation phase.

### 5.3 Rate Limiting State in Memory Lost on Serverless Cold Start

**Pitfall:** Next.js on Vercel runs in serverless functions. In-memory rate limiting (e.g., an in-process Map) resets on every cold start. An attacker can bypass limits by timing requests to hit different cold starts.

**Warning signs:**
- Rate limiting uses a plain JavaScript `Map` or `lru-cache` with no external store.
- No Redis, database, or distributed rate limit store configured.

**Prevention strategy:**
- Use an external store for rate limit counters: Redis (via Upstash for serverless), or database-backed counters.
- If using Vercel KV or Upstash Redis, ensure the rate limiter uses the `GET` + `INCR` pattern with TTL.
- For a marketplace with moderate traffic, a simple database table with `(key, count, windowStart)` and periodic cleanup is sufficient.

**Phase:** Rate limiting implementation phase.

---

## 6. Session Fixation and Session Management

### 6.1 No Session Rotation on Login

**Pitfall:** The current magic link flow creates a new session on each login (`src/server/auth/magic-link.ts` line 124) but does not invalidate previous sessions. A user who logs in from a new device still has their old session active. This is not session fixation per se, but it means there is no way to force logout from other devices.

**Warning signs:**
- `createSession` in `src/server/auth/session.ts` (line 116) never deletes existing sessions for the user.
- No "logout all devices" functionality exists.
- No limit on concurrent sessions per user.

**Prevention strategy:**
- Add a session limit per user (e.g., max 5 concurrent sessions, delete oldest on new login).
- Implement a logout endpoint that deletes the specific session and clears the cookie.
- On privilege escalation (user becomes creator/admin), invalidate all other sessions.

**Phase:** Session hardening (can be deferred to post-launch but must exist before multi-tenant admin).

### 6.2 Session Cookie Not Regenerated After Privilege Change

**Pitfall:** `requireAdmin` in `src/server/auth/session.ts` (line 164) checks the user's email against `ADMIN_EMAILS` on every request. But `requireCreator` (line 155) checks `whitelistStatus` which is stored in the database and read fresh via `getCurrentSession` -> `prisma.session.findUnique({ include: { user: true } })`. This means admin checks are live, but the session cookie itself never changes. If the session token is stolen before an admin action, the attacker retains admin access until the session expires (30 days).

**Warning signs:**
- No session invalidation when `activateCreatorWhitelist` is called (`src/app/admin/actions.ts` line 18).
- 30-day session lifetime with no renewal mechanism.

**Prevention strategy:**
- Invalidate all sessions for a user when their role or whitelist status changes.
- Reduce session lifetime for admin sessions or add a separate admin session with shorter TTL.
- Consider adding a `session.version` that increments on privilege changes and is checked on each request.

**Phase:** Auth hardening phase, specifically when implementing role changes.

### 6.3 Magic Link Token Usable Multiple Times Before Expiry

**Pitfall:** `consumeMagicLink` in `src/server/auth/magic-link.ts` (line 101) uses `updateMany` with `consumedAt: null` to atomically claim the token, which is correct. However, between the token being consumed and the user seeing the redirect, the token is technically consumed but no session cookie is set yet (the cookie is set after the transaction on line 134). If the redirect fails, the user has a consumed token but no session.

**Warning signs:**
- Token consumed in transaction (line 102-108) but cookie set after transaction (line 134).
- Rollback logic exists (lines 141-157) but is best-effort and could fail.

**Prevention strategy:**
- The existing transaction-based consume + rollback pattern is sound. Test the rollback path explicitly.
- Consider setting the cookie inside the transaction response path to minimize the window between consume and cookie-set.

**Phase:** Existing pattern is acceptable; add tests for the rollback path during testing phase.

---

## 7. Open Redirect Vulnerabilities

### 7.1 Magic Link Consume Redirects to Hardcoded Path

**Pitfall:** `src/app/api/auth/consume/route.ts` (line 22) redirects to `/creator` after successful login. This is safe because it is hardcoded. However, when adding OAuth, the common pattern is to redirect to a `returnTo` query parameter. If `returnTo` is not validated, this becomes an open redirect: `https://yourapp.com/api/auth/callback?returnTo=https://evil.com`.

**Warning signs:**
- OAuth callback route reads a `redirect` or `returnTo` parameter from the URL.
- No validation that the redirect target is a same-origin path.

**Prevention strategy:**
- Only allow relative URLs starting with `/` (no protocol, no `//` prefix).
- Maintain an allowlist of post-login paths.
- Never redirect to a full URL from user input.

**Phase:** OAuth implementation phase.

### 7.2 Error Redirect Leaking Internal State

**Pitfall:** `src/app/api/auth/request-link/route.ts` (line 12) redirects to `/login?error=${error.code}`. The error codes (`invalid-email`, `invalid-token`) are safe. But the catch-all on line 14 throws the raw error, which in development could expose internal details in the Next.js error overlay.

**Warning signs:**
- `throw error` in a catch block where the error originates from the database or internal services.
- Error messages like `PrismaClientKnownRequestError` reaching the user.

**Prevention strategy:**
- In production, catch all errors and redirect to a generic error page. Never throw raw internal errors from API routes.
- Use a consistent error response pattern (JSON for API routes, redirect for form submissions).

**Phase:** Error handling standardization phase.

---

## 8. File Upload and Delivery Security

### 8.1 MIME Type Spoofing on Delivery Uploads

**Pitfall:** `src/app/api/orders/[id]/deliveries/route.ts` accepts any file type (line 26 checks only that a file exists). An attacker could upload an HTML file with embedded JavaScript. When another user downloads the delivery, if the storage provider does not set `Content-Disposition: attachment` or `Content-Type` headers correctly, the browser may render the HTML and execute XSS.

**Warning signs:**
- No file type allowlist in the delivery upload route.
- No `Content-Type` validation beyond file extension.
- Download endpoint does not force `Content-Disposition: attachment`.

**Prevention strategy:**
- Validate file extensions and MIME types against an allowlist.
- Set `Content-Type: application/octet-stream` and `Content-Disposition: attachment` on all download responses.
- For the agent ZIP upload, the existing `zip-validator.ts` is sufficient but should also check that the ZIP does not contain files with dangerous extensions (`.html`, `.js`, `.svg` at the top level).

**Phase:** File handling hardening phase.

### 8.2 Download Ticket Forgery via Hardcoded Secret

**Pitfall:** `src/server/storage/download-tickets.ts` (lines 24-25) falls back to `"dev-download-ticket-secret"` if `DOWNLOAD_TICKET_SECRET` is not set. In production, a missing env var means anyone can forge download tickets.

**Warning signs:**
- `process.env.SECRET ?? "fallback"` pattern in security-critical code.
- No startup validation that the secret is set in production.

**Prevention strategy:**
- Add a startup check: `if (NODE_ENV === "production" && !process.env.DOWNLOAD_TICKET_SECRET) throw new Error("FATAL: DOWNLOAD_TICKET_SECRET required")`.
- This is already identified as a requirement in PROJECT.md but is listed here because the pitfall is "forgetting the startup check during deployment configuration."

**Phase:** Environment variable validation phase (early phase, before production deploy).

---

## 9. Authorization Bypass Patterns

### 9.1 requireCreator Checks Whitelist But Not Role

**Pitfall:** `requireCreator()` (`src/server/auth/session.ts` line 155) checks `whitelistStatus === ACTIVE` but does not check `role === CREATOR`. An admin whose `whitelistStatus` is also `ACTIVE` passes this check. While the admin whitelist action (`activateCreatorWhitelist`) sets both `role: CREATOR` and `whitelistStatus: ACTIVE`, any manual database edit or future code path that sets `whitelistStatus` without `role` creates a bypass.

**Warning signs:**
- Authorization check does not match the conceptual role model.
- Two fields (`role` and `whitelistStatus`) encode the same permission, creating ambiguity.

**Prevention strategy:**
- Add `role === CREATOR` to the `requireCreator()` check.
- Consider whether `whitelistStatus` should be merged into `role` or made a separate concern (e.g., a creator can have `role: CREATOR` but `whitelistStatus: PENDING`).

**Phase:** Auth hardening phase (early, as it affects all creator routes).

### 9.2 Order Routes Check Buyer Identity by Email, Not User ID

**Pitfall:** `src/app/api/orders/[id]/cancel/route.ts` (line 23) verifies the user owns the order by comparing `order.buyerEmail.toLowerCase() !== user.email.toLowerCase()`. This works for magic-link-only auth where email is the primary identity. But when OAuth is added, a user could have multiple emails or change their email. The comparison breaks silently.

**Warning signs:**
- Authorization check uses email comparison instead of user ID.
- `buyerEmail` on orders is a separate field from `buyerUserId`, and the latter can be `null`.

**Prevention strategy:**
- When adding OAuth, ensure orders always store `buyerUserId` (not just `buyerEmail`).
- Change authorization checks from email comparison to user ID comparison.
- Keep `buyerEmail` for display and notification purposes only.

**Phase:** Password + OAuth implementation phase (must be fixed before OAuth ships).

---

## 10. Production Deployment Traps

### 10.1 Dev Adapters Active in Production

**Pitfall:** The codebase has a `dev-mailer.ts` that writes emails to a `.jsonl` file and a `dev/complete` payment route. Both are active regardless of `NODE_ENV`. In production, magic link emails silently write to disk instead of being sent, and anyone can mark orders as paid.

**Warning signs:**
- No `NODE_ENV` guard in `src/server/mail/dev-mailer.ts`.
- No `NODE_ENV` guard in `src/app/api/payments/dev/complete/route.ts`.
- Missing production email adapter.

**Prevention strategy:**
- Add `if (process.env.NODE_ENV === "production") throw new Error("Dev mailer cannot be used in production")` at the top of the dev mailer.
- Guard the dev payment route with `if (process.env.NODE_ENV !== "development") return 404`.
- Implement a production email adapter (SendGrid, Resend, or similar) before any production deploy.

**Phase:** Environment validation phase (blocking for production).

### 10.2 Missing middleware.ts Means No Defense-in-Depth

**Pitfall:** There is no `src/middleware.ts` file. This means there is no centralized place to enforce authentication checks, rate limiting, or security headers. Every route must remember to call `getCurrentUser()` independently. A single forgotten check exposes an endpoint.

**Warning signs:**
- Auth checks are scattered across individual route handlers.
- No security headers (CSP, HSTS, X-Frame-Options) applied globally.
- No request-level logging or monitoring.

**Prevention strategy:**
- Add a `middleware.ts` that applies security headers to all responses.
- Use the matcher pattern to enforce auth on protected route prefixes (e.g., `/creator/*`, `/admin/*`, `/api/creator/*`).
- Keep per-route auth checks as defense-in-depth, but middleware provides the safety net.

**Phase:** Security hardening phase (add middleware early to establish the pattern).

---

## Summary by Phase

| Phase | Pitfalls to Address | Priority |
|-------|-------------------|----------|
| **Environment Validation** | 10.1 dev adapters, 10.2 missing middleware, 8.2 ticket secret | Blocking for production |
| **CSRF Protection** | 3.1 API route confusion, 3.2 SameSite=Lax gaps | High |
| **Data Integrity** | 4.1 check-then-act, 4.2 refund double-spend, 4.3 consultation race | High |
| **Password Auth** | 2.1 hashing algorithm, 2.2 server-side only, 2.3 timing attacks | High |
| **OAuth Implementation** | 1.1 user creation race, 1.2 session invalidation, 1.3 state parameter, 1.4 email verification, 7.1 open redirect | High |
| **Rate Limiting** | 5.1 proxy IP, 5.2 webhook exclusion, 5.3 serverless state | Medium |
| **Auth Hardening** | 6.1 session rotation, 6.2 privilege change, 9.1 requireCreator, 9.2 email vs ID | Medium |
| **File Handling** | 8.1 MIME type spoofing | Medium |
| **Testing** | Tests for all race conditions, CSRF bypass attempts, OAuth flow edge cases | Continuous |

---

*Generated from codebase analysis on 2026-05-05. Re-evaluate after each phase implementation.*
