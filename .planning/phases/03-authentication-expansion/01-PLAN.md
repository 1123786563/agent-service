---
phase: 3
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/server/auth/password.ts
  - src/app/api/auth/register/route.ts
  - src/app/api/auth/login/route.ts
  - package.json
autonomous: true
requirements:
  - AUTH-01
---

<objective>
Add password-based authentication: Argon2id hashing, registration endpoint, and login endpoint. All auth methods converge on existing createSession().
</objective>

<tasks>

<task id="1" type="execute">
<read_first>
  - src/server/auth/session.ts — createSession pattern, session management
  - src/server/auth/magic-link.ts — user upsert pattern, AuthFlowError
  - prisma/schema.prisma — User model
  - .planning/phases/03-authentication-expansion/03-CONTEXT.md — decisions D-05, D-06, D-14
</read_first>
<action>
1. Install argon2 dependency:
   ```bash
   npm install argon2
   ```

2. Update `prisma/schema.prisma` — User model:
   Add `passwordHash String?` field (nullable — coexists with OAuth/magic link):
   ```prisma
   model User {
     ...
     passwordHash    String?
     ...
   }
   ```

3. Run migration:
   ```bash
   DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma validate
   ```

4. Create `src/server/auth/password.ts`:
   ```typescript
   import argon2 from "argon2";
   import { z } from "zod";

   const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

   export async function hashPassword(password: string): Promise<string> {
     return argon2.hash(password, { type: argon2.argon2id });
   }

   export async function verifyPassword(password: string, hash: string): Promise<boolean> {
     return argon2.verify(hash, password);
   }

   export function validatePassword(password: string): string {
     return passwordSchema.parse(password);
   }
   ```

5. Create `src/app/api/auth/register/route.ts`:
   ```typescript
   import { z } from "zod";
   import { prisma } from "@/server/db";
   import { hashPassword, validatePassword } from "@/server/auth/password";
   import { createSession } from "@/server/auth/session";

   const registerSchema = z.object({
     email: z.string().trim().min(1).email(),
     password: z.string().min(8, "Password must be at least 8 characters")
   });

   export async function POST(request: Request) {
     let payload: unknown;
     try {
       payload = await request.json();
     } catch {
       return Response.json({ errors: ["Request body must be valid JSON"] }, { status: 400 });
     }

     const parsed = registerSchema.safeParse(payload);
     if (!parsed.success) {
       const messages = parsed.error.issues.map((i) => i.message);
       return Response.json({ errors: messages }, { status: 400 });
     }

     const { email, password } = parsed.data;
     const normalizedEmail = email.toLowerCase();

     const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
     if (existing) {
       return Response.json({ errors: ["An account with this email already exists"] }, { status: 409 });
     }

     const passwordHash = await hashPassword(password);
     const user = await prisma.user.create({
       data: { email: normalizedEmail, passwordHash }
     });

     await createSession(user.id);

     return Response.json({ ok: true, user: { id: user.id, email: user.email } }, { status: 201 });
   }
   ```

6. Create `src/app/api/auth/login/route.ts`:
   ```typescript
   import { z } from "zod";
   import { prisma } from "@/server/db";
   import { verifyPassword } from "@/server/auth/password";
   import { createSession } from "@/server/auth/session";

   const loginSchema = z.object({
     email: z.string().trim().min(1).email(),
     password: z.string().min(1, "Password is required")
   });

   export async function POST(request: Request) {
     let payload: unknown;
     try {
       payload = await request.json();
     } catch {
       return Response.json({ errors: ["Request body must be valid JSON"] }, { status: 400 });
     }

     const parsed = loginSchema.safeParse(payload);
     if (!parsed.success) {
       const messages = parsed.error.issues.map((i) => i.message);
       return Response.json({ errors: messages }, { status: 400 });
     }

     const { email, password } = parsed.data;
     const normalizedEmail = email.toLowerCase();

     const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
     if (!user?.passwordHash) {
       return Response.json({ errors: ["Invalid email or password"] }, { status: 401 });
     }

     const valid = await verifyPassword(password, user.passwordHash);
     if (!valid) {
       return Response.json({ errors: ["Invalid email or password"] }, { status: 401 });
     }

     await createSession(user.id);

     return Response.json({ ok: true, user: { id: user.id, email: user.email } });
   }
   ```
</action>
<acceptance_criteria>
  - `argon2` installed in dependencies
  - `prisma/schema.prisma` User model has `passwordHash String?` field
  - `src/server/auth/password.ts` exports hashPassword, verifyPassword, validatePassword
  - `src/app/api/auth/register/route.ts` creates user with hashed password + session
  - `src/app/api/auth/login/route.ts` verifies password + creates session
  - Duplicate email registration returns 409
  - Wrong password returns 401 with generic message
  - All endpoints follow `{ errors: string[] }` error format
  - TypeScript compiles without errors
</acceptance_criteria>
</task>

</tasks>

<verification>
1. Run `npx tsc --noEmit`
2. Verify `src/server/auth/password.ts` exports
3. Verify register and login routes exist
4. Run `npm test`
</verification>
