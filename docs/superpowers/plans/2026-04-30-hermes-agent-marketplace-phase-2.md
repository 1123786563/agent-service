# Hermes-agent Marketplace Phase 2 Implementation Plan

> **Goal:** Build the Phase 2 service-consultation and payment loop: users can submit service inquiries from agent detail pages, creators/admin can scope the request into an order, users can pay, and paid orders move into `in_progress`.

## Scope Boundary

This plan implements only the Phase 2 slice from the design spec:

- Public consultation entry from agent detail pages.
- Consultation persistence and creator/admin consultation inbox.
- Order creation from a scoped consultation.
- User-facing order view.
- Dev-safe payment flow with a provider abstraction and webhook-shaped status update path.
- Admin visibility into consultations and orders.

This plan does not implement:

- Delivery upload and acceptance.
- Buyer-side file download for delivery artifacts.
- Refunds, disputes, chargebacks, or escrow.
- Real-time messaging.
- Provider ranking or marketplace search for services.
- Public service catalog page.
- Automatic creator settlement.

## Implementation Strategy

Phase 2 should not couple the codebase to a live payment provider too early. The right move is:

- Define consultation, order, and payment state in the database first.
- Add a payment adapter interface.
- Implement a development payment adapter that simulates success and exercises the webhook/update path.
- Keep the route and data contracts provider-shaped so Stripe or another PSP can replace the adapter later without reworking the app surface.

This keeps the iteration executable in the current environment while still producing a production-ready shape.

## File Structure

Add the following files:

```text
src/
├── app/
│   ├── agents/[slug]/page.tsx                       # modify
│   ├── account/orders/page.tsx
│   ├── creator/consultations/page.tsx
│   ├── creator/orders/page.tsx
│   ├── admin/page.tsx                               # modify
│   ├── api/consultations/route.ts
│   ├── api/orders/[id]/pay/route.ts
│   ├── api/payments/dev/complete/route.ts
│   └── api/payments/webhook/route.ts
├── components/
│   ├── consultation-form.tsx
│   ├── consultation-status-pill.tsx
│   └── order-status-pill.tsx
├── server/
│   ├── consultations/service.ts
│   ├── orders/service.ts
│   └── payments/
│       ├── adapter.ts
│       └── dev-adapter.ts
prisma/
├── schema.prisma                                    # modify
└── migrations/...                                   # new migration
tests/
├── server/
│   ├── consultation-service.test.ts
│   ├── order-service.test.ts
│   ├── consultation-route.test.ts
│   └── payment-route.test.ts
└── e2e/
    └── consultation.spec.ts
```

## Data Model Changes

Extend Prisma with Phase 2 entities.

### `Consultation`

Purpose:
- Capture the buyer’s service request attached to a published agent package.

Fields:
- `id`
- `agentPackageId`
- `providerId`
- `buyerEmail`
- `buyerUserId?`
- `requirement`
- `status`
- `scopedSummary?`
- `createdAt`
- `updatedAt`

Status enum:

```text
NEW
IN_DISCUSSION
SCOPED
ORDER_CREATED
CLOSED
```

### `ServiceOrder`

Purpose:
- Represent the scoped and payable service engagement.

Fields:
- `id`
- `consultationId`
- `buyerEmail`
- `buyerUserId?`
- `providerId`
- `title`
- `scope`
- `priceCents`
- `currency`
- `status`
- `paymentStatus`
- `paymentProvider`
- `paymentReference?`
- `createdAt`
- `updatedAt`

Order status enum:

```text
PENDING_PAYMENT
PAID
IN_PROGRESS
CANCELLED
DISPUTED
```

Payment status enum:

```text
UNPAID
PENDING
PAID
FAILED
```

Indexes:
- `Consultation.agentPackageId`
- `Consultation.providerId, createdAt`
- `ServiceOrder.consultationId`
- `ServiceOrder.providerId, createdAt`
- `ServiceOrder.buyerEmail, createdAt`
- `ServiceOrder.status, paymentStatus`

## Task Breakdown

### Task 1: Extend Prisma for Consultation and Order State

