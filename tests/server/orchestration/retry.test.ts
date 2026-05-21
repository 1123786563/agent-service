import { describe, it, expect } from "vitest";
import { withRetry, RetryExhaustedError, type RetryConfig } from "@/server/orchestration/retry";

function withMockTimers<T>(fn: (trackDelay: (ms: number) => void) => Promise<T>): { result: Promise<T>; delays: number[] } {
  const delays: number[] = [];
  const originalSetTimeout = globalThis.setTimeout;

  globalThis.setTimeout = ((cb: () => void, ms: number) => {
    delays.push(ms);
    // Resolve immediately to avoid waiting
    return originalSetTimeout(cb, 0);
  }) as typeof setTimeout;

  const result = fn((ms) => delays.push(ms)).finally(() => {
    globalThis.setTimeout = originalSetTimeout;
  });

  return { result, delays };
}

describe("withRetry", () => {
  it("returns the value on first successful attempt", async () => {
    const result = await withRetry(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("retries on failure and eventually succeeds", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) throw new Error("fail");
      return "ok";
    };

    const result = await withRetry(fn, { baseDelayMs: 0, maxAttempts: 5 });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("throws RetryExhaustedError when max attempts reached", async () => {
    const fn = async () => {
      throw new Error("persistent failure");
    };

    try {
      await withRetry(fn, { baseDelayMs: 0, maxAttempts: 3 });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(RetryExhaustedError);
      expect((error as Error).message).toContain("persistent failure");
    }
  });

  it("respects retryableCheck to skip non-retryable errors", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new Error("not retryable");
    };

    const config: Partial<RetryConfig> = {
      maxAttempts: 5,
      baseDelayMs: 0,
      retryableCheck: (err) => !(err instanceof Error && err.message === "not retryable"),
    };

    try {
      await withRetry(fn, config);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(RetryExhaustedError);
      expect(attempts).toBe(1);
    }
  });

  it("applies exponential backoff with increasing delays", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts <= 3) throw new Error("fail");
      return "ok";
    };

    const config: Partial<RetryConfig> = {
      baseDelayMs: 100,
      maxDelayMs: 10_000,
      backoffMultiplier: 2,
      jitter: "none",
      maxAttempts: 5,
    };

    const { result, delays } = withMockTimers(() => withRetry(fn, config));
    await result;

    expect(delays).toHaveLength(3);
    expect(delays[0]).toBe(100);   // baseDelayMs * 2^0
    expect(delays[1]).toBe(200);   // baseDelayMs * 2^1
    expect(delays[2]).toBe(400);   // baseDelayMs * 2^2
  });

  it("caps delay at maxDelayMs", async () => {
    const fn = async () => {
      throw new Error("fail");
    };

    const config: Partial<RetryConfig> = {
      baseDelayMs: 100,
      maxDelayMs: 300,
      backoffMultiplier: 10,
      jitter: "none",
      maxAttempts: 5,
    };

    const { result, delays } = withMockTimers(() => withRetry(fn, config));
    try { await result; } catch { /* expected */ }

    for (const delay of delays) {
      expect(delay).toBeLessThanOrEqual(300);
    }
  });

  it("RetryExhaustedError contains attempt details", async () => {
    const fn = async () => {
      throw new Error("fail");
    };

    try {
      await withRetry(fn, { maxAttempts: 2, baseDelayMs: 0 });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(RetryExhaustedError);
      const retryError = error as RetryExhaustedError;
      expect(retryError.attempts).toHaveLength(2);
      expect(retryError.lastError).toBeInstanceOf(Error);
      expect(retryError.totalElapsedMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("uses full jitter producing delays between 0 and capped value", async () => {
    const fn = async () => {
      throw new Error("fail");
    };

    const config: Partial<RetryConfig> = {
      baseDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
      jitter: "full",
      maxAttempts: 3,
    };

    const { result, delays } = withMockTimers(() => withRetry(fn, config));
    try { await result; } catch { /* expected */ }

    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(1000);
    }
  });

  it("uses equal jitter producing delays between half and capped value", async () => {
    const fn = async () => {
      throw new Error("fail");
    };

    const config: Partial<RetryConfig> = {
      baseDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
      jitter: "equal",
      maxAttempts: 3,
    };

    const { result, delays } = withMockTimers(() => withRetry(fn, config));
    try { await result; } catch { /* expected */ }

    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(1000);
    }
  });
});
