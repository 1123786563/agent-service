---
plan: 02
phase: 1
status: complete
requirements:
  - SEC-02
---

# Plan 02: Add Auth to Consultation Endpoint

## What Changed

Added authentication requirement to `POST /api/consultations`:
1. `getCurrentUser()` check → returns 401 for unauthenticated requests
2. `buyerEmail` now derived from authenticated user's email instead of request body

## Key Files

- `src/app/api/consultations/route.ts` — Added getCurrentUser auth check, replaced body-derived buyerEmail with user.email

## Self-Check

- [x] POST /api/consultations returns 401 for unauthenticated requests
- [x] buyerEmail uses authenticated user's email (prevents spoofing)
- [x] Authenticated users can still create consultations
