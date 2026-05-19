import { NextResponse } from "next/server";
import { generateHealthStatuses } from "@/server/moderation/mock-data";

export async function GET() {
  const services = generateHealthStatuses();
  const overall = services.every((s) => s.status === "healthy")
    ? "healthy"
    : services.some((s) => s.status === "down")
      ? "degraded"
      : "degraded";

  return NextResponse.json({ overall, services, timestamp: new Date().toISOString() });
}
