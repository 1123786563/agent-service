import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import {
  getActiveThresholds,
  createThreshold,
  getActiveAlerts,
  getAlertHistory,
} from "@/lib/moderation/alert-service";

const querySchema = z.object({
  view: z.enum(["thresholds", "active_alerts", "alert_history"]).default("thresholds"),
  limit: z.coerce.number().min(1).max(200).default(50),
});

const createThresholdSchema = z.object({
  name: z.string().min(1).max(200),
  metric: z.string().min(1),
  operator: z.enum(["gt", "gte", "lt", "lte", "eq"]),
  threshold: z.number(),
  windowMinutes: z.number().min(1).default(60),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("HIGH"),
  isEnabled: z.boolean().default(true),
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

  try {
    switch (parsed.data.view) {
      case "thresholds": {
        const data = await getActiveThresholds();
        return Response.json({ data }, { status: 200 });
      }
      case "active_alerts": {
        const data = await getActiveAlerts();
        return Response.json({ data }, { status: 200 });
      }
      case "alert_history": {
        const data = await getAlertHistory(parsed.data.limit);
        return Response.json({ data }, { status: 200 });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch alerts";
    return Response.json({ errors: [message] }, { status: 500 });
  }
}

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

  const parsed = createThresholdSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  try {
    const threshold = await createThreshold(parsed.data);
    return Response.json({ data: threshold }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create threshold";
    return Response.json({ errors: [message] }, { status: 500 });
  }
}
