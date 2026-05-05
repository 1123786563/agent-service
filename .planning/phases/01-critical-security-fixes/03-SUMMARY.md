---
plan: 03
phase: 1
status: complete
requirements:
  - SEC-07
---

# Plan 03: Production Environment Variable Validation

## What Changed

Created `instrumentation.ts` at project root using Next.js instrumentation hook:
- Validates in production only (`NODE_ENV === "production"`)
- Zod schema validates: DATABASE_URL, APP_URL, DOWNLOAD_TICKET_SECRET, ADMIN_EMAILS
- Stripe vars (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) required only when PAYMENT_PROVIDER=stripe
- Fail-fast with `process.exit(1)` and descriptive error naming missing variables

## Key Files

- `instrumentation.ts` (NEW) — Production startup validation using Zod

## Self-Check

- [x] File exists at project root
- [x] Exports async function register()
- [x] Returns early in non-production environments
- [x] Validates all required env vars
- [x] Conditional Stripe var validation
- [x] process.exit(1) on failure