Files:
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_phase2_consultations_orders/`

Work:
- Add enums for consultation, order, and payment states.
- Add `Consultation` and `ServiceOrder` models.
- Add optional backreferences on `User` and `AgentPackage`.
- Generate and commit the migration.

Verification:
- `npm run prisma:generate`
- migration applies cleanly to the local Phase 1 database

### Task 2: Add Consultation and Order Server Services

Files:
- Create: `src/server/consultations/service.ts`
- Create: `src/server/orders/service.ts`
- Create: `tests/server/consultation-service.test.ts`
- Create: `tests/server/order-service.test.ts`

Work:
- Consultation service:
  - create consultation from agent slug + buyer email + requirement
  - list consultations for a provider
  - update consultation status and scoped summary
- Order service:
  - create order from a scoped consultation
  - list buyer/provider orders
  - transition payment-confirmed orders into `IN_PROGRESS`
- Keep all status transitions explicit and validated.

Verification:
- service tests cover invalid transition attempts and success paths

### Task 3: Add Payment Adapter Abstraction

Files:
- Create: `src/server/payments/adapter.ts`
- Create: `src/server/payments/dev-adapter.ts`
- Create: `tests/server/payment-route.test.ts`

Work:
- Define a payment adapter interface:
  - create payment session
  - verify webhook payload
  - normalize provider events into internal payment updates
- Implement a development adapter that:
  - creates a local payment URL
  - simulates successful payment
  - drives the same internal status update path as a real webhook
- Use env-driven provider selection, defaulting to the dev adapter.

Verification:
- tests prove that the dev adapter marks an order as paid and moves it into `IN_PROGRESS`

### Task 4: Add Public Consultation Entry

Files:
- Modify: `src/app/agents/[slug]/page.tsx`
- Create: `src/components/consultation-form.tsx`
- Create: `src/components/consultation-status-pill.tsx`
- Create: `src/app/api/consultations/route.ts`
- Create: `tests/server/consultation-route.test.ts`

Work:
- Add a “咨询服务” form to the agent detail page.
- Accept:
  - buyer email
  - requirement text
- POST to `/api/consultations`.
- On success:
  - return a shaped success response
  - keep the user on the detail page with visible confirmation
- On failure:
  - return explicit JSON errors

Constraints:
- anonymous users can create consultations
- provider is derived from the published agent package owner
- only published packages may receive consultations

Verification:
- route tests for published, missing, and invalid-input flows

### Task 5: Add Creator Consultation Inbox and Order Creation

Files:
- Create: `src/app/creator/consultations/page.tsx`
- Create: `src/app/creator/orders/page.tsx`
- Create: `src/components/order-status-pill.tsx`
- Modify: `src/app/creator/page.tsx`

Work:
- Add creator consultation inbox page:
  - list consultations for the current creator
  - show buyer email, requirement, created time, and status
- Add order creation action from a consultation:
  - title
  - scoped summary
  - price
  - currency
- Add creator orders page showing payment and order status
- Link creator dashboard to the new inbox and order surfaces

Constraints:
- only active creators can access these pages
- creators can only see consultations and orders they own

Verification:
- build passes
- unit coverage exists for order creation rules

### Task 6: Add Buyer Order Page and Payment Entry

Files:
- Create: `src/app/account/orders/page.tsx`
- Create: `src/app/api/orders/[id]/pay/route.ts`
- Create: `src/app/api/payments/dev/complete/route.ts`
- Create: `src/app/api/payments/webhook/route.ts`

Work:
- Add a buyer order list page keyed by logged-in user email.
- Allow buyers to open an unpaid order and start payment.
- `/api/orders/[id]/pay` should:
  - verify buyer access
  - create a payment session through the adapter
  - redirect to the adapter-provided URL
- Dev adapter completion route should:
  - simulate successful payment
  - update payment status
  - transition order to `IN_PROGRESS`
- Webhook route should reuse the same internal payment-update service.

Constraints:
- buyers can only pay their own unpaid orders
- duplicate paid webhooks must be idempotent

Verification:
- route tests for access control and idempotent payment updates

### Task 7: Extend Admin Visibility

Files:
- Modify: `src/app/admin/page.tsx`
- Create or modify lightweight admin actions as needed

Work:
- Show consultation and order summaries on the admin surface.
- Expose enough data for manual exception handling:
  - consultation status
  - order status
  - payment status
  - provider and buyer identities
- Do not add dispute workflows yet.

Verification:
- build passes
- admin page still redirects non-admin users

### Task 8: Add E2E Smoke Coverage and Operator Notes

Files:
- Create: `tests/e2e/consultation.spec.ts`
- Modify: `docs/phase-1-operator-guide.md` or create `docs/phase-2-operator-guide.md`

Work:
- Add a smoke test for the public consultation entry.
- Document:
  - how to create a consultation
  - how a creator scopes it into an order
  - how dev payment completion works

Verification:
- `npm run test:e2e` passes with both smoke specs

## Verification Checklist

Required command set for Phase 2 completion:

```bash
npm run test
npm run build
npm run test:e2e
```

Manual checklist:

- Anonymous user can submit a consultation from an agent detail page.
- Creator can see the consultation in `/creator/consultations`.
- Creator can convert a consultation into a priced order.
- Logged-in buyer can see the order and start payment.
- Dev payment completion marks the order as paid and then `in_progress`.
- Admin can see consultations and orders from the admin surface.

## Notes for Execution

- Do not wire a real payment provider before the adapter boundary exists.
- Keep Phase 2 out of delivery artifacts; delivery belongs to Phase 3.
- Prefer adding order/payment primitives that can survive later Stripe integration instead of shipping ad hoc “fake paid” booleans.
