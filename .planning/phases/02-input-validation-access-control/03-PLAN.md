---
phase: 2
plan: 3
type: execute
wave: 2
depends_on: [1, 2]
files_modified:
  - src/app/api/orders/[id]/deliveries/route.ts
  - src/app/api/creator/agents/route.ts
  - src/server/rate-limit.ts
autonomous: true
requirements:
  - SEC-05
  - SEC-06
---

<objective>
Add file size validation (25MB limit) and file type whitelist validation to the delivery upload endpoint, and add per-user/per-email rate limiting at route handler level for upload and auth endpoints.
</objective>

<tasks>

<task id="1" type="execute">
<read_first>
  - src/app/api/orders/[id]/deliveries/route.ts — delivery upload route (ZERO validation currently)
  - src/server/agents/zip-validator.ts — reference: MAX_ZIP_BYTES = 25 * 1024 * 1024
  - .planning/phases/02-input-validation-access-control/02-CONTEXT.md — decisions D-07, D-08
  - .planning/phases/02-input-validation-access-control/02-RESEARCH.md — section 3 (File Upload)
</read_first>
<action>
Update `src/app/api/orders/[id]/deliveries/route.ts` to add file validation:

1. Define constants at the top of the file (after imports):
   ```typescript
   const MAX_DELIVERY_FILE_BYTES = 25 * 1024 * 1024; // 25MB
   const ALLOWED_DELIVERY_EXTENSIONS = new Set([
     '.zip', '.pdf',
     '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
     '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
     '.txt'
   ]);
   ```

2. After extracting `file` from FormData and checking `instanceof File`:
   a. **Size check:** Add before the `createDeliveryForOrder` call:
      ```typescript
      if (file.size > MAX_DELIVERY_FILE_BYTES) {
        return Response.json({
          errors: [`File exceeds maximum size of ${MAX_DELIVERY_FILE_BYTES / (1024 * 1024)}MB`]
        }, { status: 413 });
      }
      ```
   b. **Type check:** Extract extension and validate:
      ```typescript
      const fileName = file.name.toLowerCase();
      const extension = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
      if (!ALLOWED_DELIVERY_EXTENSIONS.has(extension)) {
        return Response.json({
          errors: [`File type not allowed. Allowed types: ${Array.from(ALLOWED_DELIVERY_EXTENSIONS).join(', ')}`]
        }, { status: 415 });
      }
      ```
   c. Also validate `Buffer.byteLength` of the actual buffer:
      ```typescript
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.byteLength > MAX_DELIVERY_FILE_BYTES) {
        return Response.json({
          errors: [`File exceeds maximum size of ${MAX_DELIVERY_FILE_BYTES / (1024 * 1024)}MB`]
        }, { status: 413 });
      }
      ```

3. Replace the `Buffer.from(await file.arrayBuffer())` call in the try block with the pre-validated `buffer` variable.

4. Return 413 for oversized files and 415 for disallowed types.
</action>
<acceptance_criteria>
  - `src/app/api/orders/[id]/deliveries/route.ts` contains `MAX_DELIVERY_FILE_BYTES` constant set to 25MB
  - File size check returns 413 for files exceeding 25MB
  - File type check returns 415 for files with disallowed extensions
  - `ALLOWED_DELIVERY_EXTENSIONS` includes: .zip, .pdf, .jpg, .jpeg, .png, .gif, .webp, .svg, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt
  - Both `file.size` check and `buffer.byteLength` check are present
  - TypeScript compiles without errors
</acceptance_criteria>
</task>

<task id="2" type="execute">
<read_first>
  - src/app/api/orders/[id]/deliveries/route.ts — just modified with file validation
  - src/app/api/creator/agents/route.ts — agent upload route
  - src/app/api/auth/request-link/route.ts — magic link route
  - src/app/api/consultations/route.ts — consultation route
  - src/server/rate-limit.ts — rate limiter with config constants
</read_first>
<action>
Add per-key rate limiting at route handler level for upload and auth endpoints:

