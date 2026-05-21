export type StepResult<T = unknown> = {
  stepId: string;
  status: "completed" | "failed" | "skipped";
  result?: T;
  error?: string;
  durationMs: number;
};

export type PartialCompletionResult = {
  overallStatus: "completed" | "partial" | "failed";
  steps: StepResult[];
  completedSteps: string[];
  failedSteps: string[];
  skippedSteps: string[];
  errors: Array<{ stepId: string; error: string }>;
};

export type Step<TInput, TOutput> = {
  id: string;
  execute: (input: TInput) => Promise<TOutput>;
  compensate?: (input: TInput, result: TOutput) => Promise<void>;
  required?: boolean;
};

export class PartialCompletionHandler<TInput = unknown> {
  private steps: Step<TInput, unknown>[];
  private stopOnFirstFailure: boolean;

  constructor(steps: Step<TInput, unknown>[], options?: { stopOnFirstFailure?: boolean }) {
    this.steps = steps;
    this.stopOnFirstFailure = options?.stopOnFirstFailure ?? false;
  }

  async execute(input: TInput): Promise<PartialCompletionResult> {
    const results: StepResult[] = [];
    const completedSteps: string[] = [];
    const failedSteps: string[] = [];
    const skippedSteps: string[] = [];
    const errors: Array<{ stepId: string; error: string }> = [];

    for (const step of this.steps) {
      const start = Date.now();

      // Skip steps whose required prerequisites failed (if they require prior steps)
      if (this.stopOnFirstFailure && failedSteps.length > 0 && step.required !== false) {
        const durationMs = Date.now() - start;
        results.push({ stepId: step.id, status: "skipped", durationMs });
        skippedSteps.push(step.id);
        continue;
      }

      try {
        const result = await step.execute(input);
        const durationMs = Date.now() - start;
        results.push({ stepId: step.id, status: "completed", result, durationMs });
        completedSteps.push(step.id);
      } catch (error: unknown) {
        const durationMs = Date.now() - start;
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({ stepId: step.id, status: "failed", error: errorMsg, durationMs });
        failedSteps.push(step.id);
        errors.push({ stepId: step.id, error: errorMsg });
      }
    }

    const overallStatus: PartialCompletionResult["overallStatus"] =
      failedSteps.length === 0
        ? "completed"
        : completedSteps.length === 0
          ? "failed"
          : "partial";

    return {
      overallStatus,
      steps: results,
      completedSteps,
      failedSteps,
      skippedSteps,
      errors,
    };
  }

  async compensate(
    input: TInput,
    completedResults: StepResult[]
  ): Promise<Array<{ stepId: string; error?: string }>> {
    const compensationResults: Array<{ stepId: string; error?: string }> = [];

    // Compensate in reverse order
    const completed = completedResults.filter((r) => r.status === "completed").reverse();

    for (const result of completed) {
      const step = this.steps.find((s) => s.id === result.stepId);
      if (!step?.compensate) continue;

      try {
        await step.compensate(input, result.result);
        compensationResults.push({ stepId: step.id });
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        compensationResults.push({ stepId: step.id, error: errorMsg });
      }
    }

    return compensationResults;
  }
}
