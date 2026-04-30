# Phase 4 Operator Guide

## Local Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAILS`, `UPLOAD_DIR`, and optionally `DELIVERY_UPLOAD_DIR`.
3. Run `npm install`.
4. Run `npm run prisma:migrate`.
5. Run `npm run prisma:seed`.
6. Run `npm run dev`.

## Marketplace Discovery

1. Open `/agents`.
2. Use:
   - `q` search for name, summary, slug, or category
   - category filter
   - sort by newest, downloads, consultations, or conversion
   - `仅看可提供服务`
3. Review each card for:
   - downloads
   - consultations
   - orders
   - completed orders
   - completeness score

## Creator Public Profiles

1. Open any published agent detail page.
2. Click the creator email to open `/creators/[id]`.
3. Review:
   - published package count
   - downloads
   - consultations
   - completed orders
4. Use `联系该创作者` to jump into the package consultation form.

## Admin Overview

1. Open `/admin`.
2. Review:
   - published package count
   - downloads
   - consultations
   - orders
   - completed orders
3. Review `支付异常订单` and use `重置为待支付` when a buyer needs to retry.
4. Review `待结算订单` and use `标记已结算` after an off-platform payout is completed.
5. Review `争议订单` and resolve each order back to `IN_PROGRESS`, `DELIVERED`, or `CANCELLED`.
6. Use `运营分析` to open `/admin/analytics`.

## Admin Analytics

1. Open `/admin/analytics`.
2. Review funnel cards for:
   - downloads
   - consultation rate
   - order rate
   - completion rate
   - settled order count
   - unsettled revenue
3. Review `高转化智能体` for package-level rankings.
4. Review `创作者效率` for creator-level rankings.
5. Review `结算概览` for settled and unsettled payout totals.

## Phase 4 Limits

- Download count is total downloads, not unique downloads.
- No page-view tracking.
- No event warehouse or historical trend charting.
- Conversion rates are derived from current relational data, not a dedicated analytics pipeline.
