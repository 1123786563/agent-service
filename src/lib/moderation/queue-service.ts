import type { QueueItem, ReviewerWorkload } from "./types";

export interface QueueStore {
  createItem(data: {
    contentType: "TEXT" | "IMAGE";
    contentRef: string;
    contentSnippet?: string;
    priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    toxicityScore?: number;
    flaggedPhrases: string[];
    categories: string[];
    language?: string;
    status: "PENDING";
  }): Promise<QueueItem>;
  findById(id: string): Promise<QueueItem | null>;
  findPending(limit: number, offset: number): Promise<QueueItem[]>;
  findByAssignedReviewer(reviewerId: string, status?: string): Promise<QueueItem[]>;
  updateItem(id: string, data: Partial<QueueItem>): Promise<QueueItem>;
  getReviewerWorkloads(): Promise<ReviewerWorkload[]>;
  countByStatus(status: string): Promise<number>;
}

export function determineAutoPriority(
  toxicityScore: number,
  categories: string[]
): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  if (categories.includes("hate_speech") || categories.includes("threat")) return "CRITICAL";
  if (toxicityScore >= 0.7) return "CRITICAL";
  if (toxicityScore >= 0.5) return "HIGH";
  if (toxicityScore >= 0.3) return "MEDIUM";
  return "LOW";
}

export async function addToQueue(
  data: {
    contentType: "TEXT" | "IMAGE";
    contentRef: string;
    contentSnippet?: string;
    toxicityScore?: number;
    flaggedPhrases: string[];
    categories: string[];
    language?: string;
  },
  store: QueueStore
): Promise<QueueItem> {
  const priority = determineAutoPriority(data.toxicityScore ?? 0, data.categories);

  return store.createItem({
    contentType: data.contentType,
    contentRef: data.contentRef,
    contentSnippet: data.contentSnippet,
    priority,
    toxicityScore: data.toxicityScore,
    flaggedPhrases: data.flaggedPhrases,
    categories: data.categories,
    language: data.language,
    status: "PENDING",
  });
}

export async function assignReviewer(
  itemId: string,
  store: QueueStore
): Promise<QueueItem> {
  const item = await store.findById(itemId);
  if (!item) throw new Error("Queue item not found");
  if (item.status !== "PENDING") throw new Error(`Cannot assign reviewer: item status is ${item.status}`);

  const workloads = await store.getReviewerWorkloads();
  if (workloads.length === 0) throw new Error("No reviewers available");

  // Pick reviewer with lowest total workload
  const sorted = [...workloads].sort(
    (a, b) => (a.pendingCount + a.inReviewCount) - (b.pendingCount + b.inReviewCount)
  );
  const reviewer = sorted[0];

  return store.updateItem(itemId, {
    assignedToId: reviewer.reviewerId,
    status: "ASSIGNED",
  });
}

export async function resolveQueueItem(
  itemId: string,
  resolution: string,
  store: QueueStore
): Promise<QueueItem> {
  const item = await store.findById(itemId);
  if (!item) throw new Error("Queue item not found");
  if (item.status !== "ASSIGNED" && item.status !== "IN_REVIEW") {
    throw new Error(`Cannot resolve: item status is ${item.status}`);
  }

  return store.updateItem(itemId, {
    status: "RESOLVED",
    resolution,
    resolvedAt: new Date(),
  });
}

export async function escalateQueueItem(
  itemId: string,
  store: QueueStore
): Promise<QueueItem> {
  const item = await store.findById(itemId);
  if (!item) throw new Error("Queue item not found");

  return store.updateItem(itemId, {
    status: "ESCALATED",
    priority: "CRITICAL",
    escalatedAt: new Date(),
  });
}

export function getEscalationDeadline(priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"): Date | null {
  const now = new Date();
  switch (priority) {
    case "CRITICAL":
      return new Date(now.getTime());
    case "HIGH":
      return new Date(now.getTime() + 60 * 60 * 1000); // 1 hour
    case "MEDIUM":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    default:
      return null;
  }
}
