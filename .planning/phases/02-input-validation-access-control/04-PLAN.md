---
phase: 2
plan: 4
type: execute
wave: 2
depends_on: [1, 2]
files_modified:
  - src/server/orders/service.ts
  - src/server/payments/adapter.ts
autonomous: true
requirements:
  - DATA-03
---

<objective>
Refactor all order status transition functions to use atomic `updateMany` with conditional `where` clause for optimistic concurrency control, eliminating race conditions between read and write.
</objective>

<tasks>

<task id="1" type="execute">
<read_first>
  - src/server/orders/service.ts — ALL mark* functions (lines 272-459)
  - src/server/payments/adapter.ts — calls markServiceOrderPaid/markServiceOrderPaymentFailed (for webhook context)
  - .planning/phases/02-input-validation-access-control/02-RESEARCH.md — section 4 (Atomic Transitions)
  - .planning/phases/02-input-validation-access-control/02-CONTEXT.md — decisions D-09
  - prisma/schema.prisma — ServiceOrderStatus enum values
</read_first>
<action>
Update `src/server/orders/service.ts` to use atomic `updateMany` transitions:

1. Add `updateMany` to the `OrderStore` type:
   ```typescript
   updateMany(args: Prisma.ServiceOrderUpdateManyArgs): Promise<{ count: number }>;
   ```

2. Add the implementation in `defaultDeps.store`:
   ```typescript
   updateMany(args) {
     return prisma.serviceOrder.updateMany(args);
   }
   ```

3. Add a helper function at the top of the file (after imports, before types):
   ```typescript
   class ConcurrentModificationError extends Error {
     constructor(message: string) {
       super(message);
       this.name = "ConcurrentModificationError";
     }
   }
   ```

4. **Refactor `markServiceOrderPaid` (lines 272-302):**
   Replace the read-check-update pattern with:
   ```typescript
   export async function markServiceOrderPaid(
     input: MarkServiceOrderPaidInput,
     deps: OrderServiceDeps = defaultDeps
   ) {
     const orderId = input.orderId.trim();
     if (!orderId) { throw new Error("Order ID is required"); }

     // Idempotency: if already paid+in_progress, return existing order
     const existing = await deps.store.findUniqueById(orderId);
     if (!existing) { throw new Error("Service order not found"); }
     if (existing.paymentStatus === PaymentStatus.PAID && existing.status === ServiceOrderStatus.IN_PROGRESS) {
       return existing;
     }
     if (existing.status === ServiceOrderStatus.CANCELLED || existing.status === ServiceOrderStatus.DISPUTED) {
       throw new Error(`Cannot mark ${existing.status.toLowerCase()} order as paid`);
     }

     // Atomic transition: only update if still in a payable state
     const result = await deps.store.updateMany({
       where: {
         id: orderId,
         status: { notIn: [ServiceOrderStatus.CANCELLED, ServiceOrderStatus.DISPUTED] },
         paymentStatus: { not: PaymentStatus.PAID }
       },
       data: {
         paymentStatus: PaymentStatus.PAID,
         status: ServiceOrderStatus.IN_PROGRESS,
         paymentReference: input.paymentReference ?? existing.paymentReference
       }
     });

     if (result.count === 0) {
       throw new ConcurrentModificationError("状态已变更，请刷新重试");
     }

     return deps.store.findUniqueById(orderId) as Promise<ServiceOrderWithRelations>;
   }
   ```

5. **Refactor `markServiceOrderPaymentFailed` (lines 304-339):**
   ```typescript
   // After fetching existing for idempotency check:
   const result = await deps.store.updateMany({
     where: {
       id: orderId,
       status: { notIn: [ServiceOrderStatus.CANCELLED, ServiceOrderStatus.DISPUTED, ServiceOrderStatus.DELIVERED, ServiceOrderStatus.COMPLETED] }
     },
     data: {
       paymentStatus: PaymentStatus.FAILED,
       status: ServiceOrderStatus.PENDING_PAYMENT,
       paymentReference: input.paymentReference ?? existing.paymentReference
     }
   });
   if (result.count === 0) {
     throw new ConcurrentModificationError("状态已变更，请刷新重试");
   }
   ```

6. **Refactor `markServiceOrderPaymentCancelled` (lines 341-371):**
   ```typescript
   const result = await deps.store.updateMany({
     where: {
       id: orderId,
       status: ServiceOrderStatus.PENDING_PAYMENT,
       paymentStatus: { not: PaymentStatus.CANCELLED }
     },
     data: {
       paymentStatus: PaymentStatus.CANCELLED,
       status: ServiceOrderStatus.PENDING_PAYMENT,
       paymentReference: input.paymentReference ?? existing.paymentReference
     }
   });
   ```

