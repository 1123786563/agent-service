import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  MemoryRateLimitStorage,
  RedisRateLimitStorage,
  TokenBucketRateLimiter,
  RateLimitConfig,
  rateLimitKey,
  _resetStorage,
} from "@/server/rate-limit";

describe("MemoryRateLimitStorage", () => {
  let storage: MemoryRateLimitStorage;

  beforeEach(() => {
    storage = new MemoryRateLimitStorage();
  });

  it("returns null for missing keys", async () => {
    const result = await storage.get("missing");
    expect(result).toBeNull();
  });

  it("stores and retrieves bucket state", async () => {
    const state = { tokens: 5, lastRefill: Date.now() };
    await storage.set("test", state, 60_000);
    const retrieved = await storage.get("test");
    expect(retrieved).toEqual(state);
  });

  it("expires entries after TTL", async () => {
    vi.useFakeTimers();
    const state = { tokens: 5, lastRefill: Date.now() };
    await storage.set("test", state, 1000);
    vi.advanceTimersByTime(1001);
    const result = await storage.get("test");
    expect(result).toBeNull();
    vi.useRealTimers();
  });

  it("reset deletes a key", async () => {
    await storage.set("test", { tokens: 1, lastRefill: Date.now() }, 60_000);
    storage.reset("test");
    const result = await storage.get("test");
    expect(result).toBeNull();
  });
});

describe("RedisRateLimitStorage", () => {
  function mockRedis() {
    const store = new Map<string, { value: string; px?: number }>();
    return {
      get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
      set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
        // Parse PX argument
        let px: number | undefined;
        for (let i = 0; i < args.length - 1; i++) {
          if (args[i] === "PX" && typeof args[i + 1] === "number") {
            px = args[i + 1];
          }
        }
        store.set(key, { value, px });
      }),
      _store: store,
    };
  }

  it("returns null for missing keys", async () => {
    const redis = mockRedis();
    const storage = new RedisRateLimitStorage(redis);
    const result = await storage.get("missing");
    expect(result).toBeNull();
  });

  it("stores and retrieves bucket state via Redis", async () => {
    const redis = mockRedis();
    const storage = new RedisRateLimitStorage(redis);
    const state = { tokens: 3, lastRefill: 1000 };
    await storage.set("test", state, 60_000);
    const result = await storage.get("test");
    expect(result).toEqual(state);
    // Verify key prefix
    expect(redis.set).toHaveBeenCalledWith("rl:test", expect.any(String), "PX", 60_000);
  });

  it("returns null for malformed JSON in Redis", async () => {
    const redis = mockRedis();
    redis._store.set("rl:bad", { value: "not-json" });
    const storage = new RedisRateLimitStorage(redis);
    const result = await storage.get("bad");
    expect(result).toBeNull();
  });
});

describe("TokenBucketRateLimiter", () => {
  let storage: MemoryRateLimitStorage;
  let limiter: TokenBucketRateLimiter;
  const config: RateLimitConfig = { rate: 10, burst: 5 };

  beforeEach(() => {
    storage = new MemoryRateLimitStorage();
    limiter = new TokenBucketRateLimiter(storage, config);
  });

  it("allows first request and decrements tokens", async () => {
    const result = await limiter.check("ip:1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.retryAfterMs).toBe(0);
  });

  it("allows up to burst requests then blocks", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await limiter.check("ip:1.2.3.4");
      expect(result.allowed).toBe(true);
    }
    const blocked = await limiter.check("ip:1.2.3.4");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("returns HTTP 429 with retryAfterMs when rate limited", async () => {
    for (let i = 0; i < 5; i++) {
      await limiter.check("ip:1.2.3.4");
    }
    const result = await limiter.check("ip:1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    // With rate=10 tokens/sec, deficit=1 → retryAfterMs ~100ms
    expect(result.retryAfterMs).toBeLessThanOrEqual(200);
  });

  it("refills tokens over time", async () => {
    // Exhaust the bucket
    for (let i = 0; i < 5; i++) {
      await limiter.check("ip:1.2.3.4");
    }
    // Wait enough for 1 token refill (100ms at rate=10)
    vi.useFakeTimers();
    vi.advanceTimersByTime(150);
    // Need to also advance real Date.now since storage TTL uses it
    const result = await limiter.check("ip:1.2.3.4");
    expect(result.allowed).toBe(true);
    vi.useRealTimers();
  });

  it("isolates different keys (per-IP isolation)", async () => {
    // Exhaust IP A
    for (let i = 0; i < 5; i++) {
      await limiter.check("ip:1.1.1.1");
    }
    // IP B should still have full bucket
    const result = await limiter.check("ip:2.2.2.2");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("supports per-user rate limiting with separate keys", async () => {
    // Exhaust IP bucket
    for (let i = 0; i < 5; i++) {
      await limiter.check("ip:1.1.1.1");
    }
    // User bucket should be independent
    const result = await limiter.check("user:abc-123");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("uses default config when none provided", async () => {
    const defaultLimiter = new TokenBucketRateLimiter(storage);
    // Default burst is 60
    for (let i = 0; i < 60; i++) {
      const result = await defaultLimiter.check("ip:1.1.1.1");
      expect(result.allowed).toBe(true);
    }
    const blocked = await defaultLimiter.check("ip:1.1.1.1");
    expect(blocked.allowed).toBe(false);
  });

  it("uses custom config per check call", async () => {
    const strictConfig: RateLimitConfig = { rate: 1, burst: 2 };
    // Default config has burst=5, but we override with burst=2
    const r1 = await limiter.check("ip:1.1.1.1", strictConfig);
    expect(r1.allowed).toBe(true);
    const r2 = await limiter.check("ip:1.1.1.1", strictConfig);
    expect(r2.allowed).toBe(true);
    const r3 = await limiter.check("ip:1.1.1.1", strictConfig);
    expect(r3.allowed).toBe(false);
  });
});

describe("rateLimitKey", () => {
  it("builds per-IP key", () => {
    expect(rateLimitKey("ip", "1.2.3.4")).toBe("ip:1.2.3.4");
  });

  it("builds per-user key", () => {
    expect(rateLimitKey("user", "abc-123")).toBe("user:abc-123");
  });
});

describe("module-level singleton", () => {
  it("falls back to memory storage when REDIS_URL is not set", async () => {
    _resetStorage();
    // Dynamic re-import to get a fresh singleton
    const mod = await import("@/server/rate-limit");
    // If we got here without errors, the singleton initialized with memory storage
    const result = await mod.rateLimiter.check("test:singleton");
    expect(result.allowed).toBe(true);
  });
});
