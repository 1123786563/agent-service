import { CircuitBreaker, type CircuitBreakerConfig, CircuitOpenError } from "./circuit-breaker";
import { DeadLetterQueue, type DeadLetterQueueConfig } from "./dead-letter-queue";
import { HealthCheckRegistry, type HealthCheckConfig, type SystemHealth } from "./health-check";
import { PartialCompletionHandler, type PartialCompletionResult, type Step } from "./partial-completion";
import { withRetry, type RetryConfig, RetryExhaustedError } from "./retry";

export type OrchestrationConfig = {
  retry?: Partial<RetryConfig>;
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  deadLetterQueue?: Partial<DeadLetterQueueConfig>;
  healthCheck?: Partial<HealthCheckConfig>;
};

export type OrchestrationResult<T> = {
  success: boolean;
  value?: T;
  error?: string;
  retryAttempts?: number;
  circuitBreakerTripped?: boolean;
  deadLettered?: boolean;
};

export type PipelineStep<TContext> = Step<TContext, unknown> & {
  retry?: Partial<RetryConfig>;
  circuitName?: string;
};

function extractRootError(error: unknown): Error {
  if (error instanceof RetryExhaustedError) {
    return error.lastError instanceof Error ? error.lastError : new Error(String(error.lastError));
  }
  return error instanceof Error ? error : new Error(String(error));
}

function wasCircuitBreakerTripped(error: unknown): boolean {
  if (error instanceof CircuitOpenError) return true;
  if (error instanceof RetryExhaustedError) {
    return error.attempts.some(
      (a) => a.error instanceof CircuitOpenError
    );
  }
  return false;
}

export class OrchestrationEngine {
  private circuitBreaker: CircuitBreaker;
  private deadLetterQueue: DeadLetterQueue;
  private healthRegistry: HealthCheckRegistry;

  constructor(config: OrchestrationConfig = {}) {
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    this.deadLetterQueue = new DeadLetterQueue(config.deadLetterQueue);
    this.healthRegistry = new HealthCheckRegistry(config.healthCheck);
  }

  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  getDeadLetterQueue(): DeadLetterQueue {
    return this.deadLetterQueue;
  }

  getHealthRegistry(): HealthCheckRegistry {
    return this.healthRegistry;
  }

  async execute<T>(
    operation: string,
    fn: () => Promise<T>,
    options: {
      retry?: Partial<RetryConfig>;
      circuitName?: string;
      payload?: unknown;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<OrchestrationResult<T>> {
    const { circuitName, payload, metadata } = options;
    const retryConfig = options.retry ?? {};

    const wrapped = circuitName
      ? () => this.circuitBreaker.execute(circuitName, fn)
      : fn;

    try {
      const value = await withRetry(wrapped, retryConfig);
      return { success: true, value };
    } catch (error: unknown) {
      const isRetryExhausted = error instanceof RetryExhaustedError;
      const retryAttempts = isRetryExhausted ? error.attempts.length : undefined;
      const rootError = extractRootError(error);
      const circuitBreakerTripped = wasCircuitBreakerTripped(error);

      this.deadLetterQueue.push({
        operation,
        payload,
        error: rootError,
        retryCount: retryAttempts ?? 0,
        metadata: {
          ...metadata,
          circuitBreakerTripped,
        },
      });

      return {
        success: false,
        error: rootError.message,
        retryAttempts,
        circuitBreakerTripped,
        deadLettered: true,
      };
    }
  }

  async executePipeline<TContext>(
    steps: PipelineStep<TContext>[],
    context: TContext,
    options: {
      stopOnFirstFailure?: boolean;
      compensateOnFailure?: boolean;
    } = {}
  ): Promise<PartialCompletionResult> {
    const handler = new PartialCompletionHandler(
      steps.map((step) => ({
        id: step.id,
        required: step.required,
        compensate: step.compensate,
        execute: async (ctx: TContext) => {
          const wrapped = step.circuitName
            ? () => this.circuitBreaker.execute(step.circuitName, () => step.execute(ctx))
            : () => step.execute(ctx);

          if (step.retry) {
            return withRetry(wrapped, step.retry);
          }
          return wrapped();
        },
      })),
      { stopOnFirstFailure: options.stopOnFirstFailure }
    );

    const result = await handler.execute(context);

    if (options.compensateOnFailure && result.overallStatus !== "completed") {
      await handler.compensate(context, result.steps);
    }

    for (const failed of result.steps.filter((s) => s.status === "failed")) {
      this.deadLetterQueue.push({
        operation: `pipeline_step:${failed.stepId}`,
        payload: context,
        error: new Error(failed.error ?? "Unknown error"),
        metadata: { pipelineResult: result.overallStatus },
      });
    }

    return result;
  }

  async getHealth(): Promise<SystemHealth> {
    return this.healthRegistry.runChecks();
  }

  registerHealthCheck(check: { name: string; check: () => Promise<{ status: "healthy" | "degraded" | "unhealthy"; responseTimeMs: number; error?: string; metadata?: Record<string, unknown> }> }) {
    this.healthRegistry.register(check);
  }
}
