# Phase 3 Operator Guide

## Local Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAILS`, `UPLOAD_DIR`, and optionally `DELIVERY_UPLOAD_DIR`.
3. Run `npm install`.
4. Run `npm run prisma:migrate`.
5. Run `npm run prisma:seed`.
6. Run `npm run dev`.

## Delivery Upload Flow

1. Complete the Phase 2 flow until an order is paid and moves to `IN_PROGRESS`.
2. Creator opens `/creator/orders`.
3. For an `IN_PROGRESS` order, upload:
   - delivery file
   - delivery note
4. The app stores the file in `DELIVERY_UPLOAD_DIR` or `.data/deliveries`.
5. The order moves to `DELIVERED`.

## Buyer Acceptance Flow

1. Buyer logs in with the order buyer email.
2. Buyer opens `/account/orders`.
3. For a `DELIVERED` order:
   - review the delivery note
   - download the delivery file
   - click `确认完成`
4. The latest delivery receives `acceptedAt`.
5. The order moves to `COMPLETED`.

## Admin Visibility

1. Admin opens `/admin`.
2. In recent orders, review:
   - order status
   - payment status
   - latest delivery file name
   - submitted time
   - accepted time or `待验收`

## Storage Notes

- Delivery files are stored separately from agent ZIP uploads.
- The default local delivery directory is `.data/deliveries`.
- Delivery downloads are private and must go through `/api/orders/[id]/deliveries/[deliveryId]/download`.
- Authorized downloaders are the buyer, provider, and admin.

## Phase 3 Limits

- No refunds, disputes, or arbitration workflow.
- No milestone delivery.
- No automatic acceptance timeout.
- No rich delivery preview.
