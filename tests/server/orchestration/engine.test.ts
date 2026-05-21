import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrchestrationEngine } from "@/server/orchestration/engine";

describe("OrchestrationEngine", () => {
  let engine: OrchestrationEngine;

  beforeEach(() => {
    engine = new OrchestrationEngine({
      circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 1000 },
    });
  });

  describe("execute", () => {
    it("returns success on successful operation", async () => {
      const result = await engine.execute("test", () => Promise.resolve("ok"));
      expect(result.success).toBe(true);
      expect(result.value).toBe("ok");
    });

    it("returns failure when retries exhausted", async () => {
      const result = await engine.execute(
        "test",
        () => Promise.reject(new Error("fail")),
        { retry: { maxAttempts: 2, baseDelayMs: 0 } }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("fail");
      expect(result.retryAttempts).toBe(2);
      expect(result.deadLettered).toBe(true);
    });

    it("dead-letters the failed operation with root error", async () => {
      await engine.execute(
        "process_payment",
        () => Promise.reject(new Error("timeout")),
        { retry: { maxAttempts: 1, baseDelayMs: 0 }, payload: { orderId: "123" } }
      );

      const dlq = engine.getDeadLetterQueue();
      expect(dlq.size()).toBe(1);

      const entries = dlq.getByOperation("process_payment");
      expect(entries).toHaveLength(1);
      expect(entries[0].payload).toEqual({ orderId: "123" });
      expect(entries[0].error).toBe("timeout");
    });

    it("dead-letters with root error even after retry exhaustion", async () => {
      await engine.execute(
        "op",
        () => Promise.reject(new Error("connection refused")),
        { retry: { maxAttempts: 3, baseDelayMs: 0 } }
      );

      const entries = engine.getDeadLetterQueue().getAll();
      expect(entries).toHaveLength(1);
      expect(entries[0].error).toBe("connection refused");
    });

    it("detects circuit breaker trips wrapped in retry exhaustion", async () => {
      const cb = engine.getCircuitBreaker();

      // Manually trip the circuit by recording failures
      for (let i = 0; i < 2; i++) {
        try {
          await cb.execute("stripe", () => Promise.reject(new Error("fail")));
        } catch {
          // expected
        }
      }

      expect(cb.getState("stripe")).toBe("open");

      // Now execute through the engine
      const result = await engine.execute(
        "payment",
        () => Promise.resolve("ok"),
        { circuitName: "stripe", retry: { maxAttempts: 1, baseDelayMs: 0 } }
      );

      expect(result.success).toBe(false);
      expect(result.circuitBreakerTripped).toBe(true);
    });
  });

  describe("executePipeline", () => {
    it("executes all pipeline steps", async () => {
      const result = await engine.executePipeline(
        [
          { id: "validate", execute: async (ctx: { orderId: string }) => ctx.orderId },
          { id: "charge", execute: async () => "charged" },
          { id: "confirm", execute: async () => "confirmed" },
        ],
        { orderId: "123" }
      );

      expect(result.overallStatus).toBe("completed");
      expect(result.completedSteps).toEqual(["validate", "charge", "confirm"]);
    });

    it("handles partial pipeline completion", async () => {
      const result = await engine.executePipeline(
        [
          { id: "validate", execute: async () => "ok" },
          { id: "charge", execute: async () => { throw new Error("card declined"); } },
          { id: "notify", execute: async () => "notified" },
        ],
        {}
      );

      expect(result.overallStatus).toBe("partial");
      expect(result.completedSteps).toEqual(["validate", "notify"]);
      expect(result.failedSteps).toEqual(["charge"]);
    });

    it("dead-letters failed pipeline steps", async () => {
      await engine.executePipeline(
        [
          { id: "step1", execute: async () => { throw new Error("fail"); } },
        ],
        { data: "test" }
      );

      const entries = engine.getDeadLetterQueue().getByOperation("pipeline_step:step1");
      expect(entries).toHaveLength(1);
    });

    it("compensates on failure when configured", async () => {
      const compensated: string[] = [];

      await engine.executePipeline(
        [
          {
            id: "step1",
            execute: async () => "ok1",
            compensate: async () => { compensated.push("step1"); },
          },
          {
            id: "step2",
            execute: async () => "ok2",
            compensate: async () => { compensated.push("step2"); },
          },
          { id: "step3", execute: async () => { throw new Error("fail"); } },
        ],
        {},
        { compensateOnFailure: true }
      );

      expect(compensated).toEqual(["step2", "step1"]);
    });

    it("stops on first failure when configured", async () => {
      const result = await engine.executePipeline(
        [
          { id: "step1", execute: async () => "ok" },
          { id: "step2", execute: async () => { throw new Error("fail"); } },
          { id: "step3", execute: async () => "should not reach" },
        ],
        {},
        { stopOnFirstFailure: true }
      );

      expect(result.skippedSteps).toEqual(["step3"]);
    });
  });

  describe("getHealth", () => {
    it("returns system health", async () => {
      const health = await engine.getHealth();
      expect(health).toBeDefined();
      expect(health.status).toBe("healthy");
      expect(health.timestamp).toBeGreaterThan(0);
    });
  });

  describe("registerHealthCheck", () => {
    it("registers and runs custom health checks", async () => {
      engine.registerHealthCheck({
        name: "custom",
        check: async () => ({ status: "healthy", responseTimeMs: 5 }),
      });

      const health = await engine.getHealth();
      expect(health.components).toHaveLength(1);
      expect(health.components[0].name).toBe("custom");
    });
  });
});
