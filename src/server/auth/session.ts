import crypto from "node:crypto";
import { UserRole, WhitelistStatus } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";

export const SESSION_COOKIE = "hermes_market_session";
const SESSION_DAYS = 30;

type SessionCreateStore = {
  create(args: {
    data: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    };
    select: {
      id: true;
    };
  }): Promise<{ id: string }>;
};

type SessionDeleteStore = {
  deleteMany(args: {
    where: {
      id: string;
    };
  }): Promise<{ count: number }>;
};

type SessionCookieStore = Awaited<ReturnType<typeof cookies>>;

export type SessionRecord = {
  id: string;
  userId: string;
  token: string;
  tokenHash: string;
  expiresAt: Date;
};

export function createSessionTokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createOpaqueToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function isAdminEmail(email: string, adminEmails = process.env.ADMIN_EMAILS ?? "") {
  return adminEmails
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export function buildSessionRecord(
  userId: string,
  options: {
    now?: Date;
    token?: string;
  } = {}
) {
  const token = options.token ?? createOpaqueToken();
  const issuedAt = options.now ?? new Date();
  const expiresAt = new Date(issuedAt.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  return {
    userId,
    token,
    tokenHash: createSessionTokenHash(token),
    expiresAt
  };
}

export async function createSessionRecord(sessionStore: SessionCreateStore, userId: string) {
  const sessionRecord = buildSessionRecord(userId);
  const session = await sessionStore.create({
    data: {
      userId: sessionRecord.userId,
      tokenHash: sessionRecord.tokenHash,
      expiresAt: sessionRecord.expiresAt
    },
    select: { id: true }
  });

  return {
    id: session.id,
    ...sessionRecord
  } satisfies SessionRecord;
}

export async function deleteSessionRecord(sessionStore: SessionDeleteStore, sessionId: string) {
  await sessionStore.deleteMany({
    where: { id: sessionId }
  });
}

export async function deleteSessionByToken(token: string) {
  const tokenHash = createSessionTokenHash(token);
  await prisma.session.deleteMany({
    where: { tokenHash }
  });
}

export function writeSessionCookie(
  cookieStore: Pick<SessionCookieStore, "set">,
  session: Pick<SessionRecord, "token" | "expiresAt">
) {
  cookieStore.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt
  });
}

export async function setSessionCookie(session: Pick<SessionRecord, "token" | "expiresAt">) {
  const cookieStore = await cookies();
  writeSessionCookie(cookieStore, session);
}

export async function createSession(userId: string) {
  const session = await createSessionRecord(prisma.session, userId);

  try {
    await setSessionCookie(session);
  } catch (error) {
    try {
      await deleteSessionRecord(prisma.session, session.id);
    } catch {
      // Best-effort cleanup. Preserve the original cookie failure for callers.
    }
    throw error;
  }
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: createSessionTokenHash(token) },
    include: { user: true }
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session;
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function requireCreator() {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.CREATOR || user.whitelistStatus !== WhitelistStatus.ACTIVE) {
    throw new Error("Creator access is required");
  }

  return user;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) {
    throw new Error("Admin access is required");
  }

  return user;
}
