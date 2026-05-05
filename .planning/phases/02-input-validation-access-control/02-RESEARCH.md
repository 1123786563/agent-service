# Phase 2: Input Validation & Access Control — Research

**Researched:** 2026-05-05
**Status:** Complete

---

## 1. CSRF Origin Verification (SEC-03)

### Current State
- No `src/middleware.ts` exists — this will be the first middleware file
- All API routes are under `src/app/api/` using Next.js App Router
- POST routes that need CSRF protection:
  - `POST /api/auth/request-link` — magic link request (FormData, exempt per D-01)
  - `POST /api/consultations` — consultation creation (JSON body)
  - `POST /api/creator/agents` — agent ZIP upload (FormData)
  - `POST /api/orders/[id]/deliveries` — delivery upload (FormData)
  - `POST /api/orders/[id]/pay` — payment initiation (FormData)
  - `POST /api/orders/[id]/cancel` — order cancel (FormData)
  - `POST /api/orders/[id]/complete` — order complete (FormData)
  - `POST /api/orders/[id]/dispute` — dispute creation (FormData)
  - `POST /api/payments/webhook` — Stripe webhook (JSON, exempt per D-01)

### Technical Approach
- Next.js 15 middleware runs on Edge Runtime (`export const config = { matcher: '/api/:path*' }`)
- Read `Origin` header from `request.headers.get('origin')`
- Compare against `APP_URL` env var (parse hostname, allow subdomains)
- Exempt routes: `/api/payments/webhook` (Stripe signature), `/api/auth/consume` (magic link click)
- Do NOT exempt `/api/auth/request-link` per D-01 (it has a session to forge via CSRF)
- Requests with no Origin: reject in production, allow in development (check `process.env.NODE_ENV`)
- Return 403 JSON response `{ errors: ["CSRF origin verification failed"] }`

### Edge Runtime Considerations
- `new URL(APP_URL)` works in Edge
- No Node.js APIs available — use standard Web APIs only
- `process.env.NODE_ENV` is available via Next.js config passthrough
- Middleware config: `export const config = { matcher: ['/api/:path*'] }`

---

## 2. Rate Limiting (SEC-04)

### Current State
- No rate limiting exists anywhere in the codebase
- Endpoints needing protection:
  - `/api/auth/request-link` — per-email keying (prevent magic link spam)
  - `/api/consultations` — per-user keying
  - `/api/creator/agents` — per-user keying (upload)
  - `/api/orders/[id]/deliveries` — per-user keying (upload)
  - `/api/payments/webhook` — per-IP keying (higher limit for Stripe retries)

### Technical Approach
- Create `src/server/rate-limit.ts` with a `RateLimiter` class
- In-memory `Map<string, { count: number, resetAt: number }>` sliding window
- Interface: `RateLimiter.check(key: string): { allowed: boolean, retryAfterMs: number }`
- Middleware integrates rate limiting into the same `middleware.ts` as CSRF (per D-03)
- Rate limit response: 429 + `Retry-After` header + `{ errors: ["Rate limited"] }`

### Rate Limit Configuration
- Global default: 60 req/min per IP
- Auth endpoints: 5 req/min per email (prevent magic link spam)
- Upload endpoints: 10 req/min per user
- Webhook endpoint: 100 req/min per IP (Stripe may retry aggressively)
- Consultation: 10 req/min per user

### Key Extraction
- Per-IP: `request.headers.get('x-forwarded-for')?.split(',')[0] ?? request.ip ?? 'unknown'`
- Per-email: parse from FormData/JSON body — but this is expensive in middleware
- Per-user: requires session lookup — also expensive in middleware
- **Pragmatic approach:** Middleware does IP-based rate limiting globally. Per-email/per-user limiting done at route handler level using `RateLimiter.check(email)` or `RateLimiter.check(userId)`.

### Redis Migration Path
- `RateLimiter` interface designed for backend swap: `check(key)` method stays the same
- For Upstash Redis: `await redis.incr(key)` with TTL — drop-in replacement
- In-memory store is per-process: in serverless (Vercel), each function invocation gets a fresh store — effective rate limiting only with Redis in production

---

## 3. File Upload Validation (SEC-05, SEC-06)

