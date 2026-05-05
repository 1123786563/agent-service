# Phase 1: Critical Security Fixes - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Close all 7 active security vulnerabilities that block production deployment. Zero schema changes, all fixes standalone and parallelizable. No new capabilities — only hardening existing endpoints and flows.

**In scope:**
- SEC-01: Guard dev payment route (NODE_ENV + admin auth)
- SEC-02: Add auth to consultation creation
- SEC-07: Production env var validation at startup
- SEC-08: requireCreator role check
- DATA-01: Atomic refund + dispute resolution
- DATA-02: Payment ledger race condition
- AUTH-04: Logout functionality

**Out of scope:**
- CSRF protection (Phase 2)
- Rate limiting (Phase 2)
- File validation (Phase 2)
- Password/OAuth auth (Phase 3)
- Security headers/CSP (Phase 4)

</domain>

<decisions>
## Implementation Decisions

### Refund Atomicity (DATA-01)
- **D-01:** Use state machine pattern for refund + dispute resolution
  - Refund step creates a PENDING refund record in DB first
  - Then calls Stripe (external, non-transactional)
  - Dispute resolution checks for PENDING refund and marks it COMPLETED atomically
  - This makes the flow idempotent: retrying the dispute resolution is safe because it checks refund state
  - If Stripe call fails after PENDING record, the record stays PENDING (not COMPLETED) — can be retried or manually resolved

### Environment Variable Validation (SEC-07)
- **D-02:** Use `instrumentation.ts` as the sole validation point
  - Next.js official startup hook — runs once when server starts
  - Only validate in production (`NODE_ENV === "production"`)
  - Fail fast with `process.exit(1)` and descriptive error message
  - Validate: DATABASE_URL, APP_URL, DOWNLOAD_TICKET_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (when PAYMENT_PROVIDER=stripe), S3_* (when STORAGE_PROVIDER=s3), ADMIN_EMAILS
  - Use Zod schema for type-safe validation (already a dependency)

### Logout UX (AUTH-04)
- **D-03:** Add logout button inline on the account orders page (`/account/orders`)
  - No new navigation bar — minimal UI change
  - Server action (not API route) — benefits from built-in CSRF protection
  - Delete session record from DB, clear session cookie
  - Redirect to home page after logout

### Claude's Discretion
- SEC-01 (dev route guard): Add `NODE_ENV !== 'production'` check + `requireAdmin()` call. ~5 lines.
- SEC-02 (consultation auth): Add `getCurrentUser()` at top of handler, return 401 if null. ~3 lines.
- SEC-08 (requireCreator role): Add `role === CREATOR` to the guard condition. ~1 line. Verify no admin flows depend on passing requireCreator.
- DATA-02 (ledger race): Wrap `create` in try/catch, catch P2002 on `providerEventId`, return duplicate result. ~10 lines.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current Implementation (must read)
- `src/app/api/payments/dev/complete/route.ts` — Dev payment route to guard (SEC-01)
- `src/app/api/consultations/route.ts` — Consultation endpoint needing auth (SEC-02)
- `src/app/admin/actions.ts` lines 158-171 — Non-atomic refund + dispute (DATA-01)
- `src/server/payments/ledger.ts` lines 58-98 — Payment ledger with race condition (DATA-02)
- `src/server/auth/session.ts` line 155-162 — requireCreator needing role check (SEC-08)
- `src/app/account/orders/page.tsx` — Account page for logout button (AUTH-04)
- `prisma/schema.prisma` — Database schema (refund records, session model)

### Architecture Context
- `.planning/codebase/ARCHITECTURE.md` — Service layer patterns, data flow, dependency injection
- `.planning/codebase/CONCERNS.md` — All 31 identified issues with file/line references
- `.planning/research/SUMMARY.md` — Research findings and recommended approaches

### Pattern References
- `src/server/payments/dev-adapter.ts` — Adapter pattern example
- `src/server/auth/magic-link.ts` — Transaction + rollback pattern (template for refund state machine)
- `src/app/creator/actions.ts` — Server action pattern (template for logout action)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createSession()` / `deleteSession()` in `session.ts` — session management functions already exist; logout just needs to call `deleteSession()`
- `getCurrentUser()` / `requireAdmin()` in `session.ts` — auth guard functions to reuse for SEC-01 and SEC-02
- `$transaction` pattern in `magic-link.ts` — atomic verify-and-create pattern to adapt for refund state machine
- `defaultDeps` / `Store` interface pattern — used across all services for testability; new code should follow this

### Established Patterns
- Server actions use `"use server"` + `FormData` + `revalidatePath()` — logout should follow this
- API routes use named exports (`GET`, `POST`) — existing pattern for route handlers
- Error responses: JSON `{ errors: string[] }` for API routes, redirect with error param for form submissions
- Dependency injection: every service accepts optional `deps`/`store` parameter with typed interface

### Integration Points
- `src/server/auth/session.ts` — logout needs new `deleteSessionByToken()` function
- `src/app/admin/actions.ts` — refund state machine modifies `refundDisputedOrder` action
- `src/server/payments/ledger.ts` — P2002 catch goes in `recordPaymentEvent`
- `instrumentation.ts` — new file at project root for startup validation

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the decisions above — standard security hardening approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Critical Security Fixes*
*Context gathered: 2026-05-05*
