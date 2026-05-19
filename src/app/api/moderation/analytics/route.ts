import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
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
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  const { period, view } = parsed.data;

  try {
    switch (view) {
      case "dashboard": {
        const data = await getDashboardMetrics(period);
        return Response.json({ data }, { status: 200 });
      }
      case "trends": {
        const data = await getModerationTrends(period);
        return Response.json({ data }, { status: 200 });
      }
      case "categories": {
        const data = await getCategoryBreakdown(period);
        return Response.json({ data }, { status: 200 });
      }
      case "languages": {
        const data = await getLanguageDistribution(period);
        return Response.json({ data }, { status: 200 });
      }
      case "response_times": {
        const data = await getResponseTimeDistribution(period);
        return Response.json({ data }, { status: 200 });
      }
      case "realtime": {
        const data = await getRealtimeMetrics();
        return Response.json({ data }, { status: 200 });
      }
      case "period": {
        const data = await getPeriodMetrics(period);
        return Response.json({ data }, { status: 200 });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch analytics";
    return Response.json({ errors: [message] }, { status: 500 });
  }
}
