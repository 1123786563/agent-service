import type {
  QueueItem,
  DailyAggregation,
  CategoryBreakdown,
  AlertConfig,
  HealthStatus,
  Language,
  Severity,
} from "./types";

const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];
const LANGUAGES: Language[] = ["en", "zh", "ja", "ko"];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const FLAGGED_PHRASES_EN = [
  "hate speech", "violent threat", "harassment", "self-harm",
  "explicit content", "spam link", "impersonation",
];
const FLAGGED_PHRASES_ZH = [
  "仇恨言论", "暴力威胁", "骚扰", "自我伤害",
  "不当内容", "垃圾链接", "冒充",
];

export function generateQueueItems(count = 50): QueueItem[] {
  const items: QueueItem[] = [];
  for (let i = 0; i < count; i++) {
    const lang = LANGUAGES[rand(0, LANGUAGES.length - 1)];
    const severity = SEVERITIES[rand(0, SEVERITIES.length - 1)];
    const isText = Math.random() > 0.3;
    const phrases = lang === "zh"
      ? FLAGGED_PHRASES_ZH.slice(0, rand(1, 3))
      : FLAGGED_PHRASES_EN.slice(0, rand(1, 3));

    items.push({
      id: `mod-${String(i + 1).padStart(4, "0")}`,
      contentType: isText ? "text" : "image",
      contentPreview: isText
        ? `Sample flagged content item #${i + 1} containing ${phrases.join(", ")}`
        : `Uploaded image #${i + 1} flagged for review`,
      submittedAt: new Date(Date.now() - rand(0, 86400000 * 7)).toISOString(),
      severity,
      status: ["pending", "pending", "in_review", "resolved", "escalated"][rand(0, 4)] as QueueItem["status"],
      assignedModerator: Math.random() > 0.4 ? `moderator-${rand(1, 5)}` : undefined,
      language: lang,
      toxicityScore: Math.round((Math.random() * 0.8 + 0.1) * 100) / 100,
      flaggedPhrases: phrases,
      moderationHistory: Math.random() > 0.5
        ? [
            {
              id: `evt-${i}`,
              action: "flagged",
              actor: "ai-moderator",
              timestamp: new Date(Date.now() - rand(0, 86400000 * 3)).toISOString(),
            },
          ]
        : [],
    });
  }
  return items;
}

export function generateDailyAggregations(days = 30): DailyAggregation[] {
  const data: DailyAggregation[] = [];
  for (let i = days; i >= 0; i--) {
    const flagged = rand(40, 320);
    data.push({
      date: dateOffset(-i),
      totalFlagged: flagged,
      falsePositiveRate: Math.round((rand(5, 25) / 100) * 100) / 100,
      avgResponseTimeMs: rand(800, 4500),
      moderatorThroughput: rand(15, 85),
    });
  }
  return data;
}

export function generateCategoryBreakdown(): CategoryBreakdown[] {
  return [
    { category: "Toxicity", count: rand(200, 600), percentage: 35, color: "#ff385c" },
    { category: "Spam", count: rand(100, 300), percentage: 22, color: "#460479" },
    { category: "Harassment", count: rand(80, 200), percentage: 18, color: "#92174d" },
    { category: "Violence", count: rand(40, 120), percentage: 12, color: "#e00b41" },
    { category: "Self-harm", count: rand(20, 80), percentage: 8, color: "#ffd1da" },
    { category: "Other", count: rand(10, 50), percentage: 5, color: "#929292" },
  ];
}

export function generateLanguageDistribution(): CategoryBreakdown[] {
  return [
    { category: "English", count: rand(500, 1000), percentage: 45, color: "#ff385c" },
    { category: "Chinese", count: rand(200, 500), percentage: 28, color: "#460479" },
    { category: "Japanese", count: rand(80, 200), percentage: 15, color: "#92174d" },
    { category: "Korean", count: rand(60, 150), percentage: 12, color: "#ffd1da" },
  ];
}

export function generateAlertConfigs(): AlertConfig[] {
  return [
    {
      id: "alert-1",
      metric: "toxicity_spike",
      threshold: 200,
      condition: "spike",
      enabled: true,
      lastTriggered: dateOffset(-1),
    },
    {
      id: "alert-2",
      metric: "queue_backlog",
      threshold: 500,
      condition: "above",
      enabled: true,
      lastTriggered: dateOffset(-3),
    },
    {
      id: "alert-3",
      metric: "false_positive_rate",
      threshold: 20,
      condition: "above",
      enabled: false,
    },
    {
      id: "alert-4",
      metric: "response_time",
      threshold: 5000,
      condition: "above",
      enabled: true,
    },
  ];
}

export function generateHealthStatuses(): HealthStatus[] {
  return [
    {
      service: "Text Analysis",
      status: "healthy",
      latencyMs: rand(45, 120),
      lastChecked: new Date().toISOString(),
    },
    {
      service: "Image Analysis",
      status: "healthy",
      latencyMs: rand(200, 800),
      lastChecked: new Date().toISOString(),
    },
    {
      service: "Queue Manager",
      status: "degraded",
      latencyMs: rand(100, 300),
      lastChecked: new Date().toISOString(),
      details: "Elevated latency detected on queue processor",
    },
    {
      service: "Notification Service",
      status: "healthy",
      latencyMs: rand(30, 80),
      lastChecked: new Date().toISOString(),
    },
    {
      service: "Analytics Aggregator",
      status: "healthy",
      latencyMs: rand(150, 400),
      lastChecked: new Date().toISOString(),
    },
    {
      service: "Redis Cache",
      status: "down",
      latencyMs: 0,
      lastChecked: new Date().toISOString(),
      details: "Connection refused — failover in progress",
    },
  ];
}
