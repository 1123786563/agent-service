import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeadLetterQueue, DEFAULT_DLQ_CONFIG, type DeadLetterEntry } from "@/server/orchestration/dead-letter-queue";

describe("DeadLetterQueue", () => {
  it("pushes and retrieves entries", () => {
    const dlq = new DeadLetterQueue();
    const entry = dlq.push({
      operation: "process_payment",
      payload: { orderId: "123" },
      error: new Error("timeout"),
    });

    expect(entry.id).toBeDefined();
    expect(entry.operation).toBe("process_payment");
    expect(entry.payload).toEqual({ orderId: "123" });
    expect(entry.error).toBe("timeout");
    expect(entry.retryCount).toBe(0);
  });

  it("retrieves all entries", () => {
    const dlq = new DeadLetterQueue();
    dlq.push({ operation: "op1", payload: "a", error: "err1" });
    dlq.push({ operation: "op2", payload: "b", error: "err2" });

    const entries = dlq.getAll();
    expect(entries).toHaveLength(2);
  });

  it("filters by operation", () => {
    const dlq = new DeadLetterQueue();
    dlq.push({ operation: "payment", payload: "a", error: "err" });
    dlq.push({ operation: "delivery", payload: "b", error: "err" });
    dlq.push({ operation: "payment", payload: "c", error: "err" });

    const payments = dlq.getByOperation("payment");
    expect(payments).toHaveLength(2);
  });

  it("gets entry by id", () => {
    const dlq = new DeadLetterQueue();
    const entry = dlq.push({ operation: "op", payload: "x", error: "err" });

    const found = dlq.get(entry.id);
    expect(found).toBeDefined();
    expect(found!.payload).toBe("x");
  });

  it("returns undefined for unknown id", () => {
    const dlq = new DeadLetterQueue();
    expect(dlq.get("nonexistent")).toBeUndefined();
  });

  it("removes entries", () => {
    const dlq = new DeadLetterQueue();
    const entry = dlq.push({ operation: "op", payload: "x", error: "err" });

    expect(dlq.remove(entry.id)).toBe(true);
    expect(dlq.get(entry.id)).toBeUndefined();
  });

  it("tracks retry count", () => {
    const dlq = new DeadLetterQueue();
    const entry = dlq.push({ operation: "op", payload: "x", error: "err" });

    dlq.retry(entry.id!);
    dlq.retry(entry.id!);

    const updated = dlq.get(entry.id!);
    expect(updated!.retryCount).toBe(2);
    expect(updated!.lastRetryAt).not.toBeNull();
  });

  it("enforces max size by evicting oldest", () => {
    const evicted: DeadLetterEntry[] = [];
    const dlq = new DeadLetterQueue({ maxSize: 2, ttlMs: 999_999_999, onEvict: (e) => evicted.push(e) });

    const e1 = dlq.push({ operation: "op1", payload: "a", error: "err" });
    const e2 = dlq.push({ operation: "op2", payload: "b", error: "err" });
    dlq.push({ operation: "op3", payload: "c", error: "err" });

    expect(dlq.size()).toBe(2);
    expect(evicted).toHaveLength(1);
    expect(evicted[0].id).toBe(e1.id);
  });

  it("evicts expired entries based on TTL", () => {
    vi.useFakeTimers();
    const dlq = new DeadLetterQueue({ ttlMs: 1000 });

    dlq.push({ operation: "op1", payload: "a", error: "err" });

    vi.advanceTimersByTime(500);
    dlq.push({ operation: "op2", payload: "b", error: "err" });

    expect(dlq.size()).toBe(2);

    vi.advanceTimersByTime(501);
    expect(dlq.size()).toBe(1);

    const remaining = dlq.getAll();
    expect(remaining[0].operation).toBe("op2");

    vi.useRealTimers();
  });

  it("clears all entries", () => {
    const dlq = new DeadLetterQueue();
    dlq.push({ operation: "op1", payload: "a", error: "err" });
    dlq.push({ operation: "op2", payload: "b", error: "err" });

    const count = dlq.clear();
    expect(count).toBe(2);
    expect(dlq.size()).toBe(0);
  });

  it("stores metadata", () => {
    const dlq = new DeadLetterQueue();
    const entry = dlq.push({
      operation: "op",
      payload: "x",
      error: "err",
      metadata: { orderId: "123", retryPhase: "final" },
    });

    expect(entry.metadata).toEqual({ orderId: "123", retryPhase: "final" });
  });

  it("stores initial retry count", () => {
    const dlq = new DeadLetterQueue();
    const entry = dlq.push({ operation: "op", payload: "x", error: "err", retryCount: 5 });

    expect(entry.retryCount).toBe(5);
  });

  it("converts non-Error errors to string", () => {
    const dlq = new DeadLetterQueue();
    const entry = dlq.push({ operation: "op", payload: "x", error: "string error" });

    expect(entry.error).toBe("string error");
  });
});
