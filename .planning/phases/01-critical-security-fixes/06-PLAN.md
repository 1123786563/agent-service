---
wave: 1
depends_on: []
files_modified:
  - src/server/payments/ledger.ts
autonomous: true
requirements:
  - DATA-02
---

# Plan 06: Handle Payment Ledger Race Condition

Catch Prisma P2002 unique constraint error in `recordPaymentEvent` to handle concurrent webhook deliveries gracefully.

<objective>
Prevent unhandled errors when two webhook deliveries for the same payment event arrive concurrently and both try to create a `PaymentLedger` record.
</objective>

<must_haves>
- `recordPaymentEvent` catches P2002 (unique constraint violation on `providerEventId`)
- When P2002 is caught, the function returns `{ duplicate: true, id: existingRecord.id }` — same as the explicit duplicate check path
- The `PaymentLedgerStore` type is updated to include a `findFirst` method for the catch path
- No other functions are modified
</must_haves>

<read_first>
- `src/server/payments/ledger.ts` — `recordPaymentEvent` function (lines 58-98) and `PaymentLedgerStore` type
- `prisma/schema.prisma` — PaymentLedger model (line 338+) to confirm `@@unique` on `providerEventId`
</read_first>

<task>
<acceptance_criteria>
- `src/server/payments/ledger.ts` `recordPaymentEvent` function has a try/catch around `store.create`
- The catch block checks for Prisma error code `P2002`
- When P2002 is caught on `providerEventId`, the function fetches the existing record and returns `{ duplicate: true, id: existing.id }`
- `PaymentLedgerStore` type includes `findFirst` method if not already present
- `defaultStore` includes `findFirst` implementation if not already present
</acceptance_criteria>

<action>
Edit `src/server/payments/ledger.ts`:

1. Add `findFirst` to the `PaymentLedgerStore` type (after the `findUnique` method):
```typescript
findFirst(args: {
  where: {
    providerEventId: string;
  };
}): Promise<{ id: string } | null>;
```

2. Add `findFirst` to `defaultStore`:
```typescript
findFirst(args) {
  return db.paymentLedger.findFirst(args);
},
```

3. Wrap the `store.create` call (line 75) in a try/catch to handle the race condition. Replace the section from `const created = await store.create(...)` through the return statement with:

```typescript
let created;
try {
  created = await store.create({
    data: {
      orderId: event.orderId,
      provider: event.provider,
      providerPaymentId: event.providerPaymentId ?? null,
      providerCheckoutSessionId: event.providerCheckoutSessionId ?? null,
      providerEventId: event.providerEventId,
      amountMinor: event.amountMinor,
      currency: event.currency,
      paymentStatus: event.paymentStatus,
      failureReason: event.failureReason ?? null,
      idempotencyKey: event.idempotencyKey ?? null,
      lastWebhookEventId: event.providerEventId,
      lastWebhookReceivedAt: new Date(),
      rawEventDigest: digestPayload(event.rawPayload),
      rawEventStoredAt: new Date()
    }
  });
} catch (error: unknown) {
  // P2002 = unique constraint violation — concurrent webhook created the record first
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  ) {
    const existing = await store.findFirst({
      where: { providerEventId: event.providerEventId }
    });
    if (existing) {
      return { duplicate: true as const, id: existing.id };
    }
  }
  throw error;
}

return {
  duplicate: false as const,
  id: created.id
};
```

This handles the TOCTOU race: between the `findUnique` check and the `create`, another webhook handler may have already inserted the record. The P2002 catch treats it as a duplicate instead of crashing.
</action>
</task>

<verification>
- `grep -n "P2002" src/server/payments/ledger.ts` returns a match
- `grep -n "findFirst" src/server/payments/ledger.ts` returns a match (both type and implementation)
- The function still returns `{ duplicate: true, id }` or `{ duplicate: false, id }` in all code paths
- TypeScript compiles without errors: `npx tsc --noEmit`
</verification>
