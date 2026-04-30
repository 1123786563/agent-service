import { UserRole, WhitelistStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { sendDevLoginEmail } from "@/server/mail/dev-mailer";
import { createOpaqueToken, createSession, createSessionTokenHash, isAdminEmail } from "./session";

const MAGIC_LINK_MINUTES = 15;
const magicLinkEmailSchema = z.string().trim().min(1).email();

export type AuthFlowErrorCode = "invalid-email" | "invalid-token";

export class AuthFlowError extends Error {
  constructor(public readonly code: AuthFlowErrorCode) {
    super(code === "invalid-email" ? "Email address is invalid" : "Login link is invalid or expired");
    this.name = "AuthFlowError";
  }
}

export function isAuthFlowError(error: unknown): error is AuthFlowError {
  return error instanceof AuthFlowError;
}

export function normalizeMagicLinkEmail(emailInput: string) {
  const parsedEmail = magicLinkEmailSchema.safeParse(emailInput);
  if (!parsedEmail.success) {
    throw new AuthFlowError("invalid-email");
  }

  return parsedEmail.data.toLowerCase();
}

export async function requestMagicLink(emailInput: string) {
  const email = normalizeMagicLinkEmail(emailInput);
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
  const token = rawToken.trim();
  if (!token) {
    throw new AuthFlowError("invalid-token");
  }

  const tokenHash = createSessionTokenHash(token);
  const consumedAt = new Date();
  const userId = await prisma.$transaction(async (tx) => {
    const result = await tx.magicLinkToken.updateMany({
      where: {
        tokenHash,
        consumedAt: null,
        expiresAt: { gte: consumedAt }
      },
      data: { consumedAt }
    });

    if (result.count !== 1) {
      throw new AuthFlowError("invalid-token");
    }

    const magicLinkToken = await tx.magicLinkToken.findUnique({
      where: { tokenHash },
      select: { userId: true }
    });

    if (!magicLinkToken) {
      throw new AuthFlowError("invalid-token");
    }

    return magicLinkToken.userId;
  });

  await createSession(userId);
}
