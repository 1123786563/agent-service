import { prisma } from "@/server/db";
import type {
  ModerationTrend,
  CategoryBreakdown,
  LanguageDistribution,
  ResponseTimeDistribution,
  RealtimeMetrics,
  PeriodMetrics,
  DashboardMetrics,
} from "./analytics-types";

export async function getModerationTrends(days: number): Promise<ModerationTrend[]> {
  const stats = await prisma.moderationDailyStats.findMany({
    where: {
      date: {
        gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { date: "asc" },
  });

  return stats.map((s) => ({
    date: s.date.toISOString().split("T")[0],
    totalFlagged: s.totalFlagged,
    totalResolved: s.totalResolved,
    falsePositiveRate: s.totalResolved > 0 ? s.falsePositiveCount / s.totalResolved : 0,
    avgResponseTimeMs: s.avgResponseTimeMs,
  }));
}

export async function getCategoryBreakdown(days: number): Promise<CategoryBreakdown[]> {
  const stats = await prisma.moderationDailyStats.findMany({
    where: {
      date: {
        gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      },
    },
    select: { categoryBreakdown: true },
  });

  const merged: Record<string, number> = {};
  let total = 0;
  for (const s of stats) {
    const breakdown = s.categoryBreakdown as Record<string, number> | null;
    if (breakdown) {
      for (const [cat, count] of Object.entries(breakdown)) {
        merged[cat] = (merged[cat] ?? 0) + count;
        total += count;
      }
    }
  }

  return Object.entries(merged)
    .map(([category, count]) => ({
      category,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function getLanguageDistribution(days: number): Promise<LanguageDistribution[]> {
  const stats = await prisma.moderationDailyStats.findMany({
    where: {
      date: {
        gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      },
    },
    select: { languageBreakdown: true },
  });

  const merged: Record<string, number> = {};
  let total = 0;
  for (const s of stats) {
    const breakdown = s.languageBreakdown as Record<string, number> | null;
    if (breakdown) {
      for (const [lang, count] of Object.entries(breakdown)) {
        merged[lang] = (merged[lang] ?? 0) + count;
        total += count;
      }
    }
  }

  return Object.entries(merged)
    .map(([language, count]) => ({
      language,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function getResponseTimeDistribution(days: number): Promise<ResponseTimeDistribution[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const resolved = await prisma.contentQueueItem.findMany({
    where: {
      status: "RESOLVED",
      resolvedAt: { gte: cutoff },
      createdAt: { not: null },
    },
    select: {
      createdAt: true,
      resolvedAt: true,
    },
  });

  const buckets = [
    { bucket: "0-100ms", minMs: 0, maxMs: 100 },
    { bucket: "100ms-500ms", minMs: 100, maxMs: 500 },
    { bucket: "500ms-1s", minMs: 500, maxMs: 1000 },
    { bucket: "1s-5s", minMs: 1000, maxMs: 5000 },
    { bucket: "5s-30s", minMs: 5000, maxMs: 30000 },
    { bucket: "30s-1m", minMs: 30000, maxMs: 60000 },
    { bucket: "1m-5m", minMs: 60000, maxMs: 300000 },
    { bucket: "5m+", minMs: 300000, maxMs: Infinity },
  ];

  const times = resolved
    .filter((item) => item.resolvedAt)
    .map((item) => item.resolvedAt!.getTime() - item.createdAt.getTime());

  return buckets.map(({ bucket, minMs, maxMs }) => ({
    bucket,
    minMs,
    maxMs,
    count: times.filter((t) => t >= minMs && t < maxMs).length,
  }));
}

export async function getRealtimeMetrics(): Promise<RealtimeMetrics> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [pendingItems, criticalPending, itemsLastHour, activeReviewers] =
    await Promise.all([
      prisma.contentQueueItem.count({
        where: { status: { in: ["PENDING", "ASSIGNED", "IN_REVIEW"] } },
      }),
      prisma.contentQueueItem.count({
        where: {
          status: { in: ["PENDING", "ASSIGNED", "IN_REVIEW"] },
          priority: "CRITICAL",
        },
      }),
      prisma.contentQueueItem.count({
        where: { createdAt: { gte: oneHourAgo } },
      }),
      prisma.contentQueueItem.groupBy({
        by: ["assignedToId"],
        where: {
          status: { in: ["ASSIGNED", "IN_REVIEW"] },
          assignedToId: { not: null },
        },
        _count: { id: true },
      }),
    ]);

  // Compute average processing time for items resolved in the last hour
  const recentResolved = await prisma.contentQueueItem.findMany({
    where: {
      status: "RESOLVED",
      resolvedAt: { gte: oneHourAgo },
    },
    select: { createdAt: true, resolvedAt: true },
  });

  const processingTimes = recentResolved
    .filter((item) => item.resolvedAt)
    .map((item) => item.resolvedAt!.getTime() - item.createdAt.getTime());

  const avgProcessingTimeMs = processingTimes.length > 0
    ? processingTimes.reduce((sum, t) => sum + t, 0) / processingTimes.length
    : 0;

  return {
    pendingItems,
    criticalPending,
    itemsLastHour,
    avgProcessingTimeMs,
    activeReviewers: activeReviewers.length,
  };
}

export async function getPeriodMetrics(days: number): Promise<PeriodMetrics> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const stats = await prisma.moderationDailyStats.findMany({
    where: { date: { gte: startDate } },
  });

  const totalFlagged = stats.reduce((sum, s) => sum + s.totalFlagged, 0);
  const totalResolved = stats.reduce((sum, s) => sum + s.totalResolved, 0);
  const falsePositiveCount = stats.reduce((sum, s) => sum + s.falsePositiveCount, 0);
  const weightedAvgResponseTime = totalResolved > 0
    ? stats.reduce((sum, s) => sum + s.avgResponseTimeMs * s.totalResolved, 0) / totalResolved
    : 0;
  const uniqueModerators = stats.reduce(
    (sum, s) => sum + Math.ceil(s.moderatorThroughput > 0 ? s.totalResolved / s.moderatorThroughput : 0),
    0
  );
  const moderatorThroughput = uniqueModerators > 0 ? totalResolved / uniqueModerators : 0;

  return {
    totalFlagged,
    totalResolved,
    falsePositiveRate: totalResolved > 0 ? falsePositiveCount / totalResolved : 0,
    avgResponseTimeMs: weightedAvgResponseTime,
    moderatorThroughput,
    periodStart: startDate.toISOString(),
    periodEnd: new Date().toISOString(),
  };
}

export async function getDashboardMetrics(days: number = 30): Promise<DashboardMetrics> {
  const [realtime, period] = await Promise.all([
    getRealtimeMetrics(),
    getPeriodMetrics(days),
  ]);

  return { realtime, period };
}
