export type Severity = "low" | "medium" | "high" | "critical";
export type ModerationAction = "approve" | "flag" | "reject";
export type QueueStatus = "pending" | "in_review" | "resolved" | "escalated";
export type ContentType = "text" | "image";
export type Language = "en" | "zh" | "ja" | "ko";

export interface TextAnalysisResult {
  toxicityScore: number;
  flaggedPhrases: string[];
  recommendedAction: ModerationAction;
  confidence: number;
  severity: Severity;
  language: Language;
}

export interface ImageAnalysisResult {
  category: "safe" | "suspicious" | "unsafe";
  detectedObjects: string[];
  confidence: number;
  severity: Severity;
}

export interface QueueItem {
  id: string;
  contentType: ContentType;
  contentPreview: string;
  thumbnailUrl?: string;
  submittedAt: string;
  severity: Severity;
  status: QueueStatus;
  assignedModerator?: string;
  language: Language;
  toxicityScore: number;
  flaggedPhrases: string[];
  moderationHistory: ModerationEvent[];
}

export interface ModerationEvent {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  note?: string;
}

export interface DailyAggregation {
  date: string;
  totalFlagged: number;
  falsePositiveRate: number;
  avgResponseTimeMs: number;
  moderatorThroughput: number;
}

export interface CategoryBreakdown {
  category: string;
  count: number;
  percentage: number;
  color: string;
}

export interface AlertConfig {
  id: string;
  metric: string;
  threshold: number;
  condition: "above" | "below" | "spike";
  enabled: boolean;
  lastTriggered?: string;
}

export interface HealthStatus {
  service: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  lastChecked: string;
  details?: string;
}

export interface ModerationFilters {
  dateFrom?: string;
  dateTo?: string;
  severity?: Severity;
  contentType?: ContentType;
  moderator?: string;
  language?: Language;
  status?: QueueStatus;
}
