import { NextResponse } from "next/server";
import { generateDailyAggregations } from "@/server/moderation/mock-data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") ?? "30d";
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;

  return NextResponse.json({
    range,
    data: generateDailyAggregations(days),
  });
}
