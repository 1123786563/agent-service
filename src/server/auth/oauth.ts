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

  // Wrap in transaction to prevent race: attacker links OAuth to victim account
  return prisma.$transaction(async (tx) => {
    // Find existing OAuth account
    const existingAccount = await tx.oAuthAccount.findUnique({
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

    // Find existing user by email
    const existingUser = await tx.user.findUnique({ where: { email: info.email } });

    if (existingUser) {
      // Link OAuth account to existing user
      await tx.oAuthAccount.create({
        data: {
          provider: info.provider,
          providerAccountId: info.providerAccountId,
          userId: existingUser.id
        }
      });
      await createSession(existingUser.id);
      return existingUser;
    }

    // Create new user with OAuth account
    const user = await tx.user.create({
      data: {
        email: info.email,
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
  });
}

export function getOAuthStateCookieName(provider: string) {
  return `${provider}_oauth_state`;
}

export function getCodeVerifierCookieName(provider: string) {
  return `${provider}_code_verifier`;
}