7. **Refactor `markServiceOrderDisputed` (lines 373-406):**
   ```typescript
   const result = await deps.store.updateMany({
     where: {
       id: orderId,
       status: { in: [ServiceOrderStatus.PAID, ServiceOrderStatus.IN_PROGRESS, ServiceOrderStatus.DELIVERED] }
     },
     data: { status: ServiceOrderStatus.DISPUTED }
   });
   ```

8. **Refactor `resolveDisputedServiceOrder` (lines 408-432):**
   ```typescript
   const result = await deps.store.updateMany({
     where: { id: orderId, status: ServiceOrderStatus.DISPUTED },
     data: { status: input.nextStatus }
   });
   ```

9. **Refactor `cancelServiceOrder` (lines 434-459):**
   ```typescript
   const result = await deps.store.updateMany({
     where: {
       id: orderId,
       status: ServiceOrderStatus.PENDING_PAYMENT,
       paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.FAILED, PaymentStatus.CANCELLED] }
     },
     data: { status: ServiceOrderStatus.CANCELLED }
   });
   ```

10. Export `ConcurrentModificationError` for use by route handlers.

11. Each function should still do the initial `findUniqueById` for:
    - 404 "not found" check
    - Idempotency check (already in target state → return early)
    - Getting `paymentReference` for fallback value
    Then use `updateMany` for the actual atomic transition.
</action>
<acceptance_criteria>
  - `OrderStore` type includes `updateMany` method
  - `defaultDeps.store` implements `updateMany` using `prisma.serviceOrder.updateMany`
  - `ConcurrentModificationError` class exported from the module
  - All 6 `markServiceOrder*` functions use `updateMany` instead of `updateOrder`
  - Each function still checks for "not found" and idempotency before the atomic update
  - `updateMany` uses conditional `where` clauses that match the expected current state
  - When `result.count === 0`, throws `ConcurrentModificationError` with message "状态已变更，请刷新重试"
  - TypeScript compiles without errors
</acceptance_criteria>
</task>

<task id="2" type="execute">
<read_first>
  - src/server/payments/adapter.ts — calls markServiceOrderPaid/markServiceOrderPaymentFailed in webhook handler
  - src/server/orders/service.ts — just refactored with ConcurrentModificationError
</read_first>
<action>
Update `src/server/payments/adapter.ts` to handle `ConcurrentModificationError` from webhook-initiated transitions:

1. Import `ConcurrentModificationError` from `@/server/orders/service`.

2. In the `applyPaymentEvent` function, wrap the `markServiceOrderPaid` / `markServiceOrderPaymentFailed` / `markServiceOrderPaymentCancelled` calls:

   ```typescript
   try {
     await markServiceOrderPaid({ orderId, paymentReference });
   } catch (error) {
     if (error instanceof ConcurrentModificationError) {
       // Webhook-initiated: return 200 (idempotent — already processed or state changed)
       // Re-fetch the order to return current state
       const order = await getServiceOrderById(orderId);
       return { order };
     }
     throw error;
   }
   ```

3. Apply the same pattern for `markServiceOrderPaymentFailed` and `markServiceOrderPaymentCancelled`.

4. The webhook handler should return 200 for concurrent modification (idempotent success), not 409. This matches D-09: "Webhook-initiated conflicts (DATA-03): return 200 (idempotent — already processed)".
</action>
<acceptance_criteria>
  - `src/server/payments/adapter.ts` imports `ConcurrentModificationError`
  - Webhook handler catches `ConcurrentModificationError` and returns 200 (not 409)
  - Non-webhook callers still get the error propagated (409 in route handlers)
  - TypeScript compiles without errors
</acceptance_criteria>
</task>

</tasks>

<verification>
1. Run `npx tsc --noEmit` to verify TypeScript compilation
2. Verify `ConcurrentModificationError` is exported from `src/server/orders/service.ts`
3. Verify all 6 mark* functions use `updateMany` (grep for `updateMany` in service.ts)
4. Verify `adapter.ts` catches `ConcurrentModificationError`
5. Run `npm test` to verify existing tests pass (note: tests may need updates for store mock)
</verification>

<success_criteria>
- All order status transitions are atomic (no read-then-write race)
- Concurrent modification throws `ConcurrentModificationError`
- Webhook handler treats concurrent modification as idempotent success (200)
- Route handlers will return 409 for concurrent modification
</success_criteria>

<must_haves>
<truths>
- Every status transition must use updateMany with a conditional where clause
- updateMany count === 0 means concurrent modification occurred
- Webhook-initiated transitions must return 200 (idempotent), not 409
- Non-webhook transitions should propagate the error (route handlers return 409)
</truths>
<goals>
- Eliminate all race conditions in order status transitions
</goals>
</must_haves>
