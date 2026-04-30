# Hermes-agent Marketplace Phase 3 Implementation Plan

> **Goal:** Build the Phase 3 delivery loop: creators upload delivery artifacts for paid orders, buyers review them, buyers confirm completion, and admins can inspect delivery-state exceptions.

## Scope Boundary

This plan implements only the Phase 3 slice from the design spec:

- Delivery data model and order-state extension.
- Creator delivery upload flow for `IN_PROGRESS` orders.
- Buyer delivery review and completion confirmation.
- Admin visibility into delivered and completed work.
- Development-safe file storage using the existing local storage pattern.

This plan does not implement:

- Milestone deliveries.
- Refunds, disputes, or arbitration workflows.
- In-app messaging.
- Rich preview for arbitrary delivery files.
- Automatic reminders or auto-complete timeouts.
- Provider settlement.

## Implementation Strategy

The codebase already treats `ServiceOrder.status` as the primary lifecycle field. The lowest-risk Phase 3 move is:

- Extend `ServiceOrderStatus` with `DELIVERED` and `COMPLETED`.
- Add a `Delivery` table for the artifact itself.
- Keep payment state separate in `paymentStatus`.
- Reuse the existing local storage pattern for private delivery files before introducing object storage credentials and signed URLs.

This keeps the model aligned with the current service layer and avoids introducing an extra `deliveryStatus` dimension before multi-stage delivery exists.

## File Structure

Add the following files:

```text
src/
├── app/
│   ├── account/orders/page.tsx                       # modify
│   ├── creator/orders/page.tsx                       # modify
│   ├── admin/page.tsx                                # modify
│   ├── api/orders/[id]/deliveries/route.ts
│   ├── api/orders/[id]/deliveries/[deliveryId]/download/route.ts
│   └── api/orders/[id]/complete/route.ts
├── components/
│   ├── delivery-status-pill.tsx
│   ├── upload-delivery-form.tsx
│   └── complete-order-button.tsx
├── server/
│   ├── deliveries/service.ts
│   └── storage/
│       └── local-delivery-storage.ts
prisma/
├── schema.prisma                                     # modify
└── migrations/...                                    # new migration
tests/
├── server/
│   ├── delivery-service.test.ts
│   ├── delivery-route.test.ts
│   ├── complete-order-route.test.ts
│   └── account-orders-page.test.tsx                  # modify
└── e2e/
    └── delivery.spec.ts
docs/
└── phase-3-operator-guide.md
```

## Data Model Changes

### `ServiceOrderStatus`

Extend with:

```text
DELIVERED
COMPLETED
```

Lifecycle becomes:

```text
PENDING_PAYMENT -> PAID -> IN_PROGRESS -> DELIVERED -> COMPLETED
PENDING_PAYMENT -> CANCELLED
PAID / IN_PROGRESS / DELIVERED -> DISPUTED
```

The code should still fast-path `PAID` to `IN_PROGRESS` after payment confirmation, but Phase 3 now adds the explicit post-delivery states.

### `Delivery`

Purpose:
- Store creator-submitted delivery artifacts and acceptance timestamps.

Fields:
- `id`
- `serviceOrderId`
- `providerId`
- `fileUrl`
- `fileName`
- `fileSizeBytes`
- `note`
- `submittedAt`
- `acceptedAt?`
- `createdAt`

Indexes:
- `Delivery.serviceOrderId, submittedAt`
- `Delivery.providerId, submittedAt`

Notes:
- First implementation allows multiple delivery submissions per order.
- The latest submission is the active one for buyer review.
- Deliveries remain private; only buyer, provider, and admin may download.

## Task Breakdown

### Task 1: Extend Prisma for Delivery State

