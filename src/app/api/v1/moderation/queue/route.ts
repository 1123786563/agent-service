import { z } from "zod";
import { authenticateApiKey } from "@/lib/moderation/api-key-auth";
import { logApiUsage } from "@/lib/moderation/usage-tracking";
import { deliverWebhooks } from "@/lib/moderation/webhook-service";
import { assignReviewer, getPendingItems, resolveItem, escalateItem } from "@/lib/moderation/queue-prisma-ops";

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export async function GET(request: Request) {
  const start = Date.now();
  const auth = await authenticateApiKey(request);
  if (!auth.authenticated) {
    return Response.json({ errors: [auth.error] }, { status: auth.statusCode });
  }

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  const items = await getPendingItems(parsed.data.limit, parsed.data.offset);

  await logApiUsage({
    apiKeyId: auth.apiKey.id,
    endpoint: "/api/v1/moderation/queue",
    method: "GET",
    statusCode: 200,
    responseMs: Date.now() - start,
  }).catch(() => {});

  return Response.json({ data: items }, { status: 200 });
}

const actionSchemas = {
  assign: z.object({ action: z.literal("assign"), itemId: z.string().min(1) }),
  resolve: z.object({ action: z.literal("resolve"), itemId: z.string().min(1), resolution: z.string().min(1).max(1000) }),
  escalate: z.object({ action: z.literal("escalate"), itemId: z.string().min(1) }),
};

export async function POST(request: Request) {
  const start = Date.now();
  const auth = await authenticateApiKey(request);
  if (!auth.authenticated) {
    return Response.json({ errors: [auth.error] }, { status: auth.statusCode });
  }

  let payload: unknown;
  try { payload = await request.json(); } catch {
    return Response.json({ errors: ["Request body must be valid JSON"] }, { status: 400 });
  }

  const base = z.object({ action: z.enum(["assign", "resolve", "escalate"]) }).safeParse(payload);
  if (!base.success) {
    return Response.json({ errors: ["Invalid action. Use: assign, resolve, or escalate"] }, { status: 400 });
  }

  try {
    let item;
    const action = base.data.action;

    if (action === "assign") {
      const parsed = actionSchemas.assign.safeParse(payload);
      if (!parsed.success) return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
      item = await assignReviewer(parsed.data.itemId);
      await deliverWebhooks("ITEM_ASSIGNED", { itemId: parsed.data.itemId, assignedTo: item.assignedToId }).catch(() => {});
    } else if (action === "resolve") {
      const parsed = actionSchemas.resolve.safeParse(payload);
      if (!parsed.success) return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
      item = await resolveItem(parsed.data.itemId, parsed.data.resolution);
      await deliverWebhooks("ITEM_RESOLVED", { itemId: parsed.data.itemId, resolution: parsed.data.resolution }).catch(() => {});
    } else {
      const parsed = actionSchemas.escalate.safeParse(payload);
      if (!parsed.success) return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
      item = await escalateItem(parsed.data.itemId);
      await deliverWebhooks("ITEM_ESCALATED", { itemId: parsed.data.itemId }).catch(() => {});
    }

    await logApiUsage({
      apiKeyId: auth.apiKey.id,
      endpoint: "/api/v1/moderation/queue",
      method: "POST",
      statusCode: 200,
      responseMs: Date.now() - start,
    }).catch(() => {});

    return Response.json({ data: item }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return Response.json({ errors: [message] }, { status: 400 });
  }
}
