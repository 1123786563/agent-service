# Phase 2: Input Validation & Access Control - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the middleware defense layer (CSRF + rate limiting); harden all state-changing endpoints against abuse before Phase 3 adds new auth methods; fix data integrity race conditions.

**In scope:**
- SEC-03: CSRF Origin verification for all `/api/*` POST routes
- SEC-04: Rate limiting for auth, consultation, upload, webhook endpoints
- SEC-05: File upload size validation (25MB limit)
- SEC-06: File upload type whitelist validation
- DATA-03: Atomic order status transitions via updateMany
- DATA-04: Duplicate review prevention via unique constraint
- DATA-05: Consultation-to-order race condition fix

**Out of scope:**
- Password/OAuth auth (Phase 3)
- Security headers/CSP (Phase 4)
- Session revocation (Phase 4)
- Audit logging (Phase 4)

</domain>

<decisions>
## Implementation Decisions

### CSRF Middleware Architecture
- **D-01:** Use Next.js `middleware.ts` (Edge Runtime) for CSRF Origin verification
  - Single entry point for all `/api/*` POST route protection
  - No changes to individual route handler code needed
  - Exempt routes: Stripe webhook (`/api/payments/webhook` — validated by signature), OAuth callbacks (validated by state/PKCE)
  - Do NOT protect unauthenticated routes (`/api/auth/request-link`) — no session to forge
- **D-02:** Origin matching: allow APP_URL + subdomains
  - Parse Origin header and compare against `APP_URL` env var
  - Allow requests where Origin matches APP_URL hostname or any subdomain
  - Requests with no Origin header (API clients, curl) — reject in production, allow in development

### Rate Limiting
- **D-03:** Merge rate limiting into `middleware.ts` alongside CSRF
  - Single middleware handles both CSRF check + rate limit check
  - Reduces middleware layers and request processing overhead
- **D-04:** Global default limit + per-route overrides for special endpoints
  - Default: reasonable global limit (e.g., 60 requests/minute per IP)
  - Auth endpoints (`/api/auth/request-link`): per-email keying, stricter limit
  - Upload endpoints: per-user keying, lower limit
  - Webhook endpoint: per-IP keying, higher limit
- **D-05:** Rate limit exceeded response: 429 + `Retry-After` header + `{ errors: ["Rate limited"] }`
  - Consistent with existing JSON error format
  - `Retry-After` header for programmatic client handling
- **D-06:** In-memory sliding window implementation (Map-based)
  - Interface designed for Redis backend swap (Upstash Redis for serverless)
  - Note: in-memory state is per-process — effective in dev, unreliable in serverless production. Redis migration is the production path.

### File Upload Validation
- **D-07:** Dual-layer validation: Next.js route segment config + programmatic checks
  - Route segment config: `export const maxDuration` / body size limit as first defense
  - Handler-level: file size check (`Buffer.byteLength`), file type check (extension + MIME)
- **D-08:** Delivery upload type whitelist: broad set
  - ZIP, PDF, common images (jpg, png, gif, webp, svg), common documents (doc, docx, xls, xlsx, ppt, pptx, txt)
  - Smart agent ZIP upload: keep existing zip-validator.ts validation (already has 25MB + type checks)

### Concurrent Conflict Error UX
- **D-09:** Unified 409 Conflict response for all concurrent modification scenarios
  - DATA-03 (order status race): 409 + `{ errors: ["状态已变更，请刷新重试"] }`
  - DATA-04 (duplicate review): 409 + `{ errors: ["您已评价过此智能体"] }`
  - DATA-05 (consultation-to-order race): 409 + `{ errors: ["订单已创建"] }` or return existing order
  - Webhook-initiated conflicts (DATA-03): return 200 (idempotent — already processed)

