import { GitHub } from "arctic";
import { cookies } from "next/headers";
import { generateState } from "arctic";
import { handleOAuthLogin, getOAuthStateCookieName } from "./oauth";
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

  const userResponse = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokens.accessToken}` }
  });
  const githubUser: { id: number; login: string; name?: string; avatar_url?: string } = await userResponse.json();

  const emailResponse = await fetch("https://api.github.com/user/emails", {
    headers: { Authorization: `Bearer ${tokens.accessToken}` }
  });
  const emails: { email: string; verified: boolean; primary: boolean }[] = await emailResponse.json();

  const primaryEmail = emails.find((e) => e.primary && e.verified);
  if (!primaryEmail) {
    throw new Error("No verified primary email found on GitHub account");
  }

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
