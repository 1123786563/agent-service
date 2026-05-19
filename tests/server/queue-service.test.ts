import { describe, expect, it, vi } from "vitest";
import {
  determineAutoPriority,
  addToQueue,
  assignReviewer,
  resolveQueueItem,
  escalateQueueItem,
  getEscalationDeadline,
} from "@/lib/moderation/queue-service";
import type { QueueStore } from "@/lib/moderation/queue-service";

function mockStore(overrides: Partial<QueueStore> = {}): QueueStore {
  return {
    createItem: vi.fn().mockResolvedValue({ id: "item-1", status: "PENDING" }),
    findById: vi.fn().mockResolvedValue(null),
    findPending: vi.fn().mockResolvedValue([]),
    findByAssignedReviewer: vi.fn().mockResolvedValue([]),
    updateItem: vi.fn().mockResolvedValue({ id: "item-1" }),
    getReviewerWorkloads: vi.fn().mockResolvedValue([]),
    countByStatus: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe("determineAutoPriority", () => {
  it("returns CRITICAL for hate speech category", () => {
    expect(determineAutoPriority(0, ["hate_speech"])).toBe("CRITICAL");
  });

  it("returns CRITICAL for threat category", () => {
    expect(determineAutoPriority(0, ["threat"])).toBe("CRITICAL");
  });

  it("returns CRITICAL for high toxicity score", () => {
    expect(determineAutoPriority(0.8, ["profanity"])).toBe("CRITICAL");
  });

  it("returns HIGH for medium-high toxicity", () => {
    expect(determineAutoPriority(0.5, ["profanity"])).toBe("HIGH");
  });

  it("returns MEDIUM for moderate toxicity", () => {
    expect(determineAutoPriority(0.3, ["spam"])).toBe("MEDIUM");
  });

  it("returns LOW for low toxicity", () => {
    expect(determineAutoPriority(0.1, ["spam"])).toBe("LOW");
  });
});

describe("addToQueue", () => {
  it("creates a queue item with auto-determined priority", async () => {
    const store = mockStore();

    await addToQueue({
      contentType: "TEXT",
      contentRef: "text:123",
      contentSnippet: "Some flagged text",
      toxicityScore: 0.7,
      flaggedPhrases: ["bad word"],
      categories: ["profanity"],
      language: "en",
    }, store);

    expect(store.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "TEXT",
        contentRef: "text:123",
        priority: "CRITICAL",
        status: "PENDING",
        toxicityScore: 0.7,
        flaggedPhrases: ["bad word"],
      })
    );
  });
});

describe("assignReviewer", () => {
  it("assigns the reviewer with lowest workload", async () => {
    const store = mockStore({
      findById: vi.fn().mockResolvedValue({ id: "item-1", status: "PENDING" }),
      getReviewerWorkloads: vi.fn().mockResolvedValue([
        { reviewerId: "r1", pendingCount: 5, inReviewCount: 2 },
        { reviewerId: "r2", pendingCount: 1, inReviewCount: 0 },
      ]),
      updateItem: vi.fn().mockResolvedValue({ id: "item-1", assignedToId: "r2", status: "ASSIGNED" }),
    });

    const result = await assignReviewer("item-1", store);

    expect(store.updateItem).toHaveBeenCalledWith("item-1", {
      assignedToId: "r2",
      status: "ASSIGNED",
    });
    expect(result.assignedToId).toBe("r2");
  });

  it("throws when item not found", async () => {
    const store = mockStore({ findById: vi.fn().mockResolvedValue(null) });
    await expect(assignReviewer("missing", store)).rejects.toThrow("Queue item not found");
  });

  it("throws when item status is not PENDING", async () => {
    const store = mockStore({
      findById: vi.fn().mockResolvedValue({ id: "item-1", status: "RESOLVED" }),
    });
    await expect(assignReviewer("item-1", store)).rejects.toThrow("Cannot assign reviewer");
  });

  it("throws when no reviewers available", async () => {
    const store = mockStore({
      findById: vi.fn().mockResolvedValue({ id: "item-1", status: "PENDING" }),
      getReviewerWorkloads: vi.fn().mockResolvedValue([]),
    });
    await expect(assignReviewer("item-1", store)).rejects.toThrow("No reviewers available");
  });
});

describe("resolveQueueItem", () => {
  it("resolves an assigned item", async () => {
    const store = mockStore({
      findById: vi.fn().mockResolvedValue({ id: "item-1", status: "ASSIGNED" }),
      updateItem: vi.fn().mockResolvedValue({ id: "item-1", status: "RESOLVED" }),
    });

    const result = await resolveQueueItem("item-1", "approved", store);
    expect(result.status).toBe("RESOLVED");
    expect(store.updateItem).toHaveBeenCalledWith("item-1", expect.objectContaining({
      status: "RESOLVED",
      resolution: "approved",
    }));
  });

  it("throws when item not in correct state", async () => {
    const store = mockStore({
      findById: vi.fn().mockResolvedValue({ id: "item-1", status: "PENDING" }),
    });
    await expect(resolveQueueItem("item-1", "approved", store)).rejects.toThrow("Cannot resolve");
  });
});

describe("escalateQueueItem", () => {
  it("escalates an item to CRITICAL", async () => {
    const store = mockStore({
      findById: vi.fn().mockResolvedValue({ id: "item-1", status: "PENDING" }),
      updateItem: vi.fn().mockResolvedValue({ id: "item-1", status: "ESCALATED", priority: "CRITICAL" }),
    });

    const result = await escalateQueueItem("item-1", store);
    expect(store.updateItem).toHaveBeenCalledWith("item-1", expect.objectContaining({
      status: "ESCALATED",
      priority: "CRITICAL",
    }));
  });
});

describe("getEscalationDeadline", () => {
  it("returns immediate deadline for CRITICAL", () => {
    const deadline = getEscalationDeadline("CRITICAL");
    expect(deadline).not.toBeNull();
  });

  it("returns 1 hour deadline for HIGH", () => {
    const deadline = getEscalationDeadline("HIGH")!;
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    expect(deadline.getTime()).toBeLessThanOrEqual(oneHourFromNow.getTime());
  });

  it("returns 24 hour deadline for MEDIUM", () => {
    const deadline = getEscalationDeadline("MEDIUM")!;
    const twentyFourHoursFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(deadline.getTime()).toBeLessThanOrEqual(twentyFourHoursFromNow.getTime());
  });

  it("returns null for LOW", () => {
    expect(getEscalationDeadline("LOW")).toBeNull();
  });
});
