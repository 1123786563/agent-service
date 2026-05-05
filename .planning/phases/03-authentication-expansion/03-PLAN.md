---
phase: 3
plan: 3
type: execute
wave: 2
depends_on: [2]
files_modified:
  - src/server/auth/oauth-github.ts
  - src/app/api/auth/callback/github/route.ts
autonomous: true
requirements:
  - AUTH-03
---

<objective>
Add GitHub OAuth login reusing the shared OAuth infrastructure from Plan 2. Verify email before linking.
</objective>

<tasks>

<task id="1" type="execute">
<read_first>
  - src/server/auth/oauth.ts — shared OAuth utilities (created in Plan 2)
  - src/server/auth/oauth-google.ts — reference OAuth implementation pattern
  - src/middleware.ts — verify GitHub callback path is exempt
  - .planning/phases/03-authentication-expansion/03-CONTEXT.md — decisions D-07, D-13
</read_first>
<action>
1. Create `src/server/auth/oauth-github.ts`:
   ```typescript
   import { GitHub } from "arctic";
   import { cookies } from "next/headers";
   import { generateCodeVerifier, generateState } from "arctic";
   import { handleOAuthLogin, getOAuthStateCookieName, getCodeVerifierCookieName } from "./oauth";
   import { redirect } from "next/navigation";

   function getGitHubOAuth() {
     const clientId = process.env.GITHUB_CLIENT_ID;
     const clientSecret = process.env.GITHUB_CLIENT_SECRET;
     const redirectUri = process.env.GITHUB_REDIRECT_URI;

     if (!clientId || !clientSecret || !redirectUri) {
       throw new Error("GitHub OAuth is not configured");
     }

     return new GitHub(clientId, clientSecret, redirectUri);
   }

   export async function initiateGitHubOAuth() {
     const github = getGitHubOAuth();
     const state = generateState();
     const url = github.createAuthorizationURL(state, ["user:email"]);

     const cookieStore = await cookies();
     cookieStore.set(getOAuthStateCookieName("github"), state, {
       httpOnly: true,
       secure: process.env.NODE_ENV === "production",
       sameSite: "lax",
       maxAge: 60 * 10,
       path: "/"
     });

     redirect(url.toString());
   }

   export async function handleGitHubCallback(code: string, state: string) {
     const cookieStore = await cookies();
     const storedState = cookieStore.get(getOAuthStateCookieName("github"))?.value;

     if (!storedState || storedState !== state) {
       throw new Error("Invalid OAuth state");
     }

     const github = getGitHubOAuth();
     const tokens = await github.validateAuthorizationCode(code);

     // Get user profile
     const userResponse = await fetch("https://api.github.com/user", {
       headers: { Authorization: `Bearer ${tokens.accessToken}` }
     });
     const githubUser: { id: number; login: string; name?: string; avatar_url?: string } = await userResponse.json();

     // Get user emails to find verified primary
     const emailResponse = await fetch("https://api.github.com/user/emails", {
       headers: { Authorization: `Bearer ${tokens.accessToken}` }
     });
     const emails: { email: string; verified: boolean; primary: boolean }[] = await emailResponse.json();

     const primaryEmail = emails.find((e) => e.primary && e.verified);
     if (!primaryEmail) {
       throw new Error("No verified primary email found on GitHub account");
     }

     // Clean up state cookie
     cookieStore.delete(getOAuthStateCookieName("github"));

     return handleOAuthLogin({
       provider: "github",
       providerAccountId: String(githubUser.id),
       email: primaryEmail.email,
       emailVerified: primaryEmail.verified,
       name: githubUser.name ?? githubUser.login,
       avatarUrl: githubUser.avatar_url
     });
   }
   ```

2. Create `src/app/api/auth/callback/github/route.ts`:
   ```typescript
   import { handleGitHubCallback } from "@/server/auth/oauth-github";
   import { redirect } from "next/navigation";

   export async function GET(request: Request) {
     const url = new URL(request.url);
     const code = url.searchParams.get("code");
     const state = url.searchParams.get("state");
     const error = url.searchParams.get("error");

     if (error) {
       redirect(`/login?error=oauth_denied`);
     }

     if (!code || !state) {
       redirect(`/login?error=oauth_failed`);
     }

     try {
       await handleGitHubCallback(code, state);
     } catch (err) {
       redirect(`/login?error=oauth_failed`);
     }

     redirect("/");
   }
   ```

3. Create `src/app/api/auth/github/route.ts`:
   ```typescript
   import { initiateGitHubOAuth } from "@/server/auth/oauth-github";

   export async function GET() {
     await initiateGitHubOAuth();
   }
   ```

4. Verify `/api/auth/callback/github` is in CSRF_EXEMPT_PATHS in middleware.ts.
</action>
<acceptance_criteria>
  - `src/server/auth/oauth-github.ts` exports initiateGitHubOAuth and handleGitHubCallback
  - OAuth callback route at `/api/auth/callback/github`
  - OAuth initiate route at `/api/auth/github`
  - GitHub email_verified check before account linking (prevents email takeover)
  - Primary verified email required — error if none found
  - Reuses handleOAuthLogin from oauth.ts
  - State stored in httpOnly cookie
  - TypeScript compiles without errors
</acceptance_criteria>
</task>

</tasks>

<verification>
1. Run `npx tsc --noEmit`
2. Verify GitHub OAuth routes exist
3. Verify email verification check in oauth-github.ts
4. Run `npm test`
</verification>
