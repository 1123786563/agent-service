---
phase: 3
plan: 5
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/orders/service.ts
  - src/app/api/consultations/route.ts
  - src/app/api/orders/[id]/pay/route.ts
autonomous: true
requirements:
  - AUTH-06
---

<objective>
Refactor order and consultation routes to verify buyer identity by userId from session instead of email. Prepares for multi-email OAuth accounts.
</objective>

<tasks>

<task id="1" type="execute">
<read_first>
  - src/server/orders/service.ts — findManyForBuyerEmail, order listing functions
  - src/app/api/consultations/route.ts — consultation creation with buyerEmail
  - src/app/api/orders/[id]/pay/route.ts — payment session with buyerEmail check
  - src/server/auth/session.ts — getCurrentUser
  - .planning/phases/03-authentication-expansion/03-CONTEXT.md — decision D-12
</read_first>
<action>
1. Update `src/server/orders/service.ts`:
   a. Add `findManyForBuyerUserId` to OrderStore type and implementation:
   ```typescript
   findManyForBuyerUserId(buyerUserId: string): Promise<ServiceOrderWithRelations[]>;
   ```
   Implementation:
   ```typescript
   findManyForBuyerUserId(buyerUserId) {
     return prisma.serviceOrder.findMany({
       where: { buyerUserId },
       include: { consultation: true, buyerUser: true, provider: true },
       orderBy: { createdAt: "desc" }
     });
   }
   ```

   b. Export new function:
   ```typescript
   export async function listServiceOrdersForBuyerUserId(buyerUserId: string, deps: OrderServiceDeps = defaultDeps) {
     const normalizedBuyerUserId = buyerUserId.trim();
     if (!normalizedBuyerUserId) {
       throw new Error("Buyer user ID is required");
     }
     return deps.store.findManyForBuyerUserId(normalizedBuyerUserId);
   }
   ```

2. Update `src/app/api/consultations/route.ts`:
   Change from `buyerEmail: user.email.toLowerCase()` to `buyerUserId: user.id` in the createConsultation call (if consultation service supports it). Otherwise, ensure consultation stores both buyerEmail AND buyerUserId from the authenticated user.

3. Update `src/app/api/orders/[id]/pay/route.ts`:
   Change buyer verification from email comparison to userId comparison:
   ```typescript
   // Before: if (order.buyerEmail !== user.email)
   // After: if (order.buyerUserId && order.buyerUserId !== user.id) || (!order.buyerUserId && order.buyerEmail !== user.email)
   ```
   This handles both legacy orders (no buyerUserId) and new orders.

4. Update any buyer-facing order listing routes to use userId instead of email.
</action>
<acceptance_criteria>
  - OrderStore has findManyForBuyerUserId method
  - listServiceOrdersForBuyerUserId exported
  - Consultation route uses user.id for buyerUserId
  - Pay route verifies buyer by userId with email fallback for legacy orders
  - TypeScript compiles without errors
</acceptance_criteria>
</task>

</tasks>

<verification>
1. Run `npx tsc --noEmit`
2. Verify findManyForBuyerUserId in service.ts
3. Verify consultation route uses userId
4. Run `npm test`
</verification>
