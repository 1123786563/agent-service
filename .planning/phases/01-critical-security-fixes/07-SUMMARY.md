---
plan: 07
phase: 1
status: complete
requirements:
  - AUTH-04
---

# Plan 07: Add Logout Functionality

## What Changed

Implemented logout flow:
1. Added `deleteSessionByToken()` to session.ts — deletes session record by token hash
2. Created `src/app/account/actions.ts` — server action that reads session cookie, deletes session from DB, clears cookie, redirects to /
3. Added logout button to `/account/orders` page — form with "退出登录" button

## Key Files

- `src/server/auth/session.ts` — Exported SESSION_COOKIE constant, added deleteSessionByToken function
- `src/app/account/actions.ts` (NEW) — Logout server action
- `src/app/account/orders/page.tsx` — Added logout button form

## Self-Check

- [x] Logout server action deletes session from DB
- [x] Session cookie cleared after logout
- [x] Redirect to / after logout
- [x] Logout button visible on account orders page
- [x] SESSION_COOKIE exported for reuse
