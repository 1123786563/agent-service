import { getCurrentUser } from "@/server/auth/session";
import { getUserPreferences, upsertPreference } from "@/server/notifications/service";
import { NotificationChannel, NotificationType } from "@prisma/client";

const VALID_CHANNELS = new Set<string>(Object.values(NotificationChannel));
const VALID_TYPES = new Set<string>(Object.values(NotificationType));

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const preferences = await getUserPreferences(user.id);
  return Response.json({ preferences });
}

export async function PUT(request: Request) {
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

  const { notificationType, channel, enabled } = payload as {
    notificationType?: string;
    channel?: string;
    enabled?: boolean;
  };

  if (!notificationType || !VALID_TYPES.has(notificationType)) {
    return Response.json({ errors: ["Invalid notificationType"] }, { status: 400 });
  }
  if (!channel || !VALID_CHANNELS.has(channel)) {
    return Response.json({ errors: ["Invalid channel"] }, { status: 400 });
  }
  if (typeof enabled !== "boolean") {
    return Response.json({ errors: ["enabled must be boolean"] }, { status: 400 });
  }

  const preference = await upsertPreference(
    user.id,
    notificationType as NotificationType,
    channel as NotificationChannel,
    enabled
  );
  return Response.json({ preference });
}
