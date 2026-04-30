import crypto from "node:crypto";
import { UserRole, WhitelistStatus } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";

const SESSION_COOKIE = "hermes_market_session";
const SESSION_DAYS = 30;

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

export async function createSession(userId: string) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: createSessionTokenHash(token),
      expiresAt
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function getCurrentUser() {
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

  return session.user;
}

export async function requireCreator() {
  const user = await getCurrentUser();
  if (!user || user.whitelistStatus !== WhitelistStatus.ACTIVE) {
    throw new Error("Creator whitelist is required");
  }

  return user;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.ADMIN) {
    throw new Error("Admin access is required");
  }

  return user;
}
