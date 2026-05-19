import { getCurrentUser } from "@/server/auth/session";
import { getUnreadCount } from "@/server/notifications/service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const count = await getUnreadCount(user.id);
  return Response.json({ unreadCount: count });
}
