---
wave: 1
depends_on: []
files_modified:
  - src/server/auth/session.ts
  - src/app/account/orders/page.tsx
autonomous: true
requirements:
  - AUTH-04
---

# Plan 07: Add Logout Functionality

Create a server action for logout that deletes the session from DB and clears the session cookie. Add a logout button on the account orders page.

<objective>
Allow users to explicitly end their session by clicking a logout button, deleting the session record and clearing the cookie.
</objective>

<must_haves>
- New server action `logout` in account actions (not a separate file)
- Deletes session record from DB using the existing token
- Clears session cookie
- Redirects to home page after logout
- Logout button appears on `/account/orders` page
</must_haves>

<read_first>
- `src/server/auth/session.ts` — `getCurrentSession()` (line 131), `deleteSessionRecord()` (line 92), `SESSION_COOKIE` constant (line 6)
- `src/app/account/orders/page.tsx` — account page where logout button will be added
- `src/app/creator/actions.ts` — server action pattern reference (`"use server"`, `FormData`, `revalidatePath`)
</read_first>

<task>
<acceptance_criteria>
- `src/app/account/orders/page.tsx` or a new actions file contains a `logout` server action
- The logout action reads the session cookie, deletes the session record from DB, and clears the cookie
- `src/app/account/orders/page.tsx` contains a `<form>` with a logout button that invokes the server action
- The logout button is visible in the page header area
- After logout, the user is redirected to `/`
- `grep -rn "logout" src/app/account/` returns matches
</acceptance_criteria>

<action>

**Step 1: Add logout helper to session.ts**

Edit `src/server/auth/session.ts`:

1. Add `deleteByTokenHash` function after `deleteSessionRecord` (after line 96):
```typescript
export async function deleteSessionByToken(token: string) {
  const tokenHash = createSessionTokenHash(token);
  await prisma.session.deleteMany({
    where: { tokenHash }
  });
}
```

**Step 2: Create logout server action**

Create `src/app/account/actions.ts`:
```typescript
"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { createSessionTokenHash, SESSION_COOKIE } from "@/server/auth/session";

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const tokenHash = createSessionTokenHash(token);
    await prisma.session.deleteMany({ where: { tokenHash } });
    cookieStore.delete(SESSION_COOKIE);
  }

  redirect("/");
}
```

**Step 3: Add logout button to account orders page**

Edit `src/app/account/orders/page.tsx`:

1. Add import: `import { logout } from "@/app/account/actions";`

2. Add a logout button in the `<div className="section-header">` area (after the `<p className="lede">` element, before the closing `</div>` of section-header). Add a `<form>` with the logout action:
```tsx
<form action={logout}>
  <button className="button secondary" type="submit">退出登录</button>
</form>
```

Place it inside a flex container alongside the existing header text to align right:
```tsx
<div className="section-header">
  <div>
    <h1>我的订单</h1>
    <p className="lede">查看服务订单状态，并为待支付订单发起支付。</p>
  </div>
  <form action={logout}>
    <button className="button secondary" type="submit">退出登录</button>
  </form>
</div>
```
</action>
</task>

<verification>
- `test -f src/app/account/actions.ts && echo "EXISTS"` confirms the actions file exists
- `grep -n "SESSION_COOKIE" src/app/account/actions.ts` returns a match
- `grep -n "deleteSessionByToken\|deleteMany" src/server/auth/session.ts` returns matches
- `grep -n "logout" src/app/account/orders/page.tsx` returns matches (import + form)
- TypeScript compiles without errors: `npx tsc --noEmit`
</verification>
