import { UserRole, WhitelistStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { sendDevLoginEmail } from "@/server/mail/dev-mailer";
import {
  createOpaqueToken,
  createSessionRecord,
  createSessionTokenHash,
  deleteSessionRecord,
  isAdminEmail,
  setSessionCookie
} from "./session";

const MAGIC_LINK_MINUTES = 15;
const magicLinkEmailSchema = z.string().trim().min(1).email();
const AUTH_FLOW_ERROR_MESSAGES = {
  "invalid-email": "Email address is invalid",
  "invalid-token": "Login link is invalid or expired"
} as const;
const LOGIN_STATUS_MESSAGES = {
  sent: "登录链接已发送，请检查邮箱。",
  "invalid-email": "请输入有效的邮箱地址。",
  "invalid-token": "登录链接无效或已过期，请重新获取。",
  "missing-token": "登录链接缺少必要参数，请重新获取。"
} as const;

export type AuthFlowErrorCode = "invalid-email" | "invalid-token";
export type LoginStatusCode = "sent" | AuthFlowErrorCode | "missing-token";

export class AuthFlowError extends Error {
  constructor(public readonly code: AuthFlowErrorCode) {
    super(getAuthFlowErrorMessage(code));
    this.name = "AuthFlowError";
  }
}

export function isAuthFlowError(error: unknown): error is AuthFlowError {
  return error instanceof AuthFlowError;
}

export function getAuthFlowErrorMessage(code: AuthFlowErrorCode) {
  return AUTH_FLOW_ERROR_MESSAGES[code];
}

export function getLoginStatusMessage(code: LoginStatusCode) {
  return LOGIN_STATUS_MESSAGES[code];
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
  const pendingSession = await prisma.$transaction(async (tx) => {
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

    const session = await createSessionRecord(tx.session, magicLinkToken.userId);

    return {
      sessionId: session.id,
      token: session.token,
      expiresAt: session.expiresAt
    };
  });

  try {
    await setSessionCookie(pendingSession);
  } catch (error) {
    await rollbackConsumedMagicLink(tokenHash, consumedAt, pendingSession.sessionId);
    throw error;
  }
}

async function rollbackConsumedMagicLink(tokenHash: string, consumedAt: Date, sessionId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      await deleteSessionRecord(tx.session, sessionId);
      await tx.magicLinkToken.updateMany({
        where: {
          tokenHash,
          consumedAt
        },
        data: {
          consumedAt: null
        }
      });
    });
  } catch {
    // Best-effort cleanup only.
  }
}
