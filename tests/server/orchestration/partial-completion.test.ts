import { describe, it, expect } from "vitest";
import { PartialCompletionHandler, type Step } from "@/server/orchestration/partial-completion";

describe("PartialCompletionHandler", () => {
  it("completes all steps successfully", async () => {
    const steps: Step<{ value: number }, unknown>[] = [
      { id: "step1", execute: async (ctx) => ctx.value + 1 },
      { id: "step2", execute: async (ctx) => ctx.value + 2 },
      { id: "step3", execute: async (ctx) => ctx.value + 3 },
    ];

    const handler = new PartialCompletionHandler(steps);
    const result = await handler.execute({ value: 10 });

    expect(result.overallStatus).toBe("completed");
    expect(result.completedSteps).toEqual(["step1", "step2", "step3"]);
    expect(result.failedSteps).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("handles partial completion when some steps fail", async () => {
    const steps: Step<unknown, unknown>[] = [
      { id: "step1", execute: async () => "ok1" },
      { id: "step2", execute: async () => { throw new Error("step2 failed"); } },
      { id: "step3", execute: async () => "ok3" },
    ];

    const handler = new PartialCompletionHandler(steps);
    const result = await handler.execute({});

    expect(result.overallStatus).toBe("partial");
    expect(result.completedSteps).toEqual(["step1", "step3"]);
    expect(result.failedSteps).toEqual(["step2"]);
    expect(result.errors).toEqual([{ stepId: "step2", error: "step2 failed" }]);
  });

  it("returns failed when all steps fail", async () => {
    const steps: Step<unknown, unknown>[] = [
      { id: "step1", execute: async () => { throw new Error("fail1"); } },
      { id: "step2", execute: async () => { throw new Error("fail2"); } },
    ];

    const handler = new PartialCompletionHandler(steps);
    const result = await handler.execute({});

    expect(result.overallStatus).toBe("failed");
    expect(result.failedSteps).toEqual(["step1", "step2"]);
    expect(result.completedSteps).toEqual([]);
  });

  it("skips remaining steps on failure with stopOnFirstFailure", async () => {
    const steps: Step<unknown, unknown>[] = [
      { id: "step1", execute: async () => "ok" },
      { id: "step2", execute: async () => { throw new Error("fail"); } },
      { id: "step3", execute: async () => "should not reach" },
    ];

    const handler = new PartialCompletionHandler(steps, { stopOnFirstFailure: true });
    const result = await handler.execute({});

    expect(result.overallStatus).toBe("partial");
    expect(result.completedSteps).toEqual(["step1"]);
    expect(result.failedSteps).toEqual(["step2"]);
    expect(result.skippedSteps).toEqual(["step3"]);
  });

  it("does not skip optional steps after failure with stopOnFirstFailure", async () => {
    const steps: Step<unknown, unknown>[] = [
      { id: "step1", execute: async () => { throw new Error("fail"); } },
      { id: "step2", execute: async () => "optional ok", required: false },
    ];

    const handler = new PartialCompletionHandler(steps, { stopOnFirstFailure: true });
    const result = await handler.execute({});

    expect(result.completedSteps).toContain("step2");
    expect(result.skippedSteps).toEqual([]);
  });

  it("records step duration", async () => {
    const steps: Step<unknown, unknown>[] = [
      { id: "step1", execute: async () => "ok" },
    ];

    const handler = new PartialCompletionHandler(steps);
    const result = await handler.execute({});

    expect(result.steps[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  describe("compensate", () => {
    it("runs compensations in reverse order", async () => {
      const compensateOrder: string[] = [];

      const steps: Step<unknown, unknown>[] = [
        {
          id: "step1",
          execute: async () => "ok1",
          compensate: async () => { compensateOrder.push("step1"); },
        },
        {
          id: "step2",
          execute: async () => "ok2",
          compensate: async () => { compensateOrder.push("step2"); },
        },
        {
          id: "step3",
          execute: async () => { throw new Error("fail"); },
        },
      ];

      const handler = new PartialCompletionHandler(steps);
      const result = await handler.execute({});

      const completedSteps = result.steps.filter((s) => s.status === "completed");
      await handler.compensate({}, completedSteps);

      expect(compensateOrder).toEqual(["step2", "step1"]);
    });

    it("continues compensating even when a compensation fails", async () => {
      const compensateOrder: string[] = [];

      const steps: Step<unknown, unknown>[] = [
        {
          id: "step1",
          execute: async () => "ok1",
          compensate: async () => { compensateOrder.push("step1"); },
        },
        {
          id: "step2",
          execute: async () => "ok2",
          compensate: async () => { throw new Error("compensation failed"); },
        },
      ];

      const handler = new PartialCompletionHandler(steps);
      const result = await handler.execute({});

      const completedSteps = result.steps.filter((s) => s.status === "completed");
      const compensationResults = await handler.compensate({}, completedSteps);

      expect(compensateOrder).toEqual(["step1"]);
      expect(compensationResults).toHaveLength(2);
      expect(compensationResults.find((r) => r.stepId === "step2")?.error).toBe("compensation failed");
      expect(compensationResults.find((r) => r.stepId === "step1")?.error).toBeUndefined();
    });
  });
});
