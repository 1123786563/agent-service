import { getCurrentUser } from "@/server/auth/session";
import { registerPushToken, unregisterPushToken } from "@/server/notifications/service";

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

  const { token, platform } = payload as { token?: string; platform?: string };
  if (!token || typeof token !== "string") {
    return Response.json({ errors: ["token is required"] }, { status: 400 });
  }

  const result = await registerPushToken(user.id, token, platform ?? "web");
  return Response.json({ pushToken: { id: result.id } }, { status: 201 });
}

export async function DELETE(request: Request) {
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

  const { token } = payload as { token?: string };
  if (!token || typeof token !== "string") {
    return Response.json({ errors: ["token is required"] }, { status: 400 });
  }

  await unregisterPushToken(user.id, token);
  return Response.json({ ok: true });
}
