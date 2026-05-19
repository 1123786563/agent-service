import { z } from "zod";
import { authenticateApiKey } from "@/lib/moderation/api-key-auth";
import { logApiUsage } from "@/lib/moderation/usage-tracking";
import {
  getModerationTrends,
  getCategoryBreakdown,
  getLanguageDistribution,
  getResponseTimeDistribution,
  getDashboardMetrics,
  getRealtimeMetrics,
  getPeriodMetrics,
} from "@/lib/moderation/analytics-query";

const querySchema = z.object({
  period: z.coerce.number().min(1).max(365).default(30),
  view: z.enum(["dashboard", "trends", "categories", "languages", "response_times", "realtime", "period"]).default("dashboard"),
});

export async function GET(request: Request) {
  const start = Date.now();
  const auth = await authenticateApiKey(request);
  if (!auth.authenticated) {
    return Response.json({ errors: [auth.error] }, { status: auth.statusCode });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  const { period, view } = parsed.data;

  try {
    let data;
    switch (view) {
      case "dashboard": data = await getDashboardMetrics(period); break;
      case "trends": data = await getModerationTrends(period); break;
      case "categories": data = await getCategoryBreakdown(period); break;
      case "languages": data = await getLanguageDistribution(period); break;
      case "response_times": data = await getResponseTimeDistribution(period); break;
      case "realtime": data = await getRealtimeMetrics(); break;
      case "period": data = await getPeriodMetrics(period); break;
    }

    await logApiUsage({
      apiKeyId: auth.apiKey.id,
      endpoint: "/api/v1/moderation/analytics",
      method: "GET",
      statusCode: 200,
      responseMs: Date.now() - start,
    }).catch(() => {});

    return Response.json({ data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch analytics";
    return Response.json({ errors: [message] }, { status: 500 });
  }
}
