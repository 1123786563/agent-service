import { prisma } from "@/server/db";
import type { HealthStatus, PipelineHealth } from "./analytics-types";

async function checkDatabase(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      service: "database",
      status: "healthy",
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      service: "database",
      status: "unhealthy",
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Connection failed",
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkTextModeration(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const ruleCount = await prisma.moderationRule.count();
    return {
      service: "text_moderation",
      status: "healthy",
      latencyMs: Date.now() - start,
      message: `${ruleCount} active rules`,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      service: "text_moderation",
      status: "unhealthy",
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Check failed",
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkQueueSystem(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const [pending, critical] = await Promise.all([
      prisma.contentQueueItem.count({
        where: { status: { in: ["PENDING", "ASSIGNED", "IN_REVIEW"] } },
      }),
      prisma.contentQueueItem.count({
        where: {
          status: { in: ["PENDING", "ASSIGNED", "IN_REVIEW"] },
          priority: "CRITICAL",
        },
      }),
    ]);

    const status = critical > 100 ? "degraded" : "healthy";
    return {
      service: "queue_system",
      status,
      latencyMs: Date.now() - start,
      message: `${pending} pending (${critical} critical)`,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      service: "queue_system",
      status: "unhealthy",
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Check failed",
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkAggregationPipeline(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const latestStats = await prisma.moderationDailyStats.findFirst({
      orderBy: { date: "desc" },
    });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const isStale = !latestStats || new Date(latestStats.date) < oneDayAgo;

    return {
      service: "aggregation_pipeline",
      status: isStale ? "degraded" : "healthy",
      latencyMs: Date.now() - start,
      message: isStale ? "Stats are stale — last run may have failed" : "Last aggregation recent",
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      service: "aggregation_pipeline",
      status: "unhealthy",
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Check failed",
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkAlertSystem(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const activeAlerts = await prisma.moderationAlert.count({
      where: { status: "ACTIVE" },
    });

    return {
      service: "alert_system",
      status: activeAlerts > 10 ? "degraded" : "healthy",
      latencyMs: Date.now() - start,
      message: `${activeAlerts} active alerts`,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      service: "alert_system",
      status: "unhealthy",
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Check failed",
      lastChecked: new Date().toISOString(),
    };
  }
}

export async function getPipelineHealth(): Promise<PipelineHealth> {
  const checks = await Promise.all([
    checkDatabase(),
    checkTextModeration(),
    checkQueueSystem(),
    checkAggregationPipeline(),
    checkAlertSystem(),
  ]);

  const hasUnhealthy = checks.some((c) => c.status === "unhealthy");
  const hasDegraded = checks.some((c) => c.status === "degraded");

  const overall = hasUnhealthy ? "unhealthy" : hasDegraded ? "degraded" : "healthy";

  return {
    overall,
    services: checks,
    checkedAt: new Date().toISOString(),
  };
}

export async function getServiceHealth(serviceName: string): Promise<HealthStatus | null> {
  const serviceChecks: Record<string, () => Promise<HealthStatus>> = {
    database: checkDatabase,
    text_moderation: checkTextModeration,
    queue_system: checkQueueSystem,
    aggregation_pipeline: checkAggregationPipeline,
    alert_system: checkAlertSystem,
  };

  const checker = serviceChecks[serviceName];
  if (!checker) return null;
  return checker();
}
