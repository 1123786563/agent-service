---
wave: 1
depends_on: []
files_modified:
  - instrumentation.ts (NEW)
autonomous: true
requirements:
  - SEC-07
---

# Plan 03: Production Environment Variable Validation

Create `instrumentation.ts` to validate all required environment variables at server startup. Missing vars cause fail-fast with clear error messages.

<objective>
Prevent the application from starting in production with missing or empty required environment variables.
</objective>

<must_haves>
- New file `instrumentation.ts` at project root using Next.js instrumentation hook
- Validates in production only (`NODE_ENV === "production"`)
- Fail-fast with `process.exit(1)` and descriptive error naming missing variable
- Validates: DATABASE_URL, APP_URL, DOWNLOAD_TICKET_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (when PAYMENT_PROVIDER=stripe), ADMIN_EMAILS
- Uses Zod for type-safe validation (already a project dependency)
</must_haves>

<read_first>
- `package.json` — confirm `zod` is a dependency
- `src/server/auth/session.ts` — `isAdminEmail` function shows how ADMIN_EMAILS is used (line 48)
</read_first>

<task>
<acceptance_criteria>
- File `instrumentation.ts` exists at project root
- File exports `async function register()` (Next.js instrumentation hook)
- Function checks `process.env.NODE_ENV === "production"` and returns early if not production
- File validates all required env vars: `DATABASE_URL`, `APP_URL`, `DOWNLOAD_TICKET_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_EMAILS`
- STRIPE vars are only required when `PAYMENT_PROVIDER === "stripe"`
- Error messages include the name of each missing variable
- `process.exit(1)` is called when validation fails
</acceptance_criteria>

<action>
Create `instrumentation.ts` at the project root (`/Users/yongjunwu/trea/saas-idea/instrumentation.ts`):

```typescript
import { z } from "zod";

export async function register() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const isStripe = process.env.PAYMENT_PROVIDER === "stripe";

  const envSchema = z.object({
    DATABASE_URL: z.string().min(1),
    APP_URL: z.string().min(1),
    DOWNLOAD_TICKET_SECRET: z.string().min(1),
    ADMIN_EMAILS: z.string().min(1),
    ...(isStripe
      ? {
          STRIPE_SECRET_KEY: z.string().min(1),
          STRIPE_WEBHOOK_SECRET: z.string().min(1),
        }
      : {}),
  });

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join("."));
    console.error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    process.exit(1);
  }
}
```

This uses the Next.js `instrumentation.ts` convention — the `register()` function runs once when the server starts.
</action>
</task>

<verification>
- `test -f instrumentation.ts && echo "EXISTS"` confirms file exists
- `grep -n "register" instrumentation.ts` returns the exported function
- `grep -n "DATABASE_URL" instrumentation.ts` returns a match
- `grep -n "process.exit" instrumentation.ts` returns a match
- TypeScript compiles without errors: `npx tsc --noEmit`
</verification>
