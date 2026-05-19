import { describe, expect, it, vi } from "vitest";

// Mock prisma and event stream
vi.mock("@/server/db", () => ({
  prisma: {
    webhookEndpoint: {
      create: vi.fn().mockResolvedValue({
        id: "wh1",
        url: "https://example.com/webhook",
        secret: "whsec_test",
        events: ["ITEM_FLAGGED"],
        isActive: true,
        createdAt: new Date(),
      }),
      findMany: vi.fn().mockResolvedValue([
        { id: "wh1", url: "https://example.com/hook", events: ["ITEM_FLAGGED"], isActive: true, _count: { deliveries: 3 } },
      ]),
      findFirst: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({ id: "wh1" }),
    },
    webhookDelivery: {
      create: vi.fn().mockResolvedValue({ id: "del1" }),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({ id: "del1" }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("@/lib/moderation/api-key-auth", () => ({
  signWebhookPayload: vi.fn().mockReturnValue("abc123sig"),
}));

vi.mock("@/lib/moderation/event-stream", () => ({
  emitModerationEvent: vi.fn(),
}));

import { registerWebhook, listWebhooks, deleteWebhook, deliverWebhooks, processRetryQueue } from "@/lib/moderation/webhook-service";
import { prisma } from "@/server/db";

describe("registerWebhook", () => {
  it("creates a webhook endpoint", async () => {
    const result = await registerWebhook("key1", {
      url: "https://example.com/webhook",
      events: ["ITEM_FLAGGED"],
    });

    expect(result.url).toBe("https://example.com/webhook");
    expect(result.events).toEqual(["ITEM_FLAGGED"]);
    expect(result.secret).toMatch(/^whsec_/);
    expect(prisma.webhookEndpoint.create).toHaveBeenCalled();
  });
});

describe("listWebhooks", () => {
  it("returns webhooks for an API key", async () => {
    const webhooks = await listWebhooks("key1");
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0].id).toBe("wh1");
  });
});

describe("deleteWebhook", () => {
  it("deletes a webhook owned by the API key", async () => {
    vi.mocked(prisma.webhookEndpoint.findFirst).mockResolvedValueOnce({ id: "wh1" } as any);
    const result = await deleteWebhook("wh1", "key1");
    expect(result).toBe(true);
  });

  it("throws when webhook not found", async () => {
    vi.mocked(prisma.webhookEndpoint.findFirst).mockResolvedValueOnce(null);
    await expect(deleteWebhook("wh_missing", "key1")).rejects.toThrow("Webhook not found");
  });
});

describe("deliverWebhooks", () => {
  it("skips when no endpoints match event", async () => {
    vi.mocked(prisma.webhookEndpoint.findMany).mockResolvedValueOnce([]);
    await deliverWebhooks("ITEM_FLAGGED", { itemId: "item1" });
    expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
  });
});

describe("processRetryQueue", () => {
  it("returns 0 when no pending deliveries", async () => {
    const result = await processRetryQueue();
    expect(result).toBe(0);
  });
});