### Current State
- `src/app/api/creator/agents/route.ts` — ZIP upload goes through `zip-validator.ts` which has 25MB limit + structure validation. No route segment config for body size.
- `src/app/api/orders/[id]/deliveries/route.ts` — **ZERO validation**: no size check, no type check. File is directly passed to `createDeliveryForOrder()` as a Buffer.

### Size Validation Approach (SEC-05)
- **Delivery upload route:** Add `Buffer.byteLength` check before processing. 25MB limit matching ZIP uploads.
- **Route segment config:** Add `export const config = { maxDuration: 60 }` for upload routes if needed for large file processing.
- **Next.js body size limit:** Can be set via route segment config or `next.config.mjs`. For App Router API routes, the default body size limit is typically sufficient, but explicit is better:
  ```typescript
  export const config = {
    api: { bodyParser: { sizeLimit: '25mb' } }
  }
  ```
  Note: In App Router, this is set differently — via `export const maxDuration` and request-level checks.

### Type Validation Approach (SEC-06)
- **Delivery upload:** Check file extension against whitelist per D-08
- Whitelist: `.zip`, `.pdf`, `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.txt`
- Implementation: `ALLOWED_DELIVERY_EXTENSIONS` set, check `file.name.toLowerCase()` extension
- MIME type cross-check: optional but recommended — `file.type` from browser, validate matches extension

### Smart Agent ZIP Upload
- Already has comprehensive validation in `zip-validator.ts` (25MB, structure, metadata)
- No changes needed — it's the delivery upload route that's vulnerable

---

## 4. Atomic Order Status Transitions (DATA-03)

### Current State
All `markServiceOrder*` functions in `src/server/orders/service.ts` follow this unsafe pattern:
1. `findUniqueById(orderId)` — reads current order
2. Check status conditions
3. `updateOrder({ where: { id }, data: { ... } })` — updates

Between step 1 and 3, another request can modify the order.

### Technical Approach: `updateMany` with Conditional Where
Replace the read-check-update pattern with a single atomic operation:

```typescript
// Before (race condition):
const order = await deps.store.findUniqueById(orderId);
if (order.status !== expectedStatus) throw new Error("...");
return deps.store.updateOrder({ where: { id: orderId }, data: { status: newStatus } });

// After (atomic):
const result = await prisma.serviceOrder.updateMany({
  where: { id: orderId, status: expectedStatus },
  data: { status: newStatus, paymentStatus: newPaymentStatus }
});
if (result.count === 0) {
  // Status didn't match — order was modified concurrently
  throw new Error("状态已变更，请刷新重试");
}
return prisma.serviceOrder.findUnique({ where: { id: orderId }, include: ... });
```

### Affected Functions
1. `markServiceOrderPaid` — `where: { id, status: PENDING_PAYMENT }` → `{ status: IN_PROGRESS, paymentStatus: PAID }`
2. `markServiceOrderPaymentFailed` — `where: { id, status: PENDING_PAYMENT }` → `{ paymentStatus: FAILED }`
3. `markServiceOrderPaymentCancelled` — `where: { id, status: PENDING_PAYMENT, paymentStatus: UNPAID }` → `{ paymentStatus: CANCELLED }`
4. `markServiceOrderDisputed` — `where: { id, status: { in: [PAID, IN_PROGRESS, DELIVERED] } }` → `{ status: DISPUTED }`
5. `resolveDisputedServiceOrder` — `where: { id, status: DISPUTED }` → `{ status: nextStatus }`
6. `cancelServiceOrder` — `where: { id, status: PENDING_PAYMENT, paymentStatus: { in: [UNPAID, FAILED, CANCELLED] } }` → `{ status: CANCELLED }`

### Store Interface Changes
Need to add `updateMany` to `OrderStore`:
```typescript
updateMany(args: Prisma.ServiceOrderUpdateManyArgs): Promise<{ count: number }>;
```

### Error Response
Return 409 Conflict: `{ errors: ["状态已变更，请刷新重试"] }` per D-09.
For webhook-initiated transitions: return 200 (idempotent — already processed).

---

## 5. Duplicate Review Prevention (DATA-04)

### Current State
`AgentPackageReview` model has `userId: String?` (nullable) — allows anonymous reviews.
No unique constraint on `(agentPackageId, userId)`.
`submitAgentPackageReview()` in `product-service.ts` calls `create()` directly — no duplicate check.

