---
phase: 3
plan: 2
type: execute
wave: 2
depends_on: [1]
files_modified:
  - prisma/schema.prisma
  - src/server/auth/oauth.ts
  - src/server/auth/oauth-google.ts
  - src/app/api/auth/callback/google/route.ts
  - src/middleware.ts
  - package.json
autonomous: true
requirements:
  - AUTH-02
---

<objective>
Add Google OAuth login with PKCE via Arctic library. Create OAuthAccount model and shared OAuth infrastructure. OAuth callbacks exempt from CSRF in middleware.
</objective>

<tasks>

<task id="1" type="execute">
<read_first>
  - src/server/auth/session.ts — createSession, createOpaqueToken, createSessionTokenHash
  - src/server/auth/magic-link.ts — user upsert pattern, P2002 not needed here
  - src/middleware.ts — CSRF exempt paths
  - prisma/schema.prisma — User model
  - .planning/phases/03-authentication-expansion/03-CONTEXT.md — decisions D-01 through D-04, D-07, D-13
</read_first>
<action>
1. Install Arctic dependency:
   ```bash
   npm install arctic
   ```

2. Update `prisma/schema.prisma` — Add OAuthAccount model:
   ```prisma
   model OAuthAccount {
     id           String   @id @default(cuid())
     provider     String
     providerAccountId String
     userId       String
     accessToken  String?
     refreshToken String?
     expiresAt    DateTime?
     createdAt    DateTime @default(now())
     updatedAt    DateTime @updatedAt

     user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

     @@unique([provider, providerAccountId])
     @@index([userId])
   }
   ```
   Also add `oAuthAccounts OAuthAccount[]` to User model relations.

3. Create `src/server/auth/oauth.ts` — shared OAuth utilities:
   ```typescript
   import { prisma } from "@/server/db";
   import { createSession } from "./session";

   export type OAuthUserInfo = {
     provider: string;
     providerAccountId: string;
     email: string;
     emailVerified: boolean;
     name?: string;
     avatarUrl?: string;
   };

   export async function handleOAuthLogin(info: OAuthUserInfo) {
     if (!info.emailVerified) {
       throw new Error("Email not verified — please verify your email with the provider first");
     }

     // Find existing OAuth account
     const existingAccount = await prisma.oAuthAccount.findUnique({
       where: {
         provider_providerAccountId: {
           provider: info.provider,
           providerAccountId: info.providerAccountId
         }
       },
       include: { user: true }
     });

     if (existingAccount) {
       await createSession(existingAccount.user.id);
       return existingAccount.user;
     }

     // Upsert user by email
     const user = await prisma.user.upsert({
       where: { email: info.email },
       create: {
         email: info.email,
         oAuthAccounts: {
           create: {
             provider: info.provider,
             providerAccountId: info.providerAccountId
           }
         }
       },
       update: {
         oAuthAccounts: {
           create: {
             provider: info.provider,
             providerAccountId: info.providerAccountId
           }
         }
       }
     });

     await createSession(user.id);
     return user;
   }

   export function getOAuthStateCookieName(provider: string) {
     return `${provider}_oauth_state`;
   }

   export function getCodeVerifierCookieName(provider: string) {
     return `${provider}_code_verifier`;
   }
   ```

