---
wave: 1
depends_on: []
files_modified:
  - src/app/admin/actions.ts
  - src/server/refunds/service.ts
autonomous: true
requirements:
  - DATA-01
---

# Plan 05: Atomic Refund + Dispute Resolution

Wrap `refundDisputedOrder` so that the refund request and dispute resolution execute atomically. Prevents double-refund when the second operation fails and is retried.

<objective>
Make refund + dispute resolution idempotent: if the flow is interrupted after the Stripe call but before dispute resolution, retrying must not issue a second refund.
</objective>

<must_haves>
- `refundDisputedOrder` uses a state machine approach: PENDING refund record → Stripe call → resolve dispute atomically
- Double-refund is impossible: retry after partial failure finds existing PENDING refund and skips Stripe
- Existing `requestRefund` and `resolveDispute` functions are NOT modified (they're used by other callers)
</must_haves>

<read_first>
- `src/app/admin/actions.ts` — `refundDisputedOrder` function (lines 120-177), the non-atomic caller
- `src/server/refunds/service.ts` — `requestRefund` function (lines 28-154), understand the full flow including Stripe call + $transaction
- `src/server/disputes/service.ts` — `resolveLatestOpenDisputeForOrder` function (lines 200-226)
- `prisma/schema.prisma` — Refund model (around line 445) for available fields
</read_first>

<task>
<acceptance_criteria>
- `src/app/admin/actions.ts` `refundDisputedOrder` function wraps refund + dispute resolution in a single logical flow with idempotency
- Before calling Stripe, a check for existing refund record on this dispute/order prevents double-processing
- If `requestRefund` succeeds but `resolveLatestOpenDisputeForOrder` fails, retrying `refundDisputedOrder` does NOT call Stripe again
- `grep -n "requestRefund" src/app/admin/actions.ts` still shows the call
- `grep -n "resolveLatestOpenDispute" src/app/admin/actions.ts` still shows the call
</acceptance_criteria>

<action>
Edit `src/app/admin/actions.ts`:

1. Add import at the top: `import { prisma } from "@/server/db";` (already imported on line 13 — verify)

2. Add `RefundStatus` to the existing Prisma client import on line 9.

3. Modify the `refundDisputedOrder` function to add an idempotency guard. The new flow:

Replace the `refundDisputedOrder` function body (lines 120-177) with this logic:

```typescript
export async function refundDisputedOrder(formData: FormData) {
  const admin = await requireAdmin();

  const orderId = String(formData.get("orderId") ?? "").trim();
  const amountValue = String(formData.get("amountMinor") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const dispute = await prisma.dispute.findFirst({
    where: {
      orderId,
      status: { in: ["OPEN", "UNDER_REVIEW"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!dispute) {
    throw new Error("Open dispute not found");
  }

  // Idempotency guard: check if a refund already exists for this dispute
  const existingRefund = await prisma.refund.findFirst({
    where: {
      disputeId: dispute.id,
      status: { in: [RefundStatus.PENDING, RefundStatus.SUCCEEDED] },
    },
  });

  if (existingRefund) {
    // Refund already in progress or completed — skip Stripe, just resolve dispute
    await resolveLatestOpenDisputeForOrder({
      orderId,
      resolutionType: amountMinor
        ? DisputeResolutionType.REFUND_PARTIAL
        : DisputeResolutionType.REFUND_FULL,
      resolutionNote: reason || null,
    });
  } else {
    // No existing refund — full flow: request refund then resolve dispute
    let amountMinor: number | null = null;
    if (amountValue) {
      const parsedAmountMinor = Number.parseInt(amountValue, 10);
      if (!Number.isInteger(parsedAmountMinor) || parsedAmountMinor <= 0) {
        throw new Error("Refund amount must be a positive integer in minor units");
      }
      amountMinor = parsedAmountMinor;
    }

    await requestRefund({
      orderId,
      requestedByUserId: admin.id,
      disputeId: dispute.id,
      amountMinor,
      reason: reason || null,
      allowAfterWorkStarted: true,
    });

    await resolveLatestOpenDisputeForOrder({
      orderId,
      resolutionType: amountMinor
        ? DisputeResolutionType.REFUND_PARTIAL
        : DisputeResolutionType.REFUND_FULL,
      resolutionNote: reason || null,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/analytics");
  revalidatePath("/account/orders");
  revalidatePath("/creator/orders");
}
```

The key change is the idempotency guard: before calling `requestRefund` (which calls Stripe), check if a PENDING or SUCCEEDED refund already exists for this dispute. If so, skip Stripe and only resolve the dispute. This prevents double-refund on retry.
</action>
</task>

<verification>
- `grep -n "existingRefund" src/app/admin/actions.ts` returns a match
- `grep -n "RefundStatus" src/app/admin/actions.ts` returns a match
- `grep -n "requestRefund" src/app/admin/actions.ts` returns a match (still called in the else branch)
- `grep -n "resolveLatestOpenDispute" src/app/admin/actions.ts` returns a match (called in both branches)
- TypeScript compiles without errors: `npx tsc --noEmit`
</verification>
