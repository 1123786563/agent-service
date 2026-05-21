import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HealthCheckRegistry, createDatabaseHealthCheck, createExternalServiceHealthCheck } from "@/server/orchestration/health-check";

describe("HealthCheckRegistry", () => {
  it("returns healthy when no checks registered", async () => {
    const registry = new HealthCheckRegistry();
    const health = await registry.runChecks();

    expect(health.status).toBe("healthy");
    expect(health.components).toEqual([]);
    expect(health.deadLetterQueueSize).toBe(0);
  });

  it("reports healthy when all checks pass", async () => {
    const registry = new HealthCheckRegistry();
    registry.register({
      name: "db",
      check: async () => ({ status: "healthy", responseTimeMs: 10 }),
    });
    registry.register({
      name: "cache",
      check: async () => ({ status: "healthy", responseTimeMs: 5 }),
    });

    const health = await registry.runChecks();

    expect(health.status).toBe("healthy");
    expect(health.components).toHaveLength(2);
    expect(health.components[0].name).toBe("db");
    expect(health.components[0].status).toBe("healthy");
  });

  it("reports degraded when any check is degraded", async () => {
    const registry = new HealthCheckRegistry();
    registry.register({
      name: "db",
      check: async () => ({ status: "healthy", responseTimeMs: 10 }),
    });
    registry.register({
      name: "external_api",
      check: async () => ({ status: "degraded", responseTimeMs: 2000 }),
    });

    const health = await registry.runChecks();

    expect(health.status).toBe("degraded");
  });

  it("reports unhealthy when any check fails", async () => {
    const registry = new HealthCheckRegistry();
    registry.register({
      name: "db",
      check: async () => ({ status: "healthy", responseTimeMs: 10 }),
    });
    registry.register({
      name: "payment",
      check: async () => ({ status: "unhealthy", responseTimeMs: 5000, error: "connection refused" }),
    });

    const health = await registry.runChecks();

    expect(health.status).toBe("unhealthy");
    expect(health.components.find((c) => c.name === "payment")?.error).toBe("connection refused");
  });

  it("times out slow checks", async () => {
    const registry = new HealthCheckRegistry({ timeoutMs: 100 });
    registry.register({
      name: "slow",
      check: async () => new Promise((resolve) => setTimeout(() => resolve({ status: "healthy", responseTimeMs: 5000 }), 5000)),
    });

    const health = await registry.runChecks();

    expect(health.status).toBe("unhealthy");
    expect(health.components[0].error).toContain("timed out");
  });

  it("catches exceptions from checks", async () => {
    const registry = new HealthCheckRegistry();
    registry.register({
      name: "failing",
      check: async () => { throw new Error("boom"); },
    });

    const health = await registry.runChecks();

    expect(health.status).toBe("unhealthy");
    expect(health.components[0].error).toBe("boom");
  });

  it("tracks uptime", async () => {
    const registry = new HealthCheckRegistry();
    const health = await registry.runChecks();

    expect(health.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it("stores last result", async () => {
    const registry = new HealthCheckRegistry();
    await registry.runChecks();
    expect(registry.getLastResult()).not.toBeNull();
    expect(registry.getLastResult()!.status).toBe("healthy");
  });

  it("reports dead letter queue size", async () => {
    const registry = new HealthCheckRegistry();
    registry.getDeadLetterQueue().push({ operation: "test", payload: "x", error: "err" });
    registry.getDeadLetterQueue().push({ operation: "test", payload: "y", error: "err" });

    const health = await registry.runChecks();
    expect(health.deadLetterQueueSize).toBe(2);
  });

  describe("periodic checks", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("runs periodic checks at interval", async () => {
      const registry = new HealthCheckRegistry({ checkIntervalMs: 1000 });
      let checkCount = 0;
      registry.register({
        name: "test",
        check: async () => { checkCount++; return { status: "healthy", responseTimeMs: 1 }; },
      });

      const stop = registry.startPeriodicChecks();
      expect(checkCount).toBe(0);

      await vi.advanceTimersByTimeAsync(1000);
      expect(checkCount).toBe(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(checkCount).toBe(2);

      stop();
      await vi.advanceTimersByTimeAsync(1000);
      expect(checkCount).toBe(2);
    });
  });
});

describe("createDatabaseHealthCheck", () => {
  it("returns healthy for working database", async () => {
    const db = { $queryRaw: async () => null };
    const check = createDatabaseHealthCheck(db);
    const result = await check.check();

    expect(result.status).toBe("healthy");
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns unhealthy for failing database", async () => {
    const db = { $queryRaw: async () => { throw new Error("connection lost"); } };
    const check = createDatabaseHealthCheck(db);
    const result = await check.check();

    expect(result.status).toBe("unhealthy");
    expect(result.error).toBe("connection lost");
  });
});

describe("createExternalServiceHealthCheck", () => {
  it("returns healthy for passing custom check", async () => {
    const check = createExternalServiceHealthCheck("api", async () => {});
    const result = await check.check();

    expect(result.status).toBe("healthy");
  });

  it("returns unhealthy for failing custom check", async () => {
    const check = createExternalServiceHealthCheck("api", async () => { throw new Error("down"); });
    const result = await check.check();

    expect(result.status).toBe("unhealthy");
    expect(result.error).toBe("down");
  });
});