### Claude's Discretion
- Exact rate limit values (requests/minute per bucket) — Claude should set sensible defaults
- Sliding window algorithm details — standard fixed-window or sliding-log
- Specific MIME detection method (file extension vs magic bytes)
- Exact subdomain matching regex/logic
- Whether `maxDuration` config is needed for upload routes

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current Implementation (must read)
- `src/app/api/creator/agents/route.ts` — Agent upload route (SEC-05, SEC-06 target)
- `src/app/api/orders/[id]/deliveries/route.ts` — Delivery upload route (SEC-05, SEC-06 target — zero validation currently)
- `src/app/api/orders/[id]/cancel/route.ts` — Order cancel route (DATA-03 target)
- `src/app/api/orders/[id]/complete/route.ts` — Order complete route (DATA-03 target)
- `src/app/api/orders/[id]/dispute/route.ts` — Dispute route (DATA-03 target)
- `src/app/api/orders/[id]/pay/route.ts` — Pay route (DATA-03 target)
- `src/app/api/payments/webhook/route.ts` — Stripe webhook (CSRF/rate-limit exempt)
- `src/app/api/consultations/route.ts` — Consultation route (rate-limit target)
- `src/app/api/auth/request-link/route.ts` — Magic link route (rate-limit target, CSRF exempt)
- `src/server/orders/service.ts` — Order status transition functions (DATA-03)
- `src/server/agents/product-service.ts` — Review submission (DATA-04)
- `src/server/consultations/service.ts` — Consultation-to-order flow (DATA-05)
- `src/server/agents/zip-validator.ts` — Existing ZIP validation with 25MB limit
- `prisma/schema.prisma` — Database schema (unique constraints needed)

### Architecture Context
- `.planning/codebase/ARCHITECTURE.md` — Service layer patterns, data flow
- `.planning/codebase/CONCERNS.md` — All 31 issues with file/line references (sections 1.3-1.5, 2.3, 1.8, 2.6)
- `.planning/codebase/STACK.md` — Tech stack, environment variables
- `.planning/phases/01-critical-security-fixes/01-CONTEXT.md` — Phase 1 decisions (state machine pattern, instrumentation.ts)

### Pattern References
- `src/server/auth/session.ts` — Auth guard functions (getCurrentUser, requireCreator, requireAdmin)
- `src/server/payments/ledger.ts` — P2002 catch pattern (Phase 1 DATA-02 fix — template for DATA-04)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/agents/zip-validator.ts` — Already validates ZIP size (25MB) and structure; can extend pattern for delivery uploads
- `src/server/auth/session.ts` — Auth guard functions used by all protected routes
- `src/server/payments/ledger.ts` — P2002 unique constraint catch pattern (added in Phase 1) — reuse for DATA-04 duplicate reviews
- `$transaction` pattern in `magic-link.ts` — Atomic check+create pattern for DATA-05

### Established Patterns
- API route error responses: JSON `{ errors: string[] }` with status code — all new validation errors should follow this
- Dependency injection: services accept optional `deps`/`store` parameter — new rate limiter should follow this pattern for testability
- Next.js App Router middleware: no `middleware.ts` exists yet — this phase creates it
- Route segment config: no routes currently use `export const config` for body size limits

### Integration Points
- New `middleware.ts` at project root — intercepts all matching requests before route handlers
- `src/app/api/creator/agents/route.ts` — Add bodySizeLimit config
- `src/app/api/orders/[id]/deliveries/route.ts` — Add bodySizeLimit config + file type validation
- `src/server/orders/service.ts` — Refactor status transitions to use `updateMany` with conditional where
- `src/server/agents/product-service.ts` — Add unique constraint handling for reviews
- `src/server/consultations/service.ts` — Wrap consultation-to-order in transaction or add unique constraint
- `prisma/schema.prisma` — Add unique constraint on `AgentPackageReview(agentPackageId, userId)` and possibly `ServiceOrder(consultationId)`

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the decisions above — standard security middleware patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-Input Validation & Access Control*
*Context gathered: 2026-05-05*
