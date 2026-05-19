import { describe, expect, it } from "vitest";
import {
  InMemoryCounterStore,
  COUNTER_KEYS,
  incrementFlaggedCounter,
  incrementResolvedCounter,
} from "@/lib/moderation/realtime-counters";

describe("InMemoryCounterStore", () => {
  it("increments a counter from zero", async () => {
    const store = new InMemoryCounterStore();
    const result = await store.increment("test");
    expect(result).toBe(1);
  });

  it("increments a counter by a custom value", async () => {
    const store = new InMemoryCounterStore();
    const result = await store.increment("test", 5);
    expect(result).toBe(5);
  });

  it("decrements a counter", async () => {
    const store = new InMemoryCounterStore();
    await store.set("test", 10);
    const result = await store.decrement("test", 3);
    expect(result).toBe(7);
  });

  it("returns 0 for non-existent key", async () => {
    const store = new InMemoryCounterStore();
    const result = await store.get("missing");
    expect(result).toBe(0);
  });

  it("sets a counter value", async () => {
    const store = new InMemoryCounterStore();
    await store.set("test", 42);
    const result = await store.get("test");
    expect(result).toBe(42);
  });

  it("retrieves multiple counters at once", async () => {
    const store = new InMemoryCounterStore();
    await store.set("a", 1);
    await store.set("b", 2);
    const result = await store.getMulti(["a", "b", "c"]);
    expect(result).toEqual({ a: 1, b: 2, c: 0 });
  });

  it("expires a key after TTL", async () => {
    const store = new InMemoryCounterStore();
    await store.set("test", 100);
    await store.expire("test", -1); // already expired
    const result = await store.get("test");
    expect(result).toBe(0);
  });

  it("does not expire a key before TTL", async () => {
    const store = new InMemoryCounterStore();
    await store.set("test", 100);
    await store.expire("test", 600); // 10 minutes
    const result = await store.get("test");
    expect(result).toBe(100);
  });

  it("resets expired counter on increment", async () => {
    const store = new InMemoryCounterStore();
    await store.set("test", 100);
    await store.expire("test", -1); // already expired
    const result = await store.increment("test", 1);
    expect(result).toBe(1);
  });
});

describe("incrementFlaggedCounter", () => {
  it("increments total and text counters for TEXT content", async () => {
    const store = new InMemoryCounterStore();
    await incrementFlaggedCounter(store, "TEXT");

    expect(await store.get(COUNTER_KEYS.flaggedTotal)).toBe(1);
    expect(await store.get(COUNTER_KEYS.flaggedText)).toBe(1);
    expect(await store.get(COUNTER_KEYS.flaggedImage)).toBe(0);
  });

  it("increments total and image counters for IMAGE content", async () => {
    const store = new InMemoryCounterStore();
    await incrementFlaggedCounter(store, "IMAGE");

    expect(await store.get(COUNTER_KEYS.flaggedTotal)).toBe(1);
    expect(await store.get(COUNTER_KEYS.flaggedImage)).toBe(1);
    expect(await store.get(COUNTER_KEYS.flaggedText)).toBe(0);
  });
});

describe("incrementResolvedCounter", () => {
  it("increments resolved counter", async () => {
    const store = new InMemoryCounterStore();
    await incrementResolvedCounter(store, false);
    expect(await store.get(COUNTER_KEYS.resolvedTotal)).toBe(1);
    expect(await store.get(COUNTER_KEYS.falsePositives)).toBe(0);
  });

  it("increments false positive counter when flagged", async () => {
    const store = new InMemoryCounterStore();
    await incrementResolvedCounter(store, true);
    expect(await store.get(COUNTER_KEYS.resolvedTotal)).toBe(1);
    expect(await store.get(COUNTER_KEYS.falsePositives)).toBe(1);
  });
});
