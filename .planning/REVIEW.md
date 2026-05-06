---
status: findings_found
phase: all
depth: standard
files_reviewed: 33
critical: 5
warning: 11
info: 6
total: 22
reviewed_at: 2026-05-05
---

# Code Review: Security Hardening Milestone (All Phases)

## Critical

### CR-1. Registration race condition — duplicate user (TOCTOU)
- **File:** `src/app/api/auth/register/route.ts:29-37`
- `findUnique` then `create` is not atomic. Two concurrent registrations with the same email both pass the check, causing unhandled P2002 → 500 leak.
- **Fix:** Catch P2002 on `prisma.user.create` and return 409.

### CR-2. OAuth account takeover via email-upsert race
- **File:** `src/server/auth/oauth.ts:34-54`
- Attacker creates password account for victim's email, then starts OAuth flow with same email. The `upsert` on `update` branch silently links attacker's OAuth to victim's account.
- **Fix:** Wrap in `$transaction`. Verify no existing `OAuthAccount` for a different user before linking.

### CR-3. CSRF bypass on non-POST API routes
- **File:** `src/middleware.ts:105-107`
- Only POST requests get CSRF origin verification. PUT/PATCH/DELETE have no protection.
- **Fix:** Extend CSRF check to POST, PUT, PATCH, DELETE methods.

### CR-4. Dev payment adapter usable in production
- **File:** `src/server/payments/dev-adapter.ts`, `src/server/payments/adapter.ts:59-72`
- If `PAYMENT_PROVIDER=dev` in production, webhooks have zero authentication. Anyone can forge payment events.
- **Fix:** Block dev adapter when `NODE_ENV === "production"` in `getPaymentAdapter`.

### CR-5. Missing authorization on dispute resolution
- **File:** `src/server/orders/service.ts` — `resolveDisputedServiceOrder`
- `nextStatus` input is typed but no role check (admin/provider only) at the service layer. Any caller can resolve disputes.
- **Fix:** Add authorization check or ensure all call sites enforce it.

## Warning

### WR-1. Rate limiter memory leak — unbounded Map
- **File:** `src/server/rate-limit.ts:12-49`
- Expired keys are never cleaned up. Map grows without bound over time.
- **Fix:** Add periodic cleanup of expired entries.

### WR-2. Login rate limiter increments on success too
- **File:** `src/app/api/auth/login/route.ts:40-42`
- `rateLimiter.check()` increments counter regardless of outcome. A successful login consumes a rate-limit slot, reducing available attempts.
- **Fix:** Only increment on failure, or use check-only + conditional increment pattern.

### WR-3. No rate limiting for non-existent emails
- **File:** `src/app/api/auth/login/route.ts:29-32`
- If email doesn't exist, rate limiter is never checked. Enables email enumeration.
- **Fix:** Apply IP-based rate limiting before user lookup.

### WR-4. `email_verified ?? true` defaults to true for Google OAuth
- **File:** `src/server/auth/oauth-google.ts:67`
- If Google omits `email_verified`, defaults to `true`, bypassing verification gate.
- **Fix:** Use `userinfo.email_verified === true` (default to false).

### WR-5. GitHub OAuth missing PKCE
- **File:** `src/server/auth/oauth-github.ts`
- Google uses PKCE but GitHub doesn't. Authorization code is more vulnerable to interception.
- **Fix:** Add PKCE to GitHub OAuth flow.

### WR-6. Audit log skipped on ConcurrentModificationError
- **File:** `src/server/payments/adapter.ts:134-173`
- When CME is caught, the audit log at line 175 is skipped. Payment transitions occur without audit trail.
- **Fix:** Move audit log before the catch or add separate audit entry.

### WR-7. No file size limit on agent upload
- **File:** `src/app/api/creator/agents/route.ts:34-50`
- Unlike delivery uploads (25MB limit), agent ZIP upload has no size check. Memory exhaustion risk.
- **Fix:** Add `MAX_AGENT_FILE_BYTES` check before reading into buffer.

### WR-8. request-link passes un-normalized email
- **File:** `src/app/api/auth/request-link/route.ts:8-15`
- `normalizedEmail` used for rate limiting but original `email` passed to `requestMagicLink`. Rate limit can be bypassed by varying whitespace/casing.
- **Fix:** Pass `normalizedEmail` to `requestMagicLink`.

### WR-9. Webhook timestamp check is optional
- **File:** `src/app/api/payments/webhook/route.ts:17-26`
- Events without `timestamp` field skip staleness check entirely.
- **Fix:** Require timestamp for known providers or reject events without timestamps.

### WR-10. Duplicate DB query in pay route
- **File:** `src/app/api/orders/[id]/pay/route.ts` + `src/server/payments/adapter.ts:75-93`
- Order fetched in route, then fetched again inside `createPaymentSessionForOrder`.
- **Fix:** Pass already-fetched order to adapter function.

### WR-11. OAuth tokens in schema (dead code, plaintext risk)
- **File:** `prisma/schema.prisma:135-137`
- `accessToken`/`refreshToken` fields exist but are never populated. If future code stores tokens, they'll be plaintext.
- **Fix:** Remove unused fields or implement encryption before populating.

## Info

### I-1. `SlidingWindowCounter` is actually fixed-window
- **File:** `src/server/rate-limit.ts`
- Named "sliding window" but implements fixed-window. Burst of 2x at boundary.
- Rename for accuracy.

### I-2. Missing HSTS and CSP headers
- **File:** `src/middleware.ts:14-19`
- `SECURITY_HEADERS` omits `Strict-Transport-Security` and `Content-Security-Policy`.

### I-3. Inconsistent error message language
- Some messages Chinese (`"订单已创建"`), others English.
- Pick one language or use i18n keys.

### I-4. `Resend` client created per email
- **File:** `src/server/mail/resend-mailer.ts:9`
- Instantiate once at module scope.

### I-5. `paymentStatusFromEventType` has no default branch
- **File:** `src/server/payments/webhook-events.ts:36-45`
- Add `default` that throws for unknown types.

### I-6. `toggleAgentPackageFavorite` not atomic
- **File:** `src/server/agents/product-service.ts:9-42`
- Read-then-write under concurrent requests could create duplicate favorites. Use `upsert`.

---

*Reviewed: 2026-05-05*
*Depth: standard*
*Scope: All phases (33 source files)*
