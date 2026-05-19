import { prisma } from "@/server/db";
import type { DailyStats } from "./analytics-types";

export async function computeDailyStats(date: Date): Promise<DailyStats> {
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  const [
    totalFlagged,
    totalResolved,
    resolvedItems,
    itemsByPriority,
    itemsByType,
    languageAgg,
    categoryAgg,
  ] = await Promise.all([
    prisma.contentQueueItem.count({
      where: { createdAt: { gte: startOfDay, lt: endOfDay } },
    }),
    prisma.contentQueueItem.count({
      where: {
        resolvedAt: { gte: startOfDay, lt: endOfDay },
        status: "RESOLVED",
      },
    }),
    prisma.contentQueueItem.findMany({
      where: {
        resolvedAt: { gte: startOfDay, lt: endOfDay, not: null as unknown as Date },
        status: "RESOLVED",
        createdAt: { not: null as unknown as Date },
      },
      select: {
        createdAt: true,
        resolvedAt: true,
        resolution: true,
        assignedToId: true,
      },
    }),
    prisma.contentQueueItem.groupBy({
      by: ["priority"],
      where: { createdAt: { gte: startOfDay, lt: endOfDay } },
      _count: { id: true },
    }),
    prisma.contentQueueItem.groupBy({
      by: ["contentType"],
      where: { createdAt: { gte: startOfDay, lt: endOfDay } },
      _count: { id: true },
    }),
    prisma.contentQueueItem.groupBy({
      by: ["language"],
      where: {
        createdAt: { gte: startOfDay, lt: endOfDay },
        language: { not: null },
      },
      _count: { id: true },
    }),
    computeCategoryBreakdown(startOfDay, endOfDay),
  ]);

  // Compute response times
  const responseTimes = resolvedItems
    .filter((item) => item.resolvedAt && item.createdAt)
    .map((item) => item.resolvedAt!.getTime() - item.createdAt.getTime());

  const avgResponseTimeMs = responseTimes.length > 0
    ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
    : 0;

  // False positive = resolved with "approve" resolution (flagged but actually OK)
  const falsePositiveCount = resolvedItems.filter(
    (item) => item.resolution?.toLowerCase() === "approve"
  ).length;

  // Moderator throughput = resolved items / unique moderators
  const uniqueModerators = new Set(resolvedItems.map((i) => i.assignedToId).filter(Boolean));
  const moderatorThroughput = uniqueModerators.size > 0
    ? totalResolved / uniqueModerators.size
    : 0;

  // Priority counts
  const priorityMap = Object.fromEntries(
    itemsByPriority.map((p) => [p.priority, p._count.id])
  );

  // Type counts
  const textCount = itemsByType.find((t) => t.contentType === "TEXT")?._count.id ?? 0;
  const imageCount = itemsByType.find((t) => t.contentType === "IMAGE")?._count.id ?? 0;

  // Language breakdown
  const languageBreakdown: Record<string, number> = {};
  for (const lang of languageAgg) {
    if (lang.language) languageBreakdown[lang.language] = lang._count.id;
  }

  const stats: DailyStats = {
    date: startOfDay.toISOString().split("T")[0],
    totalFlagged,
    totalResolved,
    falsePositiveCount,
    falsePositiveRate: totalResolved > 0 ? falsePositiveCount / totalResolved : 0,
    avgResponseTimeMs,
    moderatorThroughput,
    criticalCount: priorityMap["CRITICAL"] ?? 0,
    highCount: priorityMap["HIGH"] ?? 0,
    mediumCount: priorityMap["MEDIUM"] ?? 0,
    lowCount: priorityMap["LOW"] ?? 0,
    textCount,
    imageCount,
    languageBreakdown,
    categoryBreakdown: categoryAgg,
  };

  // Upsert into database
  await prisma.moderationDailyStats.upsert({
    where: { date: startOfDay },
    create: {
      date: startOfDay,
      totalFlagged,
      totalResolved,
      falsePositiveCount,
      avgResponseTimeMs,
      moderatorThroughput,
      criticalCount: priorityMap["CRITICAL"] ?? 0,
      highCount: priorityMap["HIGH"] ?? 0,
      mediumCount: priorityMap["MEDIUM"] ?? 0,
      lowCount: priorityMap["LOW"] ?? 0,
      textCount,
      imageCount,
      languageBreakdown,
      categoryBreakdown: categoryAgg,
    },
    update: {
      totalFlagged,
      totalResolved,
      falsePositiveCount,
      avgResponseTimeMs,
      moderatorThroughput,
      criticalCount: priorityMap["CRITICAL"] ?? 0,
      highCount: priorityMap["HIGH"] ?? 0,
      mediumCount: priorityMap["MEDIUM"] ?? 0,
      lowCount: priorityMap["LOW"] ?? 0,
      textCount,
      imageCount,
      languageBreakdown,
      categoryBreakdown: categoryAgg,
    },
  });

  return stats;
}

async function computeCategoryBreakdown(
  start: Date,
  end: Date
): Promise<Record<string, number>> {
  const items = await prisma.contentQueueItem.findMany({
    where: { createdAt: { gte: start, lt: end } },
    select: { categories: true },
  });

  const breakdown: Record<string, number> = {};
  for (const item of items) {
    for (const cat of item.categories) {
      breakdown[cat] = (breakdown[cat] ?? 0) + 1;
    }
  }
  return breakdown;
}

export async function runDailyAggregation(forDate?: Date): Promise<DailyStats> {
  const targetDate = forDate ?? new Date();
  return computeDailyStats(targetDate);
}
