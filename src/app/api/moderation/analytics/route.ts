import { NextResponse } from "next/server";
import {
  generateDailyAggregations,
  generateCategoryBreakdown,
  generateLanguageDistribution,
} from "@/server/moderation/mock-data";

export async function GET() {
  const daily = generateDailyAggregations(30);
  const categories = generateCategoryBreakdown();
  const languages = generateLanguageDistribution();
  const totalFlagged = daily.reduce((sum, d) => sum + d.totalFlagged, 0);
  const avgFalsePositive =
    Math.round(
      (daily.reduce((sum, d) => sum + d.falsePositiveRate, 0) / daily.length) * 100,
    ) / 100;
  const avgResponseTime = Math.round(
    daily.reduce((sum, d) => sum + d.avgResponseTimeMs, 0) / daily.length,
  );
  const avgThroughput = Math.round(
    daily.reduce((sum, d) => sum + d.moderatorThroughput, 0) / daily.length,
  );

  return NextResponse.json({
    summary: {
      totalFlagged,
      avgFalsePositiveRate: avgFalsePositive,
      avgResponseTimeMs: avgResponseTime,
      avgModeratorThroughput: avgThroughput,
    },
    daily,
    categories,
    languages,
  });
}
