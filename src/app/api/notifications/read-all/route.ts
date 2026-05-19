import { getCurrentUser } from "@/server/auth/session";
import { markAllAsRead } from "@/server/notifications/service";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const result = await markAllAsRead(user.id);
  return Response.json({ updated: result.count });
}
