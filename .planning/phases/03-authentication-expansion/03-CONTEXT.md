# Phase 3: Authentication Expansion - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Add password-based login and OAuth (Google + GitHub) alongside existing magic link; ship production email via Resend; prepare data model for multi-email accounts via additive schema migration. Refactor buyer identity from email-based to user-ID-based verification.

**In scope:**
- AUTH-01: Password authentication (email + password, Argon2id hashing)
- AUTH-02: Google OAuth (Authorization Code Flow + PKCE via Arctic library)
- AUTH-03: GitHub OAuth (reuse OAuth infrastructure from AUTH-02)
- AUTH-05: Production email (Resend adapter, dev-mailer for development)
- AUTH-06: Buyer identity by user ID instead of email

**Out of scope:**
- 2FA/TOTP (deferred)
- WebAuthn/Passkeys (deferred)
- SAML/enterprise SSO (out of scope)
- Security headers/CSP (Phase 4)
- Session revocation (Phase 4)
- Audit logging (Phase 4)

</domain>

<decisions>
## Implementation Decisions

### OAuth Architecture & Data Model
- D-01: Independent `OAuthAccount` table — supports multiple providers and future multi-email linking
- D-02: OAuth state stored in httpOnly cookie — consistent with session pattern, CSRF protection built-in
- D-03: Use Arctic library for PKCE — ROADMAP specifies, reduces security implementation risk
- D-04: Upsert by email + P2002 catch for user matching — reuses Phase 1 DATA-02 pattern

### Registration & Login UX
- D-05: New endpoints: `/api/auth/register` and `/api/auth/login` — clean separation from magic link
- D-06: Minimum 8 character password — OWASP compliant, friendly to Chinese users
- D-07: OAuth callback paths: `/api/auth/callback/google` and `/api/auth/callback/github` — RESTful, exempt from CSRF
- D-08: All auth methods redirect to `/` after success — consistent with existing magic link behavior

### Email Integration
- D-09: Resend adapter follows dev-mailer pattern — unified interface, `NODE_ENV` switches implementation
- D-10: Plain text email templates — simple, reliable, consistent with dev-mailer output
- D-11: Missing Resend key: dev → dev-mailer + console.warn; prod → fail-fast — follows SEC-07 env var pattern

### Buyer Identity & Account Linking
- D-12: Modify both order AND consultation routes to use userId — consistency, no email-based queries left
- D-13: Reject GitHub OAuth with unverified emails — prevents email takeover
- D-14: `passwordHash String?` (nullable) on User model — coexists with OAuth, minimal schema change

### Claude's Discretion
- Exact Argon2id parameters (memory, iterations)
- Arctic library version and specific API usage
- Resend API call structure
- Error message wording for auth failures
- Migration strategy for existing email-based data

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current Implementation (must read)
- `src/server/auth/session.ts` — Auth guard functions, session management, createSession pattern
- `src/server/auth/magic-link.ts` — Existing magic link flow, createSession convergence
- `src/app/api/auth/request-link/route.ts` — Existing auth route pattern
- `src/app/api/auth/consume/route.ts` — Magic link consumption route
- `prisma/schema.prisma` — User, Session, MagicLinkToken models
- `src/server/orders/service.ts` — Order service with buyerEmail queries (AUTH-06 target)
- `src/app/api/consultations/route.ts` — Consultation route (AUTH-06 target)
- `src/middleware.ts` — CSRF middleware with exempt paths (Phase 2)
- `src/server/payments/adapter.ts` — Payment adapter pattern (reference for Resend adapter)

### Architecture Context
- `.planning/codebase/ARCHITECTURE.md` — Service layer patterns
- `.planning/codebase/STACK.md` — Tech stack, env vars
- `.planning/phases/01-critical-security-fixes/01-CONTEXT.md` — Phase 1 decisions
- `.planning/phases/02-input-validation-access-control/02-CONTEXT.md` — Phase 2 decisions

### Pattern References
- `src/server/payments/adapter.ts` — Adapter pattern (reference for email adapter)
- `src/server/payments/dev-adapter.ts` — Dev adapter (reference for dev-mailer pattern)
- `src/server/payments/ledger.ts` — P2002 catch pattern (reuse for OAuth upsert)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createSession()` in session.ts — all auth methods converge on this function
- `getCurrentUser()`, `requireCreator()`, `requireAdmin()` — existing auth guards
- Dev-mailer adapter pattern in magic-link.ts — template for Resend adapter
- P2002 unique constraint catch in ledger.ts — reusable for OAuth upsert
- Middleware CSRF exempt paths — OAuth callbacks need to be added

### Established Patterns
- API route error responses: JSON `{ errors: string[] }` with status code
- Dependency injection: services accept optional `deps`/`store` parameter
- Zod validation for input schemas
- Session management: create session row + set httpOnly cookie

### Integration Points
- New routes: `/api/auth/register`, `/api/auth/login`, `/api/auth/callback/google`, `/api/auth/callback/github`
- Schema changes: `OAuthAccount` model, `passwordHash` on User
- Email adapter: Resend for production, dev-mailer for development
- Buyer identity: `orders/service.ts` and `consultations/route.ts` switch from email to userId

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the decisions above — standard OAuth and password auth patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 3-Authentication Expansion*
*Context gathered: 2026-05-05*
