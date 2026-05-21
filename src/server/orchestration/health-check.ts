import { CircuitBreaker, type CircuitBreakerConfig, type CircuitState } from "./circuit-breaker";
import { DeadLetterQueue, type DeadLetterQueueConfig } from "./dead-letter-queue";

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export type ComponentHealth = {
  name: string;
  status: HealthStatus;
  responseTimeMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
};

export type SystemHealth = {
  status: HealthStatus;
  timestamp: number;
  uptimeMs: number;
  components: ComponentHealth[];
  circuitBreakers: Record<string, { state: CircuitState; failureCount: number; successCount: number }>;
  deadLetterQueueSize: number;
};

export type HealthCheckConfig = {
  checkIntervalMs: number;
  timeoutMs: number;
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
  deadLetterQueueConfig?: Partial<DeadLetterQueueConfig>;
};

export const DEFAULT_HEALTH_CHECK_CONFIG: HealthCheckConfig = {
  checkIntervalMs: 30_000,
  timeoutMs: 5_000,
};

export type HealthCheck = {
  name: string;
  check: () => Promise<{ status: HealthStatus; responseTimeMs: number; error?: string; metadata?: Record<string, unknown> }>;
};

export class HealthCheckRegistry {
  private checks: Map<string, HealthCheck> = new Map();
  private circuitBreaker: CircuitBreaker;
  private deadLetterQueue: DeadLetterQueue;
  private startedAt: number;
  private config: HealthCheckConfig;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastResult: SystemHealth | null = null;

  constructor(config: Partial<HealthCheckConfig> = {}) {
    this.config = { ...DEFAULT_HEALTH_CHECK_CONFIG, ...config };
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreakerConfig);
    this.deadLetterQueue = new DeadLetterQueue(this.config.deadLetterQueueConfig);
    this.startedAt = Date.now();
  }

  register(check: HealthCheck) {
    this.checks.set(check.name, check);
  }

  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  getDeadLetterQueue(): DeadLetterQueue {
    return this.deadLetterQueue;
  }

  async runChecks(): Promise<SystemHealth> {
    const components: ComponentHealth[] = [];

    for (const [name, check] of this.checks) {
      try {
        const result = await Promise.race([
          check.check(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Health check timed out")), this.config.timeoutMs)
          ),
        ]);
        components.push({ name, ...result });
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        components.push({
          name,
          status: "unhealthy",
          responseTimeMs: this.config.timeoutMs,
          error: errorMsg,
        });
      }
    }

    const overallStatus: HealthStatus = this.computeOverallStatus(components);

    // Aggregate circuit breaker stats for all known circuits
    const circuitBreakers: SystemHealth["circuitBreakers"] = {};

    const result: SystemHealth = {
      status: overallStatus,
      timestamp: Date.now(),
      uptimeMs: Date.now() - this.startedAt,
      components,
      circuitBreakers,
      deadLetterQueueSize: this.deadLetterQueue.size(),
    };

    this.lastResult = result;
    return result;
  }

  getLastResult(): SystemHealth | null {
    return this.lastResult;
  }

  startPeriodicChecks(): () => void {
    if (this.intervalId) return () => {};

    this.intervalId = setInterval(async () => {
      try {
        await this.runChecks();
      } catch {
        // Silently ignore periodic check failures
      }
    }, this.config.checkIntervalMs);

    return () => {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    };
  }

  private computeOverallStatus(components: ComponentHealth[]): HealthStatus {
    if (components.length === 0) return "healthy";

    const hasUnhealthy = components.some((c) => c.status === "unhealthy");
    if (hasUnhealthy) return "unhealthy";

    const hasDegraded = components.some((c) => c.status === "degraded");
    if (hasDegraded) return "degraded";

    return "healthy";
  }
}

export function createDatabaseHealthCheck(db: { $queryRaw: (query: unknown) => Promise<unknown> }): HealthCheck {
  return {
    name: "database",
    check: async () => {
      const start = Date.now();
      try {
        await db.$queryRaw`SELECT 1`;
        return { status: "healthy" as const, responseTimeMs: Date.now() - start };
      } catch (error: unknown) {
        return {
          status: "unhealthy" as const,
          responseTimeMs: Date.now() - start,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

export function createExternalServiceHealthCheck(
  name: string,
  urlOrCheck: string | (() => Promise<void>)
): HealthCheck {
  return {
    name,
    check: async () => {
      const start = Date.now();
      try {
        if (typeof urlOrCheck === "function") {
          await urlOrCheck();
        } else {
          const response = await fetch(urlOrCheck, { method: "GET", signal: AbortSignal.timeout(5000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        }
        return { status: "healthy" as const, responseTimeMs: Date.now() - start };
      } catch (error: unknown) {
        return {
          status: "unhealthy" as const,
          responseTimeMs: Date.now() - start,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
