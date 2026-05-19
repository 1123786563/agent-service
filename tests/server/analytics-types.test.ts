import { describe, expect, it } from "vitest";
import type {
  DailyStats,
  ModerationTrend,
  CategoryBreakdown,
  LanguageDistribution,
  ResponseTimeDistribution,
  AlertThresholdConfig,
  HealthStatus,
  PipelineHealth,
} from "@/lib/moderation/analytics-types";

describe("Analytics Types", () => {
  it("DailyStats type should have required fields", () => {
    const stats: DailyStats = {
      date: "2026-05-19",
      totalFlagged: 100,
      totalResolved: 80,
      falsePositiveCount: 5,
      falsePositiveRate: 0.0625,
      avgResponseTimeMs: 1500,
      moderatorThroughput: 10,
      criticalCount: 10,
      highCount: 20,
      mediumCount: 40,
      lowCount: 30,
      textCount: 60,
      imageCount: 40,
      languageBreakdown: { en: 60, zh: 25, ja: 10, ko: 5 },
      categoryBreakdown: { profanity: 40, spam: 30, hate_speech: 20, threat: 10 },
    };

    expect(stats.totalFlagged).toBe(100);
    expect(stats.falsePositiveRate).toBeCloseTo(0.0625);
    expect(Object.keys(stats.languageBreakdown)).toHaveLength(4);
  });

  it("ModerationTrend type should have required fields", () => {
    const trend: ModerationTrend = {
      date: "2026-05-19",
      totalFlagged: 50,
      totalResolved: 40,
      falsePositiveRate: 0.05,
      avgResponseTimeMs: 1200,
    };
    expect(trend.date).toBe("2026-05-19");
  });

  it("CategoryBreakdown type should have percentage", () => {
    const breakdown: CategoryBreakdown = {
      category: "profanity",
      count: 40,
      percentage: 40.0,
    };
    expect(breakdown.percentage).toBe(40.0);
  });

  it("LanguageDistribution type should have percentage", () => {
    const dist: LanguageDistribution = {
      language: "en",
      count: 60,
      percentage: 60.0,
    };
    expect(dist.percentage).toBe(60.0);
  });

  it("ResponseTimeDistribution type should have bucket ranges", () => {
    const dist: ResponseTimeDistribution = {
      bucket: "0-100ms",
      minMs: 0,
      maxMs: 100,
      count: 25,
    };
    expect(dist.maxMs - dist.minMs).toBe(100);
  });

  it("AlertThresholdConfig type should have all required fields", () => {
    const config: AlertThresholdConfig = {
      id: "thr_123",
      name: "Toxicity Spike",
      metric: "flagged_rate",
      operator: "gt",
      threshold: 200,
      windowMinutes: 60,
      severity: "CRITICAL",
      isEnabled: true,
    };
    expect(config.severity).toBe("CRITICAL");
  });

  it("PipelineHealth type should have overall status and services", () => {
    const health: PipelineHealth = {
      overall: "healthy",
      services: [
        { service: "database", status: "healthy", latencyMs: 5, lastChecked: "2026-05-19T00:00:00Z" },
      ],
      checkedAt: "2026-05-19T00:00:00Z",
    };
    expect(health.overall).toBe("healthy");
    expect(health.services).toHaveLength(1);
  });
});
