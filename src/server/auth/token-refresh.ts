import { prisma } from "@/server/db";
import { Google } from "arctic";
import { GitHub } from "arctic";

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

export type RefreshResult =
  | { success: true; accessToken: string; expiresAt: Date }
  | { success: false; reason: "no_refresh_token" | "refresh_failed" };

async function refreshGoogleToken(
  account: { id: string; refreshToken: string | null },
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<RefreshResult> {
  if (!account.refreshToken) {
    return { success: false, reason: "no_refresh_token" };
  }

  try {
    const google = new Google(clientId, clientSecret, redirectUri);
    const tokens = await google.refreshAccessToken(account.refreshToken);

    const accessToken = tokens.accessToken();
    const expiresAt = tokens.accessTokenExpiresAt();

    await prisma.oAuthAccount.update({
      where: { id: account.id },
      data: {
        accessToken,
        expiresAt,
      },
    });

    return { success: true, accessToken, expiresAt };
  } catch {
    return { success: false, reason: "refresh_failed" };
  }
}

async function refreshGitHubToken(
  accountId: string,
  clientId: string,
  clientSecret: string
): Promise<RefreshResult> {
  // GitHub tokens don't expire by default unless the app requests expiring tokens
  // or the token has been explicitly revoked. For standard GitHub OAuth apps,
  // refresh is typically not needed. We handle it as a no-op success.
  const account = await prisma.oAuthAccount.findUnique({ where: { id: accountId } });
  if (!account?.accessToken) {
    return { success: false, reason: "no_refresh_token" };
  }

  return { success: true, accessToken: account.accessToken, expiresAt: account.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) };
}

export async function refreshOAuthToken(
  userId: string,
  provider: string
): Promise<RefreshResult> {
  const account = await prisma.oAuthAccount.findFirst({
    where: { userId, provider },
  });

  if (!account) {
    return { success: false, reason: "no_refresh_token" };
  }

  if (!account.expiresAt || account.expiresAt.getTime() - Date.now() > REFRESH_BUFFER_MS) {
    return {
      success: true,
      accessToken: account.accessToken ?? "",
      expiresAt: account.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    };
  }

  if (provider === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      return { success: false, reason: "refresh_failed" };
    }
    return refreshGoogleToken({ id: account.id, refreshToken: account.refreshToken }, clientId, clientSecret, redirectUri);
  }

  if (provider === "github") {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { success: false, reason: "refresh_failed" };
    }
    return refreshGitHubToken(account.id, clientId, clientSecret);
  }

  return { success: false, reason: "no_refresh_token" };
}
