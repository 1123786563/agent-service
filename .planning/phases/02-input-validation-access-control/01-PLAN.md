---
phase: 2
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/middleware.ts
autonomous: true
requirements:
  - SEC-03
---

<objective>
Create Next.js middleware.ts with CSRF Origin verification for all `/api/*` POST routes, exempting Stripe webhook and OAuth callback routes that use signature-based validation.
</objective>

<tasks>

<task id="1" type="execute">
<read_first>
  - src/app/api/payments/webhook/route.ts — exempt route (Stripe signature validation)
  - src/app/api/auth/request-link/route.ts — magic link request route (NOT exempt)
  - src/app/api/consultations/route.ts — protected route example
  - src/app/api/creator/agents/route.ts — protected route example
  - .planning/phases/02-input-validation-access-control/02-CONTEXT.md — decisions D-01, D-02
  - .planning/phases/02-input-validation-access-control/02-RESEARCH.md — section 1 (CSRF)
</read_first>
<action>
Create `src/middleware.ts` with the following implementation:

1. Export a `middleware` function and a `config` object with matcher `['/api/:path*']`.

2. In the middleware function:
   a. Only check POST requests (method === 'POST'). For all other methods, call `NextResponse.next()`.
   b. Define exempt paths as an array:
      - `/api/payments/webhook` (Stripe validates via signature)
      - `/api/auth/consume` (magic link click — GET request technically, but list for safety)
   c. Extract the request pathname using `new URL(request.url).pathname`.
   d. If pathname matches an exempt path, call `NextResponse.next()`.
   e. Extract the `Origin` header: `request.headers.get('origin')`.
   f. Get `APP_URL` from `process.env.APP_URL ?? 'http://localhost:3000'`.
   g. Parse both URLs and compare hostnames:
      - Parse `APP_URL` with `new URL(APP_URL)` to get `appHostname`.
      - If Origin is null/empty:
        - In development (`process.env.NODE_ENV !== 'production'`): allow through (API clients like curl).
        - In production: return 403 JSON response.
      - If Origin is present: parse with `new URL(origin)`.
      - Allow if `originHostname === appHostname` OR `originHostname.endsWith('.' + appHostname)` (subdomain matching).
   h. If origin check fails: return `new NextResponse(JSON.stringify({ errors: ["CSRF origin verification failed"] }), { status: 403, headers: { 'Content-Type': 'application/json' } })`.
   i. If origin check passes: call `NextResponse.next()`.

3. Export config:
   ```typescript
   export const config = {
     matcher: ['/api/:path*'],
   };
   ```

4. Import `NextResponse` from `next/server` and `type NextRequest` from `next/server`.

5. Use the typed function signature: `export function middleware(request: NextRequest)`.
</action>
<acceptance_criteria>
  - File `src/middleware.ts` exists
  - File exports a function named `middleware`
  - File exports a `config` object with `matcher: ['/api/:path*']`
  - Middleware only processes POST requests
  - Exempt paths include `/api/payments/webhook`
  - Origin matching compares against `APP_URL` env var hostname
  - Subdomain matching works: `origin.endsWith('.' + appHostname)`
  - Missing Origin header: allowed in dev, rejected in production
  - Failed origin returns 403 with `{ errors: ["CSRF origin verification failed"] }`
  - TypeScript compiles without errors
</acceptance_criteria>
</task>

</tasks>

<verification>
1. Run `npx tsc --noEmit` to verify TypeScript compilation
2. Verify `src/middleware.ts` exists and exports middleware function and config
3. Grep for `CSRF origin verification failed` in the file
4. Grep for `/api/payments/webhook` exemption
5. Grep for `APP_URL` origin comparison
</verification>

<success_criteria>
- `src/middleware.ts` created with CSRF Origin verification
- All `/api/*` POST routes protected (except exempt routes)
- Origin matching against `APP_URL` with subdomain support
- 403 response for CSRF failures
</success_criteria>

<must_haves>
<truths>
- Origin header must be validated against APP_URL for all non-exempt POST routes
- Stripe webhook must be exempt (validated by Stripe signature)
- Subdomain matching must work (e.g., sub.example.com matches example.com)
</truths>
<goals>
- Prevent cross-site request forgery on all state-changing API endpoints
</goals>
</must_haves>