1. **Update `src/app/api/orders/[id]/deliveries/route.ts`:**
   - Import `rateLimiter` and `RATE_LIMIT_UPLOAD` from `@/server/rate-limit`.
   - After the `requireCreator()` call (line 20), add:
     ```typescript
     const uploadLimit = rateLimiter.check(`upload:${creator.id}`, RATE_LIMIT_UPLOAD);
     if (!uploadLimit.allowed) {
       return Response.json({
         errors: ["Rate limited"]
       }, {
         status: 429,
         headers: { 'Retry-After': String(Math.ceil(uploadLimit.retryAfterMs / 1000)) }
       });
     }
     ```

2. **Update `src/app/api/creator/agents/route.ts`:**
   - Import `rateLimiter` and `RATE_LIMIT_UPLOAD` from `@/server/rate-limit`.
   - After the `requireCreator()` call (line 21), add the same upload rate limit check using `user.id`.

3. **Update `src/app/api/auth/request-link/route.ts`:**
   - Import `rateLimiter` and `RATE_LIMIT_AUTH` from `@/server/rate-limit`.
   - After extracting `email` from FormData, normalize and check:
     ```typescript
     const normalizedEmail = email.trim().toLowerCase();
     const authLimit = rateLimiter.check(`auth:${normalizedEmail}`, RATE_LIMIT_AUTH);
     if (!authLimit.allowed) {
       redirect(`/login?error=rate_limited`);
       return;
     }
     ```
   - Pass the original `email` to `requestMagicLink()` (not normalized — the function handles that).

4. **Update `src/app/api/consultations/route.ts`:**
   - Import `rateLimiter` and `RATE_LIMIT_CONSULTATION` from `@/server/rate-limit`.
   - After the `getCurrentUser()` auth check, add:
     ```typescript
     const consultLimit = rateLimiter.check(`consultation:${user.id}`, RATE_LIMIT_CONSULTATION);
     if (!consultLimit.allowed) {
       return Response.json({
         errors: ["Rate limited"]
       }, {
         status: 429,
         headers: { 'Retry-After': String(Math.ceil(consultLimit.retryAfterMs / 1000)) }
       });
     }
     ```
</action>
<acceptance_criteria>
  - `src/app/api/orders/[id]/deliveries/route.ts` imports and uses `rateLimiter` with `RATE_LIMIT_UPLOAD`
  - `src/app/api/creator/agents/route.ts` imports and uses `rateLimiter` with `RATE_LIMIT_UPLOAD`
  - `src/app/api/auth/request-link/route.ts` imports and uses `rateLimiter` with `RATE_LIMIT_AUTH`
  - `src/app/api/consultations/route.ts` imports and uses `rateLimiter` with `RATE_LIMIT_CONSULTATION`
  - All rate limit checks return 429 with `Retry-After` header (except auth route which redirects)
  - Rate limit keys use appropriate identifiers: user ID for uploads/consultations, email for auth
  - TypeScript compiles without errors
</acceptance_criteria>
</task>

</tasks>

<verification>
1. Run `npx tsc --noEmit` to verify TypeScript compilation
2. Verify delivery route has `MAX_DELIVERY_FILE_BYTES` and `ALLOWED_DELIVERY_EXTENSIONS`
3. Verify delivery route returns 413 for oversized files
4. Verify delivery route returns 415 for disallowed types
5. Verify all 4 routes import and use `rateLimiter`
6. Run `npm test` to verify existing tests still pass
</verification>

<success_criteria>
- Delivery upload rejects files > 25MB with 413
- Delivery upload rejects non-whitelisted file types with 415
- Upload endpoints: 10 req/min per user
- Auth endpoint: 5 req/min per email
- Consultation endpoint: 10 req/min per user
</success_criteria>

<must_haves>
<truths>
- Delivery upload must have BOTH size and type validation (currently has neither)
- File type whitelist must match D-08: ZIP, PDF, images, documents
- Rate limiting at route level uses per-user/per-email keys (not IP)
</truths>
<goals>
- Prevent oversized and wrong-type uploads
- Prevent abuse of upload, auth, and consultation endpoints
</goals>
</must_haves>
