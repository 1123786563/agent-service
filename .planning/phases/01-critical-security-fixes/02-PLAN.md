---
wave: 1
depends_on: []
files_modified:
  - src/app/api/consultations/route.ts
autonomous: true
requirements:
  - SEC-02
---

# Plan 02: Add Auth to Consultation Endpoint

Require authenticated session for `POST /api/consultations` to prevent spam with arbitrary emails.

<objective>
Block unauthenticated consultation creation. Only logged-in users can create consultations.
</objective>

<must_haves>
- `POST /api/consultations` returns 401 for unauthenticated requests
- Authenticated users can still create consultations
- The buyerEmail should be derived from the authenticated user's email, not from the request body (prevents email spoofing)
</must_haves>

<read_first>
- `src/app/api/consultations/route.ts` — current implementation (no auth check)
- `src/server/auth/session.ts` — `getCurrentUser()` function (line 150)
</read_first>

<task>
<acceptance_criteria>
- `src/app/api/consultations/route.ts` contains `getCurrentUser` import
- `src/app/api/consultations/route.ts` returns `Response.json({ errors: ["Authentication required"] }, { status: 401 })` when user is null
- The `buyerEmail` passed to `createConsultation` uses `user.email` instead of the raw request body `buyerEmail` field
</acceptance_criteria>

<action>
Edit `src/app/api/consultations/route.ts`:

1. Add import: `import { getCurrentUser } from "@/server/auth/session";`

2. After the JSON payload parsing and validation block (after the `if (!payload || typeof payload !== "object")` check), add:
```typescript
const user = await getCurrentUser();
if (!user) {
  return Response.json({ errors: ["Authentication required"] }, { status: 401 });
}
```

3. In the `createConsultation` call, replace `buyerEmail: buyerEmail ?? ""` with `buyerEmail: user.email.toLowerCase()`. This prevents requesters from impersonating other users' email addresses.
</action>
</task>

<verification>
- `grep -n "getCurrentUser" src/app/api/consultations/route.ts` returns a match
- `grep -n "401" src/app/api/consultations/route.ts` returns a match
- `grep -n "user.email" src/app/api/consultations/route.ts` returns a match
- TypeScript compiles without errors: `npx tsc --noEmit`
</verification>
