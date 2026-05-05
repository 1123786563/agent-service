---
phase: 3
plan: 4
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/mail/resend-mailer.ts
  - src/server/mail/index.ts
  - src/server/auth/magic-link.ts
  - package.json
autonomous: true
requirements:
  - AUTH-05
---

<objective>
Create Resend email adapter following dev-mailer pattern. Switch based on NODE_ENV and RESEND_API_KEY availability.
</objective>

<tasks>

<task id="1" type="execute">
<read_first>
  - src/server/mail/dev-mailer.ts — existing dev mailer
  - src/server/auth/magic-link.ts — sendDevLoginEmail usage
  - .planning/phases/03-authentication-expansion/03-CONTEXT.md — decisions D-09, D-10, D-11
</read_first>
<action>
1. Install resend dependency:
   ```bash
   npm install resend
   ```

2. Create `src/server/mail/resend-mailer.ts`:
   ```typescript
   import { Resend } from "resend";

   export async function sendResendLoginEmail(email: string, loginUrl: string) {
     const apiKey = process.env.RESEND_API_KEY;
     if (!apiKey) {
       throw new Error("RESEND_API_KEY is required for production email");
     }

     const resend = new Resend(apiKey);
     const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

     const { error } = await resend.emails.send({
       from,
       to: email,
       subject: "Your login link",
       text: `Click the link below to log in:\n\n${loginUrl}\n\nThis link expires in 15 minutes.`
     });

     if (error) {
       throw new Error(`Failed to send email: ${error.message}`);
     }
   }
   ```

3. Create `src/server/mail/index.ts` — unified mail sender:
   ```typescript
   import { sendDevLoginEmail } from "./dev-mailer";
   import { sendResendLoginEmail } from "./resend-mailer";

   export async function sendLoginEmail(email: string, loginUrl: string) {
     if (process.env.NODE_ENV === "production" && process.env.RESEND_API_KEY) {
       return sendResendLoginEmail(email, loginUrl);
     }

     if (process.env.RESEND_API_KEY) {
       try {
         return await sendResendLoginEmail(email, loginUrl);
       } catch {
         console.warn("Resend failed, falling back to dev mailer");
       }
     }

     return sendDevLoginEmail(email, loginUrl);
   }
   ```

4. Update `src/server/auth/magic-link.ts`:
   Replace `import { sendDevLoginEmail } from "@/server/mail/dev-mailer"` with:
   ```typescript
   import { sendLoginEmail } from "@/server/mail";
   ```
   And replace the `sendDevLoginEmail(email, loginUrl)` call with `sendLoginEmail(email, loginUrl)`.
</action>
<acceptance_criteria>
  - `resend` installed in dependencies
  - `src/server/mail/resend-mailer.ts` sends plain text login emails via Resend
  - `src/server/mail/index.ts` exports sendLoginEmail with env-based routing
  - `magic-link.ts` uses sendLoginEmail instead of sendDevLoginEmail
  - Production + RESEND_API_KEY → Resend; otherwise → dev-mailer
  - Missing RESEND_API_KEY in production throws error
  - Plain text email format (no HTML)
  - TypeScript compiles without errors
</acceptance_criteria>
</task>

</tasks>

<verification>
1. Run `npx tsc --noEmit`
2. Verify mail/index.ts exports sendLoginEmail
3. Verify magic-link.ts imports from mail/index
4. Run `npm test`
</verification>