Files:
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_phase3_deliveries/`

Work:
- Add `DELIVERED` and `COMPLETED` to `ServiceOrderStatus`.
- Add `Delivery` model.
- Add `deliveries` relation on `ServiceOrder` and `providerDeliveries` relation on `User`.
- Generate and apply the migration.

Verification:
- `npm run prisma:generate`
- migration applies cleanly to the local Phase 2 database

### Task 2: Add Delivery Storage and Service Layer

Files:
- Create: `src/server/storage/local-delivery-storage.ts`
- Create: `src/server/deliveries/service.ts`
- Create: `tests/server/delivery-service.test.ts`

Work:
- Reuse the local storage convention with a dedicated delivery directory.
- Implement:
  - `createDeliveryForOrder`
  - `listDeliveriesForOrder`
  - `getDeliveryForDownload`
  - `acceptLatestDelivery`
- Validate:
  - only the owning creator can upload
  - only `IN_PROGRESS` orders can accept new deliveries
  - uploading a delivery moves the order to `DELIVERED`
  - accepting a delivery moves the order to `COMPLETED`

Verification:
- service tests cover ownership, invalid state, upload success, and acceptance success

### Task 3: Add Creator Delivery Upload Flow

Files:
- Modify: `src/app/creator/orders/page.tsx`
- Create: `src/components/upload-delivery-form.tsx`
- Create: `src/app/api/orders/[id]/deliveries/route.ts`
- Create: `tests/server/delivery-route.test.ts`

Work:
- Show upload controls only for creator-owned `IN_PROGRESS` orders.
- Accept:
  - file
  - optional note
- Persist the file and delivery record.
- Keep the creator on the order page with visible success or error feedback.

Verification:
- route tests cover auth, ownership, missing file, invalid order state, and success

### Task 4: Add Buyer Delivery Review and Completion

Files:
- Modify: `src/app/account/orders/page.tsx`
- Create: `src/components/complete-order-button.tsx`
- Create: `src/app/api/orders/[id]/complete/route.ts`
- Create: `tests/server/complete-order-route.test.ts`

Work:
- Display the latest delivery note and download action for `DELIVERED` orders.
- Allow only the buyer to confirm completion.
- Confirmation updates:
  - latest delivery `acceptedAt`
  - order status to `COMPLETED`

Verification:
- route tests cover buyer auth, ownership, missing delivery, and success

### Task 5: Add Private Delivery Download

Files:
- Create: `src/app/api/orders/[id]/deliveries/[deliveryId]/download/route.ts`
- Modify: `src/app/account/orders/page.tsx`
- Modify: `src/app/creator/orders/page.tsx`

Work:
- Allow buyer, provider, and admin to download the stored delivery artifact.
- Enforce private access control.
- Return attachment headers with the original file name.

Verification:
- route tests cover owner access and non-owner rejection

### Task 6: Extend Admin Visibility

Files:
- Modify: `src/app/admin/page.tsx`

Work:
- Show latest delivery metadata in the order summary:
  - file name
  - submitted time
  - accepted time
- Make it obvious which orders are stuck in `IN_PROGRESS` vs `DELIVERED`.

Verification:
- build passes
- admin page tests cover delivery metadata rendering

### Task 7: Add E2E Smoke Coverage and Operator Notes

Files:
- Create: `tests/e2e/delivery.spec.ts`
- Create: `docs/phase-3-operator-guide.md`

Work:
- Seed a paid/in-progress order.
- Upload a delivery as creator.
- Confirm completion as buyer.
- Document the operator flow and local delivery storage location.

Verification:
- `npm run test:e2e` passes with marketplace, consultation, and delivery smoke specs

## Verification Checklist

Required command set for Phase 3 completion:

```bash
npm run test
npm run build
npm run test:e2e
```

Manual checklist:

- Creator can upload a delivery file for an `IN_PROGRESS` order.
- Uploading delivery moves the order to `DELIVERED`.
- Buyer can see and download the latest delivery artifact.
- Buyer can confirm completion.
- Confirmation moves the order to `COMPLETED`.
- Admin can distinguish in-progress, delivered, and completed orders.

## Notes for Execution

- Keep delivery files private; do not expose raw storage paths in public pages.
- Avoid adding rich file preview until the access-control path is stable.
- Prefer append-only delivery records over mutating old delivery rows.
- Leave dispute and refund handling out of Phase 3.
