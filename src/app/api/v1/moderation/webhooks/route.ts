import { z } from "zod";
import { authenticateApiKey } from "@/lib/moderation/api-key-auth";
import { registerWebhook, listWebhooks } from "@/lib/moderation/webhook-service";

const webhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(["ITEM_FLAGGED", "ITEM_RESOLVED", "ITEM_ESCALATED", "ITEM_ASSIGNED", "ALERT_TRIGGERED"])).min(1),
});

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth.authenticated) {
    return Response.json({ errors: [auth.error] }, { status: auth.statusCode });
  }

  const webhooks = await listWebhooks(auth.apiKey.id);
  return Response.json({ data: webhooks }, { status: 200 });
}

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth.authenticated) {
    return Response.json({ errors: [auth.error] }, { status: auth.statusCode });
  }

  let payload: unknown;
  try { payload = await request.json(); } catch {
    return Response.json({ errors: ["Request body must be valid JSON"] }, { status: 400 });
  }

  const parsed = webhookSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  try {
    const webhook = await registerWebhook(auth.apiKey.id, parsed.data);
    return Response.json({ data: webhook }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to register webhook";
    return Response.json({ errors: [message] }, { status: 500 });
  }
}
