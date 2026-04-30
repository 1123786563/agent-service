import { UserRole, WhitelistStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { sendDevLoginEmail } from "@/server/mail/dev-mailer";
import { createOpaqueToken, createSession, createSessionTokenHash, isAdminEmail } from "./session";

const MAGIC_LINK_MINUTES = 15;

export async function requestMagicLink(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  const admin = isAdminEmail(email);
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_MINUTES * 60 * 1000);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      role: admin ? UserRole.ADMIN : UserRole.USER,
      whitelistStatus: admin ? WhitelistStatus.ACTIVE : WhitelistStatus.NONE
    },
    update: admin
      ? {
          role: UserRole.ADMIN,
          whitelistStatus: WhitelistStatus.ACTIVE
        }
      : {}
  });

  await prisma.magicLinkToken.create({
    data: {
      email,
      userId: user.id,
      tokenHash: createSessionTokenHash(token),
      expiresAt
    }
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const loginUrl = `${appUrl}/api/auth/consume?token=${encodeURIComponent(token)}`;
  await sendDevLoginEmail(email, loginUrl);
}

export async function consumeMagicLink(rawToken: string) {
  const tokenHash = createSessionTokenHash(rawToken);
  const magicLinkToken = await prisma.magicLinkToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!magicLinkToken || magicLinkToken.consumedAt || magicLinkToken.expiresAt < new Date()) {
    throw new Error("Login link is invalid or expired");
  }

  await prisma.magicLinkToken.update({
    where: { id: magicLinkToken.id },
    data: { consumedAt: new Date() }
  });

  await createSession(magicLinkToken.user.id);
}
