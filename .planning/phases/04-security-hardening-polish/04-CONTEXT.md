# Phase 4: Security Hardening & Polish - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning
**Mode:** Auto-generated (user accepted all defaults)

<domain>
## Phase Boundary

Add defense-in-depth layers — session lifecycle management, audit logging, security headers, account lockout, webhook hardening, and Content Security Policy.

**In scope:**
- HARD-01: Session revocation on privilege change
- HARD-02: Auth audit logging (login, register, password change, OAuth link, failed login)
- HARD-03: Security headers middleware (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- HARD-04: Account lockout after N failed password attempts
- HARD-05: Stripe webhook timestamp validation (reject events > 5 minutes old)
- HARD-06: Content Security Policy (whitelist Google/GitHub OAuth + Stripe domains)
- SESS-01: Session and magic link token cleanup

**Out of scope:**
- 2FA/TOTP (deferred)
- WebAuthn/Passkeys (deferred)
- Performance optimization (separate milestone)

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — user accepted all standard security defaults. Use OWASP/NIST standards.

### Standards Applied
- Security headers: OWASP recommended set
- Account lockout: NIST SP 800-63B guidelines (rate-based, time-decay)
- CSP: Strict policy with OAuth domain whitelists
- Audit logging: Structured events with actor, action, target, timestamp

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/middleware.ts` — existing CSRF + rate limiting middleware (Phase 2)
- `src/server/audit/service.ts` — existing audit log service
- `src/server/auth/password.ts` — password verification (Phase 3)
- `src/server/rate-limit.ts` — rate limiter (Phase 2)
- `src/server/auth/session.ts` — session management

### Integration Points
- Security headers: add to middleware.ts response pipeline
- Session revocation: hook into role/whitelist update operations
- Account lockout: check in login route before password verify
- Webhook validation: add timestamp check in webhook handler
- CSP: add header in middleware.ts

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard security hardening patterns.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>

---

*Phase: 4-Security Hardening & Polish*
*Context gathered: 2026-05-05*
