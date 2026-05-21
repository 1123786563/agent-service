export type RetryConfig = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: "full" | "none" | "equal";
  retryableCheck?: (error: unknown) => boolean;
};

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
  jitter: "full",
};

export type RetryAttempt = {
  attempt: number;
  delayMs: number;
  error: unknown;
  totalElapsedMs: number;
};

export class RetryExhaustedError extends Error {
  attempts: RetryAttempt[];
  totalElapsedMs: number;
  lastError: unknown;

  constructor(result: { attempts: RetryAttempt[]; totalElapsedMs: number; lastError: unknown }) {
    const messages = result.attempts.map((a) => String(a.error)).join("; ");
    super(`Retry exhausted after ${result.attempts.length} attempts: ${messages}`);
    this.name = "RetryExhaustedError";
    this.attempts = result.attempts;
    this.totalElapsedMs = result.totalElapsedMs;
    this.lastError = result.lastError;
  }
}

function computeDelay(attempt: number, config: RetryConfig): number {
  const rawDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const capped = Math.min(rawDelay, config.maxDelayMs);

  if (config.jitter === "none") return capped;
  if (config.jitter === "equal") return capped / 2 + Math.random() * (capped / 2);
  return Math.random() * capped;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const attempts: RetryAttempt[] = [];
  const start = Date.now();

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isRetryable = cfg.retryableCheck ? cfg.retryableCheck(error) : true;
      const elapsed = Date.now() - start;

      attempts.push({ attempt, delayMs: 0, error, totalElapsedMs: elapsed });

      if (!isRetryable || attempt >= cfg.maxAttempts) {
        throw new RetryExhaustedError({
          attempts,
          totalElapsedMs: elapsed,
          lastError: error,
        });
      }

      const delay = computeDelay(attempt, cfg);
      attempts[attempts.length - 1].delayMs = delay;
      await sleep(delay);
    }
  }

  throw new RetryExhaustedError({ attempts, totalElapsedMs: Date.now() - start, lastError: null });
}
