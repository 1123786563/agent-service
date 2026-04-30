# Phase 2 Operator Guide

## Local Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAILS`, and `UPLOAD_DIR`.
3. Run `npm install`.
4. Run `npm run prisma:migrate`.
5. Run `npm run prisma:seed`.
6. Run `npm run dev`.

## Public Consultation Flow

1. Visit `/agents`.
2. Open a published package detail page.
3. In the `咨询服务` block, submit:
   - contact email
   - requirement summary
4. The page should show `新咨询`, and the record will be created in the `Consultation` table.

## Creator Scoping and Order Creation

1. Admin adds a creator to `/admin/whitelist`.
2. Creator logs in and opens `/creator/consultations`.
3. For a new consultation:
   - fill `订单标题`
   - fill `范围摘要`
   - set `报价（分）`
   - set `币种`
4. Submit `生成订单`.
5. The consultation moves to `ORDER_CREATED`, and a `ServiceOrder` row is created.
6. Creator can review the result in `/creator/orders`.

## Buyer Payment Flow

1. Buyer logs in with the same email used for the consultation or order.
2. Buyer opens `/account/orders`.
3. For an unpaid order, click `去支付`.
4. The app redirects to the dev payment completion route.
5. The dev completion route marks the order as paid and transitions it to `IN_PROGRESS`.

## Admin Visibility

1. Admin opens `/admin`.
2. Review:
   - published packages and ZIP validation output
   - recent consultations with buyer and provider identities
   - recent orders with order and payment status

## Phase 2 Notes

- `PAYMENT_PROVIDER` defaults to `dev`.
- `/api/payments/dev/complete` is the local payment simulator.
- `/api/payments/webhook` reuses the same internal payment-update path as the dev completion route.
- Refunds, disputes, and delivery artifacts are still out of scope for Phase 2.
