import { Google } from "arctic";
import { cookies } from "next/headers";
import { generateCodeVerifier, generateState } from "arctic";
import { handleOAuthLogin, getOAuthStateCookieName, getCodeVerifierCookieName } from "./oauth";
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
    maxAge: 60 * 10,
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

  cookieStore.delete(getOAuthStateCookieName("google"));
  cookieStore.delete(getCodeVerifierCookieName("google"));

  return handleOAuthLogin({
    provider: "google",
    providerAccountId: userinfo.sub,
    email: userinfo.email,
    emailVerified: userinfo.email_verified === true,
    name: userinfo.name,
    avatarUrl: userinfo.picture
  });
}