4. Create `src/server/auth/oauth-google.ts`:
   ```typescript
   import { Google } from "arctic";
   import { cookies } from "next/headers";
   import { generateCodeVerifier, generateState } from "arctic";
   import { handleOAuthLogin, getOAuthStateCookieName, getCodeVerifierCookieName, type OAuthUserInfo } from "./oauth";
   import { redirect } from "next/navigation";

   function getGoogleOAuth() {
     const clientId = process.env.GOOGLE_CLIENT_ID;
     const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
     const redirectUri = process.env.GOOGLE_REDIRECT_URI;

     if (!clientId || !clientSecret || !redirectUri) {
       throw new Error("Google OAuth is not configured");
     }

     return new Google(clientId, clientSecret, redirectUri);
   }

   export async function initiateGoogleOAuth() {
     const google = getGoogleOAuth();
     const state = generateState();
     const codeVerifier = generateCodeVerifier();
     const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);

     const cookieStore = await cookies();
     cookieStore.set(getOAuthStateCookieName("google"), state, {
       httpOnly: true,
       secure: process.env.NODE_ENV === "production",
       sameSite: "lax",
       maxAge: 60 * 10, // 10 minutes
       path: "/"
     });
     cookieStore.set(getCodeVerifierCookieName("google"), codeVerifier.toString(), {
       httpOnly: true,
       secure: process.env.NODE_ENV === "production",
       sameSite: "lax",
       maxAge: 60 * 10,
       path: "/"
     });

     redirect(url.toString());
   }

   export async function handleGoogleCallback(code: string, state: string) {
     const cookieStore = await cookies();
     const storedState = cookieStore.get(getOAuthStateCookieName("google"))?.value;
     const codeVerifier = cookieStore.get(getCodeVerifierCookieName("google"))?.value;

     if (!storedState || storedState !== state || !codeVerifier) {
       throw new Error("Invalid OAuth state");
     }

     const google = getGoogleOAuth();
     const tokens = await google.validateAuthorizationCode(code, codeVerifier);
     const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
       headers: { Authorization: `Bearer ${tokens.accessToken}` }
     });
     const userinfo: { sub: string; email: string; email_verified: boolean; name?: string; picture?: string } = await response.json();

     // Clean up state cookies
     cookieStore.delete(getOAuthStateCookieName("google"));
     cookieStore.delete(getCodeVerifierCookieName("google"));

     return handleOAuthLogin({
       provider: "google",
       providerAccountId: userinfo.sub,
       email: userinfo.email,
       emailVerified: userinfo.email_verified ?? true,
       name: userinfo.name,
       avatarUrl: userinfo.picture
     });
   }
   ```

5. Create `src/app/api/auth/callback/google/route.ts`:
   ```typescript
   import { handleGoogleCallback } from "@/server/auth/oauth-google";
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
       await handleGoogleCallback(code, state);
     } catch (err) {
       redirect(`/login?error=oauth_failed`);
     }

     redirect("/");
   }
   ```

6. Add Google OAuth initiate route — `src/app/api/auth/google/route.ts`:
   ```typescript
   import { initiateGoogleOAuth } from "@/server/auth/oauth-google";

   export async function GET() {
     await initiateGoogleOAuth();
   }
   ```

7. Update `src/middleware.ts` — add OAuth callback paths to CSRF_EXEMPT_PATHS:
   Add `/api/auth/callback/google`, `/api/auth/callback/github`, and `/api/auth/google`, `/api/auth/github` to exempt list. Also add `/api/auth/register` and `/api/auth/login` (these are JSON POST, should have CSRF protection but the Origin check handles them).
</action>
<acceptance_criteria>
  - `arctic` installed in dependencies
  - `OAuthAccount` model in schema with unique constraint on (provider, providerAccountId)
  - `src/server/auth/oauth.ts` exports handleOAuthLogin and cookie helpers
  - `src/server/auth/oauth-google.ts` exports initiateGoogleOAuth and handleGoogleCallback
  - OAuth callback route at `/api/auth/callback/google`
  - OAuth initiate route at `/api/auth/google`
  - Middleware exempts OAuth callback paths from CSRF
  - Email verification required for Google OAuth
  - User upsert by email with OAuth account creation
  - State and PKCE code verifier stored in httpOnly cookies
  - TypeScript compiles without errors
</acceptance_criteria>
</task>

</tasks>

<verification>
1. Run `npx tsc --noEmit`
2. Verify OAuthAccount model in schema
3. Verify OAuth routes exist
4. Verify middleware exempts OAuth paths
5. Run `npm test`
</verification>
