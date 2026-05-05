---
wave: 1
depends_on: []
files_modified:
  - src/server/auth/session.ts
autonomous: true
requirements:
  - SEC-08
---

# Plan 04: Fix requireCreator Role Check

Add `role === CREATOR` check to `requireCreator()` — currently it only checks `whitelistStatus`, allowing non-creator roles to pass.

<objective>
Ensure only users with `CREATOR` role can pass the `requireCreator()` guard, even if they are whitelisted.
</objective>

<must_haves>
- `requireCreator()` checks both `user.role === UserRole.CREATOR` AND `user.whitelistStatus === WhitelistStatus.ACTIVE`
- Existing creator actions continue to work (no false negatives)
- Non-creator whitelisted users are rejected
</must_haves>

<read_first>
- `src/server/auth/session.ts` — `requireCreator()` function (line 155-162) and imports at top
- `src/app/creator/actions.ts` — uses `requireCreator()` to verify this is the only guard usage
</read_first>

<task>
<acceptance_criteria>
- `src/server/auth/session.ts` `requireCreator()` function contains `user.role !== UserRole.CREATOR` in its guard condition
- The error message remains descriptive (e.g., "Creator access is required")
- `UserRole` is imported from `@prisma/client` (already imported at top of file — verify)
</acceptance_criteria>

<action>
Edit `src/server/auth/session.ts`:

1. Ensure `UserRole` is imported from `@prisma/client`. It should be — `WhitelistStatus` is already imported on line 2. Add `UserRole` alongside it if not present.

2. Change the `requireCreator()` function (lines 155-162) from:
```typescript
export async function requireCreator() {
  const user = await getCurrentUser();
  if (!user || user.whitelistStatus !== WhitelistStatus.ACTIVE) {
    throw new Error("Creator whitelist is required");
  }

  return user;
}
```
to:
```typescript
export async function requireCreator() {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.CREATOR || user.whitelistStatus !== WhitelistStatus.ACTIVE) {
    throw new Error("Creator access is required");
  }

  return user;
}
```

The key change is adding `user.role !== UserRole.CREATOR` to the guard condition. This prevents admin or buyer users who happen to be on the whitelist from passing the creator check.
</action>
</task>

<verification>
- `grep -n "UserRole.CREATOR" src/server/auth/session.ts` returns a match in the `requireCreator` function
- `grep -n "role !== UserRole.CREATOR" src/server/auth/session.ts` returns a match
- TypeScript compiles without errors: `npx tsc --noEmit`
</verification>
