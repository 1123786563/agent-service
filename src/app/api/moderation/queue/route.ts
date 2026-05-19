import { z } from "zod";
import { assignReviewer, getPendingItems, resolveItem, escalateItem } from "@/lib/moderation/queue-prisma-ops";
import { getCurrentUser } from "@/server/auth/session";

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  const items = await getPendingItems(parsed.data.limit, parsed.data.offset);
  return Response.json({ data: items }, { status: 200 });
}

const assignSchema = z.object({
  itemId: z.string().min(1),
});

const resolveSchema = z.object({
  itemId: z.string().min(1),
  resolution: z.string().min(1).max(1000),
});

const escalateSchema = z.object({
  itemId: z.string().min(1),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ errors: ["Request body must be valid JSON"] }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return Response.json({ errors: ["Request body must be an object"] }, { status: 400 });
  }

  const { action } = payload as { action?: string };

  try {
    if (action === "assign") {
      const parsed = assignSchema.safeParse(payload);
      if (!parsed.success) {
        return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
      }
      const item = await assignReviewer(parsed.data.itemId);
      return Response.json({ data: item }, { status: 200 });
    }

    if (action === "resolve") {
      const parsed = resolveSchema.safeParse(payload);
      if (!parsed.success) {
        return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
      }
      const item = await resolveItem(parsed.data.itemId, parsed.data.resolution);
      return Response.json({ data: item }, { status: 200 });
    }

    if (action === "escalate") {
      const parsed = escalateSchema.safeParse(payload);
      if (!parsed.success) {
        return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
      }
      const item = await escalateItem(parsed.data.itemId);
      return Response.json({ data: item }, { status: 200 });
    }

    return Response.json({ errors: ["Invalid action. Use: assign, resolve, or escalate"] }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return Response.json({ errors: [message] }, { status: 400 });
  }
}
