---
phase: 2
plan: 5
type: execute
wave: 3
depends_on: [4]
files_modified:
  - prisma/schema.prisma
  - src/server/agents/product-service.ts
autonomous: true
requirements:
  - DATA-04
---

<objective>
Add `(agentPackageId, userId)` unique constraint to AgentPackageReview model and handle P2002 duplicate constraint errors gracefully, returning 409 Conflict per D-09.
</objective>

<tasks>

<task id="1" type="execute">
<read_first>
  - prisma/schema.prisma — AgentPackageReview model (lines 204-219)
  - src/server/agents/product-service.ts — submitAgentPackageReview function (lines 44-64)
  - src/server/payments/ledger.ts — P2002 catch pattern reference (lines 103-118)
  - .planning/phases/02-input-validation-access-control/02-CONTEXT.md — decisions about DATA-04
  - .planning/phases/02-input-validation-access-control/02-RESEARCH.md — section 5 (Duplicate Review)
</read_first>
<action>
1. **Update `prisma/schema.prisma`** — AgentPackageReview model:
   a. Change `userId String?` to `userId String` (remove nullable — reviews require authentication).
   b. Add `@@unique([agentPackageId, userId])` after the existing indexes.
   
   The updated model should look like:
   ```prisma
   model AgentPackageReview {
     id             String       @id @default(cuid())
     agentPackageId String
     userId         String
     rating         Int
     title          String?
     body           String?
     createdAt      DateTime     @default(now())
     updatedAt      DateTime     @updatedAt

     agentPackage   AgentPackage @relation(fields: [agentPackageId], references: [id], onDelete: Cascade)
     user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

     @@unique([agentPackageId, userId])
     @@index([agentPackageId, createdAt])
     @@index([userId, createdAt])
   }
   ```

2. **Run migration:**
   ```bash
   npx prisma migrate dev --name add-review-unique-constraint
   ```
   
   If migration fails due to existing null userId or duplicates, clean up data first:
   ```sql
   DELETE FROM "AgentPackageReview" WHERE "userId" IS NULL;
   DELETE FROM "AgentPackageReview" a USING "AgentPackageReview" b
   WHERE a.id > b.id AND a."agentPackageId" = b."agentPackageId" AND a."userId" = b."userId";
   ```

3. **Update `src/server/agents/product-service.ts`** — `submitAgentPackageReview` function:
   a. Change parameter type from `userId?: string | null` to `userId: string` (required).
   b. Remove the `?? null` fallback for userId.
   c. Wrap the `create` call in a try-catch for P2002:
   ```typescript
   export async function submitAgentPackageReview(input: {
     agentPackageId: string;
     userId: string;
     rating: number;
     title?: string | null;
     body?: string | null;
   }, store: ProductStore = defaultStore) {
     if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
       throw new Error("Review rating must be between 1 and 5");
     }

     try {
       return await store.agentPackageReview.create({
         data: {
           agentPackageId: input.agentPackageId,
           userId: input.userId,
           rating: input.rating,
           title: input.title?.trim() || null,
           body: input.body?.trim() || null
         }
       });
     } catch (error: unknown) {
       if (
         typeof error === "object" &&
         error !== null &&
         "code" in error &&
         (error as { code: string }).code === "P2002"
       ) {
         throw new Error("您已评价过此智能体");
       }
       throw error;
     }
   }
   ```

4. **Generate Prisma client:**
   ```bash
   npx prisma generate
   ```
</action>
<acceptance_criteria>
  - `prisma/schema.prisma` AgentPackageReview has `@@unique([agentPackageId, userId])`
  - AgentPackageReview `userId` is `String` (not nullable)
  - Migration file created in `prisma/migrations/`
  - `submitAgentPackageReview` accepts `userId: string` (not optional/nullable)
  - P2002 error is caught and throws "您已评价过此智能体"
  - `npx prisma generate` succeeds
  - TypeScript compiles without errors
</acceptance_criteria>
</task>

</tasks>

<verification>
1. Run `npx prisma migrate dev --name verify-review-unique` to verify migration applied
2. Grep for `@@unique([agentPackageId, userId])` in `prisma/schema.prisma`
3. Grep for `P2002` in `src/server/agents/product-service.ts`
4. Grep for `您已评价过此智能体` in product-service.ts
5. Run `npx tsc --noEmit` to verify TypeScript compilation
6. Run `npm test` to verify tests pass
</verification>

<success_criteria>
- AgentPackageReview has unique constraint on (agentPackageId, userId)
- Duplicate review submission returns user-friendly error message
- userId is required for review submission (no anonymous reviews)
- P2002 constraint violation handled gracefully
</success_criteria>

<must_haves>
<truths>
- Unique constraint must be at database level (not just application check)
- userId must be non-nullable (reviews require authentication)
- P2002 error message must be "您已评价过此智能体" per D-09
</truths>
<goals>
- Prevent duplicate reviews for the same agent package by the same user
</goals>
</must_haves>
