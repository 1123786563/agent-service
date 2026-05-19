export type Severity = "low" | "medium" | "high" | "critical";

export type ModerationRecommendation = "approve" | "flag" | "reject";

export type ConfidenceLevel = "low" | "medium" | "high";

export type ImageSafetyCategory = "safe" | "suspicious" | "unsafe";

export type DetectedLanguage = "en" | "zh" | "ja" | "ko" | "unknown";

export interface TextAnalysisResult {
  toxicityScore: number;
  flaggedPhrases: FlaggedPhrase[];
  recommendation: ModerationRecommendation;
  confidence: ConfidenceLevel;
  detectedLanguage: DetectedLanguage;
  processingTimeMs: number;
}

export interface FlaggedPhrase {
  phrase: string;
  category: string;
  severity: Severity;
  startIndex: number;
  endIndex: number;
}

export interface ImageAnalysisResult {
  safetyCategory: ImageSafetyCategory;
  detectedObjects: DetectedObject[];
  confidence: ConfidenceLevel;
  processingTimeMs: number;
}

export interface DetectedObject {
  label: string;
  confidence: number;
  category: string;
  flagged: boolean;
}

export interface BatchImageAnalysisResult {
  results: ImageAnalysisResult[];
  totalProcessingTimeMs: number;
  safeCount: number;
  suspiciousCount: number;
  unsafeCount: number;
}

export interface QueueItem {
  id: string;
  contentType: "TEXT" | "IMAGE";
  contentRef: string;
  contentSnippet?: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "PENDING" | "ASSIGNED" | "IN_REVIEW" | "RESOLVED" | "ESCALATED";
  toxicityScore?: number;
  flaggedPhrases: string[];
  categories: string[];
  language?: string;
  assignedToId?: string;
  escalatedAt?: Date;
  resolvedAt?: Date;
  resolution?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewerWorkload {
  reviewerId: string;
  pendingCount: number;
  inReviewCount: number;
}
