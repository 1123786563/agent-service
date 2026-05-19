import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const notification = await prisma.notification.findFirst({
    where: { id, userId: user.id }
  });

  if (!notification) {
    return Response.json({ error: "Notification not found" }, { status: 404 });
  }

  if (notification.readAt) {
    return Response.json({ data: notification });
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: new Date() }
  });

  return Response.json({ data: updated });
}
