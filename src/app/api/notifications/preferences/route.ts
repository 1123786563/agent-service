import { NotificationType } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

const ALL_NOTIFICATION_TYPES = Object.values(NotificationType);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preferences = await prisma.notificationPreference.findMany({
    where: { userId: user.id }
  });

  const prefsMap = new Map(preferences.map((p) => [p.notificationType, p]));

  const data = ALL_NOTIFICATION_TYPES.map((notificationType) => {
    const existing = prefsMap.get(notificationType);
    return {
      notificationType,
      emailEnabled: existing?.emailEnabled ?? true,
      pushEnabled: existing?.pushEnabled ?? true
    };
  });

  return Response.json({ data });
}

const updatePreferencesSchema = z.object({
  preferences: z.array(
    z.object({
      notificationType: z.nativeEnum(NotificationType),
      emailEnabled: z.boolean().optional(),
      pushEnabled: z.boolean().optional()
    })
  )
});

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updatePreferencesSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { preferences } = parsed.data;

  const results = await prisma.$transaction(
    preferences.map((pref) =>
      prisma.notificationPreference.upsert({
        where: {
          userId_notificationType: {
            userId: user.id,
            notificationType: pref.notificationType
          }
        },
        create: {
          userId: user.id,
          notificationType: pref.notificationType,
          emailEnabled: pref.emailEnabled ?? true,
          pushEnabled: pref.pushEnabled ?? true
        },
        update: {
          ...(pref.emailEnabled !== undefined ? { emailEnabled: pref.emailEnabled } : {}),
          ...(pref.pushEnabled !== undefined ? { pushEnabled: pref.pushEnabled } : {})
        }
      })
    )
  );

  return Response.json({ data: results });
}
