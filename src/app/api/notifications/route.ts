import { getCurrentUser } from "@/server/auth/session";
import { getUserNotifications, getUnreadCount } from "@/server/notifications/service";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
  const offset = Number(searchParams.get("offset") ?? 0);
  const unreadOnly = searchParams.get("unread") === "true";

  const [notifications, unreadCount] = await Promise.all([
    getUserNotifications(user.id, { limit, offset, unreadOnly }),
    getUnreadCount(user.id),
  ]);

  return Response.json({
    notifications,
    unreadCount,
    hasMore: notifications.length === limit,
  });
}
