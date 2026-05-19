import { getCurrentUser } from "@/server/auth/session";
import { markAsRead } from "@/server/notifications/service";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ errors: ["Invalid JSON"] }, { status: 400 });
  }

  const { ids } = payload as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return Response.json({ errors: ["ids must be a non-empty array"] }, { status: 400 });
  }

  const result = await markAsRead(user.id, ids);
  return Response.json({ updated: result.count });
}
