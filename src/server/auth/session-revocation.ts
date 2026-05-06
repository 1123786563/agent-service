import { prisma } from "@/server/db";

/**
 * Revoke all sessions for a user — call when role or whitelist status changes.
 */
export async function revokeAllUserSessions(userId: string) {
  return prisma.session.deleteMany({
    where: { userId }
  });
}
