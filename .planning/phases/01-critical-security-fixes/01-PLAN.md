---
wave: 1
depends_on: []
files_modified:
  - src/app/api/payments/dev/complete/route.ts
autonomous: true
requirements:
  - SEC-01
---

# Plan 01: Guard Dev Payment Route

Guard `GET /api/payments/dev/complete` so it only works in development AND only for admins.

<objective>
Prevent the dev payment route from accepting requests in production or from non-admin users.
</objective>

<must_haves>
- Route returns 403 when `NODE_ENV === "production"`
- Route returns 403 when user is not authenticated or not an admin
- Route still works in development for admin users
- No new files created — only modify the existing route handler
</must_haves>

<read_first>
- `src/app/api/payments/dev/complete/route.ts` — current implementation
- `src/server/auth/session.ts` — `requireAdmin()` function (line 164)
</read_first>

<task>
<acceptance_criteria>
- `src/app/api/payments/dev/complete/route.ts` contains `requireAdmin()` call before any payment logic
- `src/app/api/payments/dev/complete/route.ts` contains `NODE_ENV` check that returns `Response.json({ errors: ["..."] }, { status: 403 })` when `process.env.NODE_ENV === "production"`
- The function signature remains `export async function GET(request: Request)`
</acceptance_criteria>

<action>
Edit `src/app/api/payments/dev/complete/route.ts`:

1. Add import: `import { requireAdmin } from "@/server/auth/session";`

2. At the top of the `GET` function body (line 6, inside the try block, before the URL parsing), add:
```typescript
if (process.env.NODE_ENV === "production") {
  return Response.json({ errors: ["Dev payment route is not available in production"] }, { status: 403 });
}

await requireAdmin();
```

These two checks must execute before any payment processing logic (before `url.searchParams.get("orderId")`).
</action>
</task>

<verification>
- `grep -n "requireAdmin" src/app/api/payments/dev/complete/route.ts` returns a match
- `grep -n "NODE_ENV.*production" src/app/api/payments/dev/complete/route.ts` returns a match
- TypeScript compiles without errors: `npx tsc --noEmit`
</verification>
