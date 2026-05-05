---
plan: 06
phase: 1
status: complete
requirements:
  - DATA-02
---

# Plan 06: Handle Payment Ledger Race Condition

## What Changed

Wrapped `store.create` in try/catch in `recordPaymentEvent` to handle TOCTOU race:
- Catches Prisma P2002 (unique constraint violation on `providerEventId`)
- When caught, fetches existing record via new `findFirst` and returns `{ duplicate: true, id }`
- Added `findFirst` to `PaymentLedgerStore` type and `defaultStore` implementation
- Updated test mock to include `findFirst`

## Key Files

- `src/server/payments/ledger.ts` — Added findFirst to type/store, wrapped create in P2002 catch
- `tests/server/payment-ledger.test.ts` — Added findFirst to mock

## Self-Check

- [x] P2002 catch block present in recordPaymentEvent
- [x] findFirst added to PaymentLedgerStore type and defaultStore
- [x] Returns { duplicate: true, id } on race condition
- [x] Existing tests pass (2/2)
