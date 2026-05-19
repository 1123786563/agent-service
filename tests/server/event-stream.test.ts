import { describe, expect, it } from "vitest";
import {
  subscribeToModerationEvents,
  emitModerationEvent,
  getRecentEvents,
  getSubscriberCount,
  formatSSE,
} from "@/lib/moderation/event-stream";

describe("Event Stream", () => {
  it("emits events to subscribers", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeToModerationEvents((event) => {
      received.push(event);
    });

    emitModerationEvent({
      type: "item_flagged",
      data: { itemId: "test-123" },
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      type: "item_flagged",
      data: { itemId: "test-123" },
    });
    expect((received[0] as any).id).toBeDefined();
    expect((received[0] as any).timestamp).toBeDefined();

    unsubscribe();
  });

  it("stops receiving events after unsubscribe", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeToModerationEvents((event) => {
      received.push(event);
    });

    emitModerationEvent({ type: "item_flagged", data: {} });
    unsubscribe();
    emitModerationEvent({ type: "item_resolved", data: {} });

    expect(received).toHaveLength(1);
  });

  it("multiple subscribers receive events", () => {
    const received1: unknown[] = [];
    const received2: unknown[] = [];

    const unsub1 = subscribeToModerationEvents((e) => received1.push(e));
    const unsub2 = subscribeToModerationEvents((e) => received2.push(e));

    emitModerationEvent({ type: "item_escalated", data: {} });

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);

    unsub1();
    unsub2();
  });

  it("stores recent events in buffer", () => {
    emitModerationEvent({ type: "item_assigned", data: { itemId: "buffer-test" } });
    const recent = getRecentEvents(10);
    expect(recent.length).toBeGreaterThanOrEqual(1);
    const last = recent[recent.length - 1];
    expect(last.type).toBe("item_assigned");
    expect(last.data).toEqual({ itemId: "buffer-test" });
  });

  it("respects limit for recent events", () => {
    for (let i = 0; i < 5; i++) {
      emitModerationEvent({ type: "item_flagged", data: { index: i } });
    }
    const recent = getRecentEvents(2);
    expect(recent.length).toBeLessThanOrEqual(2);
  });

  it("tracks subscriber count", () => {
    const unsub = subscribeToModerationEvents(() => {});
    const countBefore = getSubscriberCount();
    expect(countBefore).toBeGreaterThanOrEqual(1);
    unsub();
  });
});

describe("formatSSE", () => {
  it("formats event as SSE string", () => {
    const event = {
      id: "evt_123",
      type: "item_flagged" as const,
      timestamp: "2026-05-19T00:00:00.000Z",
      data: { itemId: "test" },
    };

    const sse = formatSSE(event);
    expect(sse).toContain("event: item_flagged");
    expect(sse).toContain(`data: ${JSON.stringify(event)}`);
    expect(sse).toContain("id: evt_123");
    expect(sse).toMatch(/\n\n$/);
  });
});
