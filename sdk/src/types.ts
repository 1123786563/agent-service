// Re-export all Phase 1/2 types
export type {
  Severity,
  ModerationRecommendation,
  ConfidenceLevel,
  ImageSafetyCategory,
  DetectedLanguage,
  TextAnalysisResult,
  FlaggedPhrase,
  ImageAnalysisResult,
  DetectedObject,
  BatchImageAnalysisResult,
  QueueItem,
  ReviewerWorkload,
} from "./types-legacy";

export type {
  DailyStats,
  ModerationTrend,
  CategoryBreakdown,
  LanguageDistribution,
  ResponseTimeDistribution,
  DashboardMetrics,
  RealtimeMetrics,
  PeriodMetrics,
  AlertOperator,
  AlertThresholdConfig,
  AlertEvent,
  HealthStatus,
  PipelineHealth,
} from "./types-analytics";

// ── SDK-specific types ──────────────────────────────────────────────

export interface SdkConfig {
  apiKey: string;
  baseUrl: string;
  timeout?: number;
  maxRetries?: number;
  retryBaseDelay?: number;
}

export type WebhookEventType =
  | "ITEM_FLAGGED"
  | "ITEM_RESOLVED"
  | "ITEM_ESCALATED"
  | "ITEM_ASSIGNED"
  | "ALERT_TRIGGERED";

export interface ApiResponse<T> {
  data: T;
  meta?: {
    requestId?: string;
    rateLimit?: {
      limit: number;
      remaining: number;
      resetAt: string;
    };
  };
}

export interface ApiErrorBody {
  errors: string[];
}

export interface TextAnalysisRequest {
  text: string;
  language?: "en" | "zh" | "ja" | "ko";
}

export interface ImageAnalysisRequest {
  image: File | Blob;
}

export interface BatchImageAnalysisRequest {
  images: (File | Blob)[];
}

export interface QueueListParams {
  limit?: number;
  offset?: number;
}

export interface QueueActionRequest {
  action: "assign" | "resolve" | "escalate";
  itemId: string;
  resolution?: string;
}

export interface AnalyticsQueryParams {
  view: "dashboard" | "trends" | "categories" | "languages" | "response_times" | "realtime" | "period";
  period?: number;
}

export interface WebhookRegistration {
  url: string;
  events: WebhookEventType[];
}

export interface WebhookInfo {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { deliveries: number };
}

export interface WebhookRegistrationResponse {
  id: string;
  url: string;
  events: string[];
  secret: string;
  createdAt: string;
}

export interface UsageStats {
  usage: {
    totalRequests: number;
    lastUsed: string | null;
    endpointBreakdown: Array<{ endpoint: string; count: number }>;
  };
  quota: {
    remaining: number;
    limit: number;
    windowSeconds: number;
  };
  tier: "STANDARD" | "PREMIUM";
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  tier: "STANDARD" | "PREMIUM";
  rateLimit: number;
  rawKey?: string;
  createdAt: string;
}

export interface ModerationEvent {
  id: string;
  type: "item_flagged" | "item_resolved" | "item_escalated" | "item_assigned" | "alert_triggered";
  timestamp: string;
  data: Record<string, unknown>;
}

export interface RequestInterceptor {
  (config: RequestInit & { url: string }): RequestInit & { url: string };
}

export interface ResponseInterceptor {
  (response: Response): Response | Promise<Response>;
}
