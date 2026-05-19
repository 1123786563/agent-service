export interface DailyStats {
  date: string;
  totalFlagged: number;
  totalResolved: number;
  falsePositiveCount: number;
  falsePositiveRate: number;
  avgResponseTimeMs: number;
  moderatorThroughput: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  textCount: number;
  imageCount: number;
  languageBreakdown: Record<string, number>;
  categoryBreakdown: Record<string, number>;
}

export interface ModerationTrend {
  date: string;
  totalFlagged: number;
  totalResolved: number;
  falsePositiveRate: number;
  avgResponseTimeMs: number;
}

export interface CategoryBreakdown {
  category: string;
  count: number;
  percentage: number;
}

export interface LanguageDistribution {
  language: string;
  count: number;
  percentage: number;
}

export interface ResponseTimeDistribution {
  bucket: string;
  minMs: number;
  maxMs: number;
  count: number;
}

export interface DashboardMetrics {
  realtime: RealtimeMetrics;
  period: PeriodMetrics;
}

export interface RealtimeMetrics {
  pendingItems: number;
  criticalPending: number;
  itemsLastHour: number;
  avgProcessingTimeMs: number;
  activeReviewers: number;
}

export interface PeriodMetrics {
  totalFlagged: number;
  totalResolved: number;
  falsePositiveRate: number;
  avgResponseTimeMs: number;
  moderatorThroughput: number;
  periodStart: string;
  periodEnd: string;
}

export type AlertOperator = "gt" | "gte" | "lt" | "lte" | "eq";

export interface AlertThresholdConfig {
  id: string;
  name: string;
  metric: string;
  operator: AlertOperator;
  threshold: number;
  windowMinutes: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  isEnabled: boolean;
}

export interface AlertEvent {
  id: string;
  thresholdId: string;
  metric: string;
  currentValue: number;
  threshold: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
  triggeredAt: string;
}

export interface HealthStatus {
  service: string;
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs: number;
  message?: string;
  lastChecked: string;
}

export interface PipelineHealth {
  overall: "healthy" | "degraded" | "unhealthy";
  services: HealthStatus[];
  checkedAt: string;
}
