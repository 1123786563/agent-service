import { authenticateApiKey } from "@/lib/moderation/api-key-auth";
import { logApiUsage } from "@/lib/moderation/usage-tracking";
import { deliverWebhooks } from "@/lib/moderation/webhook-service";
import { analyzeText, analyzeTextInputSchema } from "@/lib/moderation/text-analyzer";
import { addToQueue } from "@/lib/moderation/queue-service";
import { createPrismaQueueStore } from "@/lib/moderation/queue-store";

export async function POST(request: Request) {
  const start = Date.now();
  const auth = await authenticateApiKey(request);
  if (!auth.authenticated) {
    return Response.json({ errors: [auth.error] }, { status: auth.statusCode });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ errors: ["Request body must be valid JSON"] }, { status: 400 });
  }

  const parsed = analyzeTextInputSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  const result = analyzeText(parsed.data);

  if (result.recommendation === "flag" || result.recommendation === "reject") {
    try {
      const queueStore = createPrismaQueueStore();
      const categories = [...new Set(result.flaggedPhrases.map((p) => p.category))];
      await addToQueue({
        contentType: "TEXT",
        contentRef: `text:${Date.now()}:${parsed.data.text.substring(0, 20)}`,
        contentSnippet: parsed.data.text.substring(0, 500),
        toxicityScore: result.toxicityScore,
        flaggedPhrases: result.flaggedPhrases.map((p) => p.phrase),
        categories,
        language: result.detectedLanguage,
      }, queueStore);

      await deliverWebhooks("ITEM_FLAGGED", {
        itemId: `text:${Date.now()}`,
        contentType: "TEXT",
        toxicityScore: result.toxicityScore,
        recommendation: result.recommendation,
        categories,
      }).catch(() => {});
    } catch {}
  }

  await logApiUsage({
    apiKeyId: auth.apiKey.id,
    endpoint: "/api/v1/moderation/analyze-text",
    method: "POST",
    statusCode: 200,
    responseMs: Date.now() - start,
  }).catch(() => {});

  return Response.json({ data: result }, { status: 200 });
}
