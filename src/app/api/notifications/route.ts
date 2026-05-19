import { NotificationType } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  read: z.enum(["true", "false", "all"]).default("all"),
  type: z.nativeEnum(NotificationType).optional()
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  );

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { cursor, limit, read, type } = parsed.data;

  const where = {
    userId: user.id,
    ...(read === "true" ? { readAt: { not: null } } : {}),
    ...(read === "false" ? { readAt: null } : {}),
    ...(type ? { type } : {}),
    ...(cursor ? { id: { lt: cursor } } : {})
  };

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1
  });

  const hasMore = notifications.length > limit;
  const items = hasMore ? notifications.slice(0, limit) : notifications;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return Response.json({
    data: items,
    pagination: { nextCursor, hasMore }
  });
}
