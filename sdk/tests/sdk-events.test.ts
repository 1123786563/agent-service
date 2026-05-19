import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ModerationEventEmitter } from "../src/events";

describe("ModerationEventEmitter", () => {
  let emitter: ModerationEventEmitter;

  beforeEach(() => {
    emitter = new ModerationEventEmitter({
      apiKey: "mk_test",
      baseUrl: "http://localhost:3000/api/v1",
    });
  });

  afterEach(() => {
    emitter.disconnect();
  });

  describe("event listeners", () => {
    it("registers and calls event listeners", () => {
      const listener = vi.fn();
      emitter.on("item_flagged", listener);

      const event = {
        id: "evt_1",
        type: "item_flagged" as const,
        timestamp: new Date().toISOString(),
        data: { itemId: "item1" },
      };

      (emitter as any).emit("item_flagged", event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it("supports wildcard listeners via onAny", () => {
      const listener = vi.fn();
      emitter.onAny(listener);

      const event = {
        id: "evt_1",
        type: "item_resolved" as const,
        timestamp: new Date().toISOString(),
        data: {},
      };

      (emitter as any).emit("item_resolved", event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it("unsubscribes when cleanup function is called", () => {
      const listener = vi.fn();
      const unsub = emitter.on("item_flagged", listener);

      unsub();
      (emitter as any).emit("item_flagged", {
        id: "evt_1",
        type: "item_flagged",
        timestamp: "",
        data: {},
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it("handles errors in listeners without crashing", () => {
      const errorListener = vi.fn();
      emitter.onError(errorListener);

      const badListener = () => { throw new Error("oops"); };
      emitter.on("item_flagged", badListener);

      const event = {
        id: "evt_1",
        type: "item_flagged" as const,
        timestamp: "",
        data: {},
      };

      (emitter as any).emit("item_flagged", event);
      expect(errorListener).toHaveBeenCalled();
    });
  });

  describe("error listeners", () => {
    it("registers and calls error listeners", () => {
      const errorListener = vi.fn();
      emitter.onError(errorListener);

      (emitter as any).notifyError(new Error("test error"));
      expect(errorListener).toHaveBeenCalled();
    });

    it("unsubscribes error listener via cleanup", () => {
      const errorListener = vi.fn();
      const unsub = emitter.onError(errorListener);

      unsub();
      (emitter as any).notifyError(new Error("test error"));
      expect(errorListener).not.toHaveBeenCalled();
    });
  });

  describe("lifecycle", () => {
    it("disconnect closes any existing connection", () => {
      emitter.disconnect();
      expect(emitter.connected).toBe(false);
    });

    it("throws if connect called after disconnect on closed emitter", () => {
      emitter.disconnect();
      expect(() => emitter.connect()).toThrow("EventEmitter has been closed");
    });
  });
});
