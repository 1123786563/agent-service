---
phase: 2
plan: 6
type: execute
wave: 3
depends_on: [4]
files_modified:
  - prisma/schema.prisma
  - src/server/orders/service.ts
autonomous: true
requirements:
  - DATA-05
---

<objective>
Add unique constraint on ServiceOrder.consultationId to prevent duplicate orders for the same consultation, and handle P2002 gracefully in createServiceOrder.
</objective>

<tasks>

<task id="1" type="execute">
<read_first>
  - prisma/schema.prisma — ServiceOrder model (lines 300-336)
  - src/server/orders/service.ts — createServiceOrder function (lines 195-247), consultationHasOrder and createOrderForConsultation store methods
  - src/server/payments/ledger.ts — P2002 catch pattern reference (lines 103-118)
  - .planning/phases/02-input-validation-access-control/02-CONTEXT.md — decisions about DATA-05
  - .planning/phases/02-input-validation-access-control/02-RESEARCH.md — section 6 (Consultation-to-Order Race)
</read_first>
<action>
1. **Update `prisma/schema.prisma`** — ServiceOrder model:
   Add `@@unique([consultationId])` after the existing indexes:
   ```prisma
   @@unique([consultationId])
   ```
   
   This replaces the application-level `consultationHasOrder()` check with a database-level guarantee.

2. **Run migration:**
   ```bash
   npx prisma migrate dev --name add-consultation-order-unique
   ```
   
   If migration fails due to duplicate consultationId values:
   ```sql
   -- Keep the most recent order for each consultation, delete duplicates
   DELETE FROM "ServiceOrder" a USING "ServiceOrder" b
   WHERE a.id < b.id AND a."consultationId" = b."consultationId";
   ```

3. **Update `src/server/orders/service.ts`** — `createServiceOrder` function:
   a. Remove the `consultationHasOrder` check (lines 232-234) — the unique constraint handles this.
   b. Remove `consultationHasOrder` from `OrderStore` type and `defaultDeps.store`.
   c. Wrap the `deps.store.createOrderForConsultation` call in a try-catch for P2002:
   ```typescript
   try {
     return await deps.store.createOrderForConsultation({
       consultationId,
       buyerEmail: consultation.buyerEmail,
       buyerUserId: consultation.buyerUserId,
       providerId,
       title,
       scope,
       priceCents: input.priceCents,
       currency,
       paymentProvider
     });
   } catch (error: unknown) {
     if (
       typeof error === "object" &&
       error !== null &&
       "code" in error &&
       (error as { code: string }).code === "P2002"
     ) {
       // Duplicate consultationId — order already exists for this consultation
       throw new Error("订单已创建");
     }
     throw error;
   }
   ```

4. **Generate Prisma client:**
   ```bash
   npx prisma generate
   ```
</action>
<acceptance_criteria>
  - `prisma/schema.prisma` ServiceOrder has `@@unique([consultationId])`
  - Migration file created in `prisma/migrations/`
  - `consultationHasOrder` removed from `OrderStore` type and `defaultDeps.store`
  - `createServiceOrder` no longer calls `consultationHasOrder`
  - P2002 error from `createOrderForConsultation` is caught and throws "订单已创建"
  - `npx prisma generate` succeeds
  - TypeScript compiles without errors
</acceptance_criteria>
</task>

</tasks>

<verification>
1. Run `npx prisma migrate status` to verify migration applied
2. Grep for `@@unique([consultationId])` in `prisma/schema.prisma`
3. Grep for `consultationHasOrder` in `src/server/orders/service.ts` — should NOT be found (removed)
4. Grep for `订单已创建` in `src/server/orders/service.ts`
5. Grep for `P2002` in `src/server/orders/service.ts`
6. Run `npx tsc --noEmit` to verify TypeScript compilation
7. Run `npm test` to verify tests pass
</verification>

<success_criteria>
- ServiceOrder has unique constraint on consultationId
- Two concurrent consultation-to-order attempts result in only one order
- Second attempt returns "订单已创建" error (409 at route level)
- Application-level duplicate check removed (replaced by database constraint)
</success_criteria>

<must_haves>
<truths>
- Unique constraint at database level (not just application check)
- P2002 error message must be "订单已创建" per D-09
- Remove the now-redundant consultationHasOrder check
</truths>
<goals>
- Fix consultation-to-order race condition with database-level guarantee
</goals>
</must_haves>
