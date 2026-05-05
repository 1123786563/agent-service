# Roadmap: Hermes Agent Marketplace — Security Hardening

**Created:** 2026-05-05
**Total Phases:** 4
**Total Requirements:** 25

## Phase Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Critical Security Fixes | Close all active vulnerabilities with zero schema changes; all fixes are standalone and parallelizable | SEC-01, SEC-02, SEC-07, SEC-08, DATA-01, DATA-02, AUTH-04 | Dev payment route returns 403 in production; consultation endpoint requires auth; missing env vars fail-fast at startup; requireCreator enforces role check; refunds are atomic; payment ledger handles duplicates gracefully; users can log out |
| 2 | Input Validation & Access Control | Establish middleware pattern (CSRF + rate limiting); harden all mutation endpoints before new auth methods expand attack surface | SEC-03, SEC-04, SEC-05, SEC-06, DATA-03, DATA-04, DATA-05 | All POST routes reject requests with mismatched Origin; rate limiting protects auth/consultation/upload/webhook endpoints; oversized and wrong-type uploads are rejected; order status transitions are atomic; duplicate reviews are prevented; consultation-to-order race is fixed |
| 3 | Authentication Expansion | Add password login and OAuth providers; ship production email; prepare for multi-email accounts via schema migration | AUTH-01, AUTH-02, AUTH-03, AUTH-05, AUTH-06 | Users register and login with email+password (Argon2id); Google OAuth flow completes with PKCE; GitHub OAuth flow completes; production emails are sent via Resend; order routes verify buyer by user ID |
| 4 | Security Hardening & Polish | Add defense-in-depth: session revocation, audit logging, security headers, account lockout, webhook hardening, CSP | HARD-01, HARD-02, HARD-03, HARD-04, HARD-05, HARD-06, SESS-01 | Sessions invalidated on role change; auth events logged; security headers on all responses; accounts locked after N failed attempts; stale webhooks rejected; CSP whitelists OAuth domains; expired sessions cleaned up |

---

## Phase 1: Critical Security Fixes

**Goal:** Close all active vulnerabilities that block production deployment — no schema changes, all fixes standalone and parallelizable.
**Requirements:** SEC-01, SEC-02, SEC-07, SEC-08, DATA-01, DATA-02, AUTH-04
**Dependencies:** None
**Complexity:** Medium

### Success Criteria
1. `GET /api/payments/dev/complete` returns 403 when `NODE_ENV=production` or when user is not an admin
2. `POST /api/consultations` returns 401 for unauthenticated requests; spam with arbitrary emails is blocked
3. Application fails to start in production when any required env var (DATABASE_URL, APP_URL, DOWNLOAD_TICKET_SECRET, STRIPE_*, ADMIN_EMAILS) is missing, with a clear error message naming the missing variable
4. `requireCreator()` rejects users whose role is not CREATOR, even if they are on the whitelist
5. Refund + dispute resolution executes atomically within a `$transaction`; double-refund scenario is impossible
6. Payment ledger `recordPaymentEvent` catches Prisma P2002 unique constraint errors and treats them as idempotent duplicates
7. Users can log out: session row deleted, cookie cleared, subsequent authenticated requests return 401

### Plans
- Plan 1: Guard dev payment route — covers SEC-01. Add `NODE_ENV !== 'production'` check and admin auth requirement to `GET /api/payments/dev/complete`.
- Plan 2: Add auth to consultation endpoint — covers SEC-02. Require authenticated session for `POST /api/consultations`.
- Plan 3: Production env var validation — covers SEC-07. Add startup validation hook (instrumentation.ts) that checks all required env vars and fail-fast with descriptive error.
- Plan 4: Fix requireCreator role check — covers SEC-08. Add `role === CREATOR` check to `requireCreator()` function.
- Plan 5: Atomic refund + dispute resolution — covers DATA-01. Wrap refund and dispute resolution in a Prisma `$transaction` with idempotency guard before Stripe call.
- Plan 6: Handle payment ledger race condition — covers DATA-02. Catch P2002 on `recordPaymentEvent` and return existing record instead of throwing.
- Plan 7: Add logout functionality — covers AUTH-04. Create logout endpoint that deletes session from DB and clears session cookie.

---

## Phase 2: Input Validation & Access Control

**Goal:** Establish the middleware defense layer (CSRF + rate limiting); harden all state-changing endpoints against abuse before Phase 3 adds new auth methods.
**Requirements:** SEC-03, SEC-04, SEC-05, SEC-06, DATA-03, DATA-04, DATA-05
**Dependencies:** Phase 1 (critical vulnerabilities must be closed first; some fixes share code paths)
**Complexity:** High

### Success Criteria
1. Any POST request to `/api/*` with an Origin header that does not match `APP_URL` is rejected with 403; Stripe webhook (validated by signature) and OAuth callbacks (validated by state/PKCE) are exempt
2. Rate limiting protects authentication endpoints (per-email), consultation endpoints (per-user), upload endpoints (per-user), and webhook endpoints (per-IP); in-memory sliding window with interface ready for Redis backend
3. File uploads exceeding 25MB are rejected with 413; file types outside the whitelist (ZIP, PDF, images, etc.) are rejected with 415
4. Concurrent order status transitions are handled atomically — `updateMany` with expected-status `where` clause prevents race conditions
5. Submitting a second review for the same agent package by the same user returns 409 Conflict
6. Two concurrent consultation-to-order attempts for the same consultation result in only one order; second attempt is handled gracefully

