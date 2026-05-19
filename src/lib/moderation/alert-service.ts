import { prisma } from "@/server/db";
import type { AlertOperator, AlertThresholdConfig, AlertEvent } from "./analytics-types";
import { emitModerationEvent } from "./event-stream";

export function evaluateThreshold(
  currentValue: number,
  operator: AlertOperator,
  threshold: number
): boolean {
  switch (operator) {
    case "gt": return currentValue > threshold;
    case "gte": return currentValue >= threshold;
    case "lt": return currentValue < threshold;
    case "lte": return currentValue <= threshold;
    case "eq": return currentValue === threshold;
    default: return false;
  }
}

export async function getActiveThresholds(): Promise<AlertThresholdConfig[]> {
  const thresholds = await prisma.alertThreshold.findMany({
    where: { isEnabled: true },
  });

  return thresholds.map((t) => ({
    id: t.id,
    name: t.name,
    metric: t.metric,
    operator: t.operator as AlertOperator,
    threshold: t.threshold,
    windowMinutes: t.windowMinutes,
    severity: t.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    isEnabled: t.isEnabled,
  }));
}

export async function createThreshold(
  config: Omit<AlertThresholdConfig, "id">
): Promise<AlertThresholdConfig> {
  const created = await prisma.alertThreshold.create({
    data: {
      name: config.name,
      metric: config.metric,
      operator: config.operator,
      threshold: config.threshold,
      windowMinutes: config.windowMinutes,
      severity: config.severity,
      isEnabled: config.isEnabled,
    },
  });

  return {
    id: created.id,
    name: created.name,
    metric: created.metric,
    operator: created.operator as AlertOperator,
    threshold: created.threshold,
    windowMinutes: created.windowMinutes,
    severity: created.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    isEnabled: created.isEnabled,
  };
}

export async function updateThreshold(
  id: string,
  updates: Partial<Omit<AlertThresholdConfig, "id">>
): Promise<AlertThresholdConfig | null> {
  const existing = await prisma.alertThreshold.findUnique({ where: { id } });
  if (!existing) return null;

  const updated = await prisma.alertThreshold.update({
    where: { id },
    data: {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.metric !== undefined && { metric: updates.metric }),
      ...(updates.operator !== undefined && { operator: updates.operator }),
      ...(updates.threshold !== undefined && { threshold: updates.threshold }),
      ...(updates.windowMinutes !== undefined && { windowMinutes: updates.windowMinutes }),
      ...(updates.severity !== undefined && { severity: updates.severity }),
      ...(updates.isEnabled !== undefined && { isEnabled: updates.isEnabled }),
    },
  });

  return {
    id: updated.id,
    name: updated.name,
    metric: updated.metric,
    operator: updated.operator as AlertOperator,
    threshold: updated.threshold,
    windowMinutes: updated.windowMinutes,
    severity: updated.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    isEnabled: updated.isEnabled,
  };
}

export async function deleteThreshold(id: string): Promise<boolean> {
  try {
    await prisma.alertThreshold.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function checkAlerts(
  metricsProvider: (metric: string, windowMinutes: number) => Promise<number>
): Promise<AlertEvent[]> {
  const thresholds = await getActiveThresholds();
  const triggeredAlerts: AlertEvent[] = [];

  for (const threshold of thresholds) {
    const currentValue = await metricsProvider(threshold.metric, threshold.windowMinutes);

    if (evaluateThreshold(currentValue, threshold.operator, threshold.threshold)) {
      // Check if there's already an active alert for this threshold
      const existingActive = await prisma.moderationAlert.findFirst({
        where: {
          thresholdId: threshold.id,
          status: "ACTIVE",
        },
      });

      if (!existingActive) {
        const alert = await prisma.moderationAlert.create({
          data: {
            thresholdId: threshold.id,
            metric: threshold.metric,
            currentValue,
            threshold: threshold.threshold,
            severity: threshold.severity,
            message: `${threshold.name}: ${threshold.metric} is ${currentValue} (${threshold.operator} ${threshold.threshold})`,
          },
        });

        const alertEvent: AlertEvent = {
          id: alert.id,
          thresholdId: threshold.id,
          metric: threshold.metric,
          currentValue,
          threshold: threshold.threshold,
          severity: alert.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
          message: alert.message,
          triggeredAt: alert.triggeredAt.toISOString(),
        };

        triggeredAlerts.push(alertEvent);

        emitModerationEvent({
          type: "alert_triggered",
          data: alertEvent,
        });
      }
    }
  }

  return triggeredAlerts;
}

export async function acknowledgeAlert(alertId: string): Promise<boolean> {
  try {
    await prisma.moderationAlert.update({
      where: { id: alertId },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function resolveAlert(alertId: string): Promise<boolean> {
  try {
    await prisma.moderationAlert.update({
      where: { id: alertId },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function getActiveAlerts(): Promise<AlertEvent[]> {
  const alerts = await prisma.moderationAlert.findMany({
    where: { status: "ACTIVE" },
    orderBy: { triggeredAt: "desc" },
    take: 100,
  });

  return alerts.map((a) => ({
    id: a.id,
    thresholdId: a.thresholdId,
    metric: a.metric,
    currentValue: a.currentValue,
    threshold: a.threshold,
    severity: a.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    message: a.message,
    triggeredAt: a.triggeredAt.toISOString(),
  }));
}

export async function getAlertHistory(limit: number = 50): Promise<AlertEvent[]> {
  const alerts = await prisma.moderationAlert.findMany({
    orderBy: { triggeredAt: "desc" },
    take: limit,
  });

  return alerts.map((a) => ({
    id: a.id,
    thresholdId: a.thresholdId,
    metric: a.metric,
    currentValue: a.currentValue,
    threshold: a.threshold,
    severity: a.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    message: a.message,
    triggeredAt: a.triggeredAt.toISOString(),
  }));
}
