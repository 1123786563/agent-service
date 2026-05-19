import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await prisma.notification.count({
    where: { userId: user.id, readAt: null }
  });

  return Response.json({ data: { unreadCount: count } });
}