### Plans
- Plan 1: CSRF Origin verification middleware — covers SEC-03. Create middleware.ts with Origin header validation for all `/api/*` POST routes; exempt Stripe webhook, OAuth callbacks, and unauthenticated auth routes.
- Plan 2: Rate limiting infrastructure — covers SEC-04. Add sliding-window rate limiter (Map-based, interface extensible to Upstash Redis); apply IP-based limits globally and per-route limits keyed by email/user ID.
- Plan 3: File upload validation — covers SEC-05, SEC-06. Add file size check (25MB limit) and file type whitelist validation to delivery upload endpoints.
- Plan 4: Atomic order status transitions — covers DATA-03. Refactor order state changes to use `updateMany` with conditional `where` clause for optimistic concurrency control.
- Plan 5: Duplicate review prevention — covers DATA-04. Add `(agentPackageId, userId)` unique constraint and handle P2002 gracefully.
- Plan 6: Fix consultation-to-order race — covers DATA-05. Add unique constraint on `ServiceOrder.consultationId` or wrap check+create in transaction.

---

## Phase 3: Authentication Expansion

**Goal:** Add password-based login and OAuth (Google + GitHub) alongside existing magic link; ship production email; prepare data model for multi-email accounts via additive schema migration.
**Requirements:** AUTH-01, AUTH-02, AUTH-03, AUTH-05, AUTH-06
**Dependencies:** Phase 2 (middleware pattern with CSRF + rate limiting must exist before adding new auth endpoints)
**Complexity:** High

### Success Criteria
1. Users can register with email + password; passwords are hashed with Argon2id; login creates a session via the existing `createSession()` function
2. Google OAuth flow completes end-to-end: user clicks "Sign in with Google", authorizes, callback exchanges code with PKCE, user is created/upserted by email, session established
3. GitHub OAuth flow completes end-to-end using shared OAuth infrastructure; GitHub emails are verified before account linking (prevents email takeover)
4. Production emails (magic links, etc.) are sent via Resend adapter following the existing dev-mailer adapter pattern; dev-mailer remains active only in development
5. Order routes verify buyer identity by `userId` from session, not by email address — ready for users with multiple OAuth-linked emails

### Plans
- Plan 1: Password authentication — covers AUTH-01. Add `passwordHash` (nullable) to User model via migration; create `src/server/auth/password.ts` with Argon2id hashing; add registration and login endpoints; all converge on `createSession()`.
- Plan 2: Google OAuth — covers AUTH-02. Create `OAuthAccount` model; create `src/server/auth/oauth-google.ts` with PKCE flow via Arctic library; state stored in httpOnly cookie; user upserted by email with P2002 catch.
- Plan 3: GitHub OAuth — covers AUTH-03. Create `src/server/auth/oauth-github.ts` reusing OAuth infrastructure from Plan 2; verify `email_verified` from GitHub profile before linking.
- Plan 4: Production email (Resend) — covers AUTH-05. Create Resend adapter following existing dev-mailer pattern; activate based on `NODE_ENV`; keep dev-mailer for development.
- Plan 5: Buyer identity by user ID — covers AUTH-06. Refactor order routes to verify buyer by `userId` from session instead of email; update queries and tests.

---

## Phase 4: Security Hardening & Polish

**Goal:** Add defense-in-depth layers — session lifecycle management, audit logging, security headers, account lockout, webhook hardening, and Content Security Policy.
**Requirements:** HARD-01, HARD-02, HARD-03, HARD-04, HARD-05, HARD-06, SESS-01
**Dependencies:** Phase 2 (middleware must exist for security headers); Phase 3 (auth audit logging needs multiple auth methods to be valuable; account lockout depends on password auth + rate limiting)
**Complexity:** Medium

### Success Criteria
1. When a user's role or whitelist status changes, all their sessions are deleted from the database — subsequent requests require re-authentication
2. Authentication events (login, registration, password change, OAuth link, failed login) are written to the audit log with timestamp, user ID, event type, and IP address
3. All responses include security headers: X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy: camera=(), microphone=(), geolocation=()
4. After N consecutive failed password attempts, the account is locked for a configurable duration; lockout resets on successful login
5. Stripe webhook events with timestamps older than 5 minutes are rejected with 400; prevents replay attacks
6. Content Security Policy whitelists Google OAuth, GitHub OAuth, and Stripe domains; no inline scripts except where explicitly necessary
7. Expired sessions and magic link tokens are cleaned up on a scheduled basis; no stale data accumulates

### Plans
- Plan 1: Session revocation on privilege change — covers HARD-01. Hook into role/whitelist update operations to delete all sessions for the affected user.
- Plan 2: Auth audit logging — covers HARD-02. Add structured logging for all auth events to the existing audit log system; include event type, user ID, IP, and timestamp.
- Plan 3: Security headers middleware — covers HARD-03. Add security headers to middleware.ts response pipeline.
- Plan 4: Account lockout — covers HARD-04. Track failed login attempts per user; lock account after N failures; integrate with rate limiting from Phase 2.
- Plan 5: Webhook timestamp validation — covers HARD-05. Validate Stripe event timestamp is within 5 minutes before processing.
- Plan 6: Content Security Policy — covers HARD-06. Define CSP with whitelisted domains for Google, GitHub, and Stripe; deploy via middleware.ts header.
- Plan 7: Session and token cleanup — covers SESS-01. Create `src/server/auth/cleanup.ts` to delete expired sessions and magic link tokens; run on schedule.

---

*Roadmap created: 2026-05-05*
*Total requirements: 25 (v1) + 3 (v2 deferred) = 28*
*v1 coverage: 25/25 mapped across 4 phases*
