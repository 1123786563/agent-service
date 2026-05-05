---
plan: 04
phase: 1
status: complete
requirements:
  - SEC-08
---

# Plan 04: Fix requireCreator Role Check

## What Changed

Added `user.role !== UserRole.CREATOR` to the `requireCreator()` guard condition in session.ts:
- Previously only checked `whitelistStatus`, allowing non-creator whitelisted users to pass
- Now checks both `role === CREATOR` AND `whitelistStatus === ACTIVE`
- Imported `UserRole` from `@prisma/client`

## Key Files

- `src/server/auth/session.ts` — Added UserRole import and role check to requireCreator()

## Self-Check

- [x] requireCreator checks user.role === UserRole.CREATOR
- [x] requireCreator checks user.whitelistStatus === WhitelistStatus.ACTIVE
- [x] Error message updated to "Creator access is required"
- [x] UserRole imported from @prisma/client
