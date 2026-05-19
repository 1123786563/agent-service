import { NextResponse } from "next/server";
import { generateAlertConfigs } from "@/server/moderation/mock-data";

const alerts = generateAlertConfigs();

export async function GET() {
  return NextResponse.json({ alerts });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { id, enabled, threshold, condition } = body as {
    id: string;
    enabled?: boolean;
    threshold?: number;
    condition?: string;
  };

  const alert = alerts.find((a) => a.id === id);
  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  if (enabled !== undefined) alert.enabled = enabled;
  if (threshold !== undefined) alert.threshold = threshold;
  if (condition !== undefined) alert.condition = condition as typeof alert.condition;

  return NextResponse.json(alert);
}