### Technical Approach
1. **Schema change:** Add `@@unique([agentPackageId, userId])` to `AgentPackageReview` model
   - But `userId` is nullable — Prisma treats `null` as unique per SQL standard
   - For authenticated users: unique constraint prevents duplicates
   - For anonymous (userId=null): need application-level check or remove anonymous reviews
2. **Phase 1 added auth to consultations** — review submission should also require auth
3. **Implementation:**
   - Add unique constraint to `prisma/schema.prisma`
   - In `submitAgentPackageReview`, catch P2002 and return 409 Conflict per D-09
   - Pattern from Phase 1: `ledger.ts` P2002 catch (lines 103-118)
4. **Migration:** `prisma migrate dev --name add-review-unique-constraint`

### Important: userId Nullability
If anonymous reviews should remain possible, use a partial unique index:
```sql
CREATE UNIQUE INDEX agent_package_review_unique_user ON "AgentPackageReview" ("agentPackageId", "userId") WHERE "userId" IS NOT NULL;
```
In Prisma, this is modeled as `@@unique([agentPackageId, userId])` which creates a standard unique constraint. With nullable userId, two `null` values are considered distinct in PostgreSQL, so anonymous reviews from different users would still be allowed (which is wrong). The cleanest fix: **require authentication for reviews** (userId always set), remove nullable, add unique constraint.

---

## 6. Consultation-to-Order Race Condition (DATA-05)

### Current State
`createServiceOrder()` in `src/server/orders/service.ts`:
1. `findConsultationById()` — checks consultation exists and is SCOPED
2. `consultationHasOrder()` — checks no existing order for this consultation
3. `createOrderForConsultation()` — creates order in `$transaction` with consultation status update

Between step 2 and 3, another request could create an order for the same consultation.

### Technical Approach
Add `@@unique` constraint on `ServiceOrder.consultationId`:
```prisma
@@unique([consultationId])
```

Then catch P2002 in `createOrderForConsultation()` and return 409 per D-09:
- Response: `{ errors: ["订单已创建"] }` or return existing order

Alternative: Use `$transaction` with serializable isolation, but unique constraint is simpler and more reliable.

### Migration
```bash
prisma migrate dev --name add-consultation-order-unique
```

---

## 7. Cross-Cutting Concerns

### Error Response Format (D-09)
All concurrent modification errors return 409 Conflict:
- DATA-03: `{ errors: ["状态已变更，请刷新重试"] }`
- DATA-04: `{ errors: ["您已评价过此智能体"] }`
- DATA-05: `{ errors: ["订单已创建"] }` or return existing order
- Webhook-initiated DATA-03: return 200 (idempotent)

### Middleware Architecture
```
Request → middleware.ts
  ├── CSRF Origin check (all /api/* POST)
  ├── Rate limit check (IP-based global + route-specific)
  └── Continue to route handler
```

Route handlers add:
- Per-email/per-user rate limiting (after session lookup)
- File upload validation (size + type)
- Atomic status transitions (updateMany)
- P2002 duplicate handling (unique constraints)

### Schema Changes Summary
| Change | File | Migration |
|--------|------|-----------|
| `@@unique([agentPackageId, userId])` on AgentPackageReview | `prisma/schema.prisma` | Required |
| `@@unique([consultationId])` on ServiceOrder | `prisma/schema.prisma` | Required |

### New Files
| File | Purpose |
|------|---------|
| `src/middleware.ts` | CSRF + rate limiting middleware |
| `src/server/rate-limit.ts` | Rate limiter implementation |

### Dependencies
None — all changes use existing packages (no new npm dependencies needed).

---

## RESEARCH COMPLETE

**Key findings:**
1. No middleware exists — clean slate for CSRF + rate limiting
2. Delivery upload has zero validation — critical fix needed
3. All order status transitions are non-atomic — systemic `updateMany` refactor needed
4. Two schema migrations required (review unique, consultation-order unique)
5. Rate limiting should be split: IP-based in middleware, key-based in route handlers
6. P2002 catch pattern from Phase 1 (`ledger.ts`) is the template for DATA-04 and DATA-05
7. No new npm dependencies needed
