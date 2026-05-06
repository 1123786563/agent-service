import { prisma } from "@/server/db";

/**
 * Delete expired sessions and consumed/expired magic link tokens.
 * Should be called on a scheduled basis (e.g., cron job or API route).
 */
export async function cleanupExpiredSessionsAndTokens() {
  const now = new Date();

  const [sessions, tokens] = await Promise.all([
    prisma.session.deleteMany({
      where: { expiresAt: { lt: now } }
    }),
    prisma.magicLinkToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { consumedAt: { not: null } }
        ]
      }
    })
  ]);

  return {
    sessionsDeleted: sessions.count,
    tokensDeleted: tokens.count
  };
}
