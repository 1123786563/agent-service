import { z } from "zod";
import { authenticateApiKey } from "@/lib/moderation/api-key-auth";
import { getApiKeyUsage, getApiKeyQuotaRemaining } from "@/lib/moderation/usage-tracking";

const querySchema = z.object({
  period: z.coerce.number().min(1).max(365).default(30),
});

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth.authenticated) {
    return Response.json({ errors: [auth.error] }, { status: auth.statusCode });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  const [usage, quota] = await Promise.all([
    getApiKeyUsage(auth.apiKey.id, parsed.data.period),
    getApiKeyQuotaRemaining(auth.apiKey.id, auth.apiKey.rateLimit),
  ]);

  return Response.json({
    data: {
      usage,
      quota,
      tier: auth.apiKey.tier,
    },
  }, { status: 200 });
}
