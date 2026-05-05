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
