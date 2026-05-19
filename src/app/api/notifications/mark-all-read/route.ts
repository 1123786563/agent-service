import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() }
  });

  return Response.json({ data: { updatedCount: result.count } });
}
