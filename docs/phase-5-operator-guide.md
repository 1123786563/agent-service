# Phase 5 Operator Guide

## Local Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, `SESSION_SECRET`, `UPLOAD_DIR`, `DELIVERY_UPLOAD_DIR`, `DOWNLOAD_TICKET_SECRET`, and `DOWNLOAD_TICKET_ACTIVE_KEY_ID`.
3. Run `npm install`.
4. Run `npm run prisma:generate`.
5. Apply the current schema changes to the local database.
6. Run `npm run dev`.

## Controlled Downloads

1. Published agent ZIP downloads still start from the public detail page.
2. Delivery downloads now require an authenticated buyer, provider, or admin session.
3. To verify access control:
   - open a buyer order with a delivery
   - confirm `下载交付物` works for the buyer
   - open the same delivery URL in an anonymous browser context and confirm it redirects to `/login`
4. Download tickets are short-lived and should not be treated as permanent URLs.

## Payment and Order State

1. Buyers still start payment from `/account/orders`.
2. `PENDING_PAYMENT` orders may now carry `UNPAID`, `FAILED`, or `CANCELLED` payment states.
3. Use `/admin` to review failed payment orders and reset them back to `UNPAID` when retry is needed.
4. Treat provider webhook events as the source of truth for payment success or cancellation, not the browser redirect alone.

## Disputes and Refunds

1. Buyers or providers can move `IN_PROGRESS` and `DELIVERED` orders into `DISPUTED`.
2. Admin resolves disputes from `/admin`:
   - `恢复进行中`
   - `恢复待验收`
   - `取消订单`
3. Refundable no-work-start cases depend on `workStartedAt`. If work has already started, do not assume the order is auto-refundable.
4. Check dispute records and refund records in the database when reconciling a cancelled paid order.

## Settlement Operations

1. Open `/admin`.
2. In `待结算订单`, submit a batch for each completed paid order that is ready for payout.
3. In `待出款结算批次`, fill `出款参考号` and click `标记已出款` only after the real payout completes.
4. Open `/creator/orders` to verify the creator now sees `已结算` for the completed order.
5. Open `/admin/analytics` to review settled order count and unsettled revenue totals.

## Current Limits

- Storage still uses the local provider by default; the S3-compatible provider is only a skeleton.
- Dev payment remains the active runtime provider unless a real provider is configured.
- Refund execution is modeled in persistence and service code, but there is no public UI for operators to initiate refund requests.
- Settlement payout is still an operator-confirmed workflow, not an automatic disbursement integration.
