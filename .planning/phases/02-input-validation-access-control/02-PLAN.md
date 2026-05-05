---
phase: 2
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/rate-limit.ts
  - src/middleware.ts
autonomous: true
requirements:
  - SEC-04
---

<objective>
Create a sliding-window rate limiter module and integrate IP-based rate limiting into the existing middleware.ts alongside CSRF verification. Per-route per-email/per-user limiting added at route handler level.
</objective>

<tasks>

<task id="1" type="execute">
<read_first>
  - src/middleware.ts — existing CSRF middleware (created in Plan 1)
  - .planning/phases/02-input-validation-access-control/02-CONTEXT.md — decisions D-03 through D-06
  - .planning/phases/02-input-validation-access-control/02-RESEARCH.md — section 2 (Rate Limiting)
</read_first>
<action>
Create `src/server/rate-limit.ts` with a `RateLimiter` class:

1. Define a `RateLimitConfig` type:
   ```typescript
   type RateLimitConfig = {
     windowMs: number;     // sliding window duration in milliseconds
     maxRequests: number;  // max requests per window
   };
   ```

2. Define a `RateLimitResult` type:
   ```typescript
   type RateLimitResult = {
     allowed: boolean;
     retryAfterMs: number;
     remaining: number;
   };
   ```

3. Create a `SlidingWindowCounter` class:
   - Private `buckets`: `Map<string, { count: number; resetAt: number }>`
   - Constructor accepts optional `defaultConfig: RateLimitConfig`
   - Method `check(key: string, config?: RateLimitConfig): RateLimitResult`:
     a. Use provided config or fall back to default config.
     b. Get current time: `Date.now()`.
     c. Get or create bucket for key.
     d. If `now >= bucket.resetAt`: reset bucket (`count = 0, resetAt = now + config.windowMs`).
     e. If `bucket.count >= config.maxRequests`: return `{ allowed: false, retryAfterMs: bucket.resetAt - now, remaining: 0 }`.
     f. Otherwise: increment count, return `{ allowed: true, retryAfterMs: 0, remaining: config.maxRequests - bucket.count }`.
   - Method `reset(key: string): void` — remove a bucket entry.

4. Export a singleton `rateLimiter` instance with default config: `{ windowMs: 60_000, maxRequests: 60 }` (60 requests per minute).

5. Export named config constants for route-specific limits:
   ```typescript
   export const RATE_LIMIT_AUTH: RateLimitConfig = { windowMs: 60_000, maxRequests: 5 };       // 5/min per email
   export const RATE_LIMIT_UPLOAD: RateLimitConfig = { windowMs: 60_000, maxRequests: 10 };    // 10/min per user
   export const RATE_LIMIT_WEBHOOK: RateLimitConfig = { windowMs: 60_000, maxRequests: 100 };  // 100/min per IP
   export const RATE_LIMIT_CONSULTATION: RateLimitConfig = { windowMs: 60_000, maxRequests: 10 }; // 10/min per user
   ```

6. Export all types and the class for testability.
</action>
<acceptance_criteria>
  - File `src/server/rate-limit.ts` exists
  - Exports `SlidingWindowCounter` class
  - Exports `rateLimiter` singleton instance
  - Exports `RATE_LIMIT_AUTH`, `RATE_LIMIT_UPLOAD`, `RATE_LIMIT_WEBHOOK`, `RATE_LIMIT_CONSULTATION` constants
  - `check()` method returns `{ allowed, retryAfterMs, remaining }`
  - Buckets reset when `now >= resetAt`
  - TypeScript compiles without errors
</acceptance_criteria>
</task>

<task id="2" type="execute">
<read_first>
  - src/middleware.ts — current CSRF-only middleware
  - src/server/rate-limit.ts — rate limiter (created in task 1)
  - .planning/phases/02-input-validation-access-control/02-CONTEXT.md — decision D-03 (merge into middleware)
</read_first>
<action>
Update `src/middleware.ts` to add IP-based rate limiting alongside CSRF:

1. Import `rateLimiter` from `@/server/rate-limit`.

2. After the CSRF check passes, add rate limiting:
   a. Extract client IP: `const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.ip ?? 'unknown'`.
   b. Determine rate limit key based on route:
      - `/api/payments/webhook`: key = `webhook:${ip}`, config = `RATE_LIMIT_WEBHOOK`
      - All other routes: key = `ip:${ip}`, config = default (60/min)
   c. Call `rateLimiter.check(key, config)`.
   d. If `result.allowed === false`:
      Return `new NextResponse(JSON.stringify({ errors: ["Rate limited"] }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)) } })`.
   e. If allowed: add `X-RateLimit-Remaining` header to response and continue.

3. For the webhook route, the rate limit check must happen BEFORE the CSRF exempt check (webhook needs rate limiting but not CSRF). Restructure the middleware flow:
   a. First: rate limit check (all routes including webhook)
   b. Then: CSRF check (non-exempt routes only)

4. Import `RATE_LIMIT_WEBHOOK` from `@/server/rate-limit`.
</action>
<acceptance_criteria>
  - `src/middleware.ts` imports `rateLimiter` and `RATE_LIMIT_WEBHOOK` from `@/server/rate-limit`
  - Rate limiting runs on ALL `/api/*` routes including webhook
  - Rate limit key is IP-based using `x-forwarded-for` header
  - Webhook route uses `RATE_LIMIT_WEBHOOK` config (100/min)
  - Other routes use default config (60/min)
  - Rate limit exceeded returns 429 with `{ errors: ["Rate limited"] }` and `Retry-After` header
  - Rate limit passed adds `X-RateLimit-Remaining` header
  - CSRF check still works after rate limit for non-exempt routes
  - TypeScript compiles without errors
</acceptance_criteria>
</task>

</tasks>

<verification>
1. Run `npx tsc --noEmit` to verify TypeScript compilation
2. Verify `src/server/rate-limit.ts` exports `rateLimiter`, `SlidingWindowCounter`, and config constants
3. Verify `src/middleware.ts` imports rate limiter and applies IP-based checks
4. Grep for `Retry-After` in middleware.ts
5. Grep for `x-forwarded-for` in middleware.ts
</verification>

<success_criteria>
- `src/server/rate-limit.ts` implements sliding-window rate limiting
- `src/middleware.ts` integrates rate limiting with CSRF in a single middleware
- Global default: 60 req/min per IP
- Webhook route: 100 req/min per IP
- Rate limit exceeded: 429 + Retry-After header
</success_criteria>

<must_haves>
<truths>
- Rate limiting must be IP-based in middleware (no session lookup in Edge Runtime)
- Webhook route must have rate limiting (higher limit) but skip CSRF
- Sliding window counter must auto-reset expired buckets
</truths>
<goals>
- Protect all API endpoints from abuse via rate limiting
- Interface designed for Redis backend swap
</goals>
</must_haves>
