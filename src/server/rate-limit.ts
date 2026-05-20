// Token bucket rate limiter with pluggable storage (in-memory + Redis).

export type RateLimitConfig = {
  /** Refill rate: tokens added per second */
  rate: number;
  /** Maximum burst size (bucket capacity) */
  burst: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
};

export type BucketState = {
  tokens: number;
  lastRefill: number;
};

// Storage interface — implementations can be in-memory or Redis-backed.

export interface RateLimitStorage {
  get(key: string): Promise<BucketState | null>;
  set(key: string, state: BucketState, ttlMs: number): Promise<void>;
}

// In-memory storage (single-instance; tests fallback)

export class MemoryRateLimitStorage implements RateLimitStorage {
  private store = new Map<string, BucketState & { expiresAt: number }>();

  async get(key: string): Promise<BucketState | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return { tokens: entry.tokens, lastRefill: entry.lastRefill };
  }

  async set(key: string, state: BucketState, ttlMs: number): Promise<void> {
    this.store.set(key, { ...state, expiresAt: Date.now() + ttlMs });
  }

  reset(key: string): void {
    this.store.delete(key);
  }
}

// Redis storage (distributed; multiple server instances)

export class RedisRateLimitStorage implements RateLimitStorage {
  private prefix = "rl:";

  constructor(
    private redis: { get(key: string): Promise<string | null>; set(key: string, value: string, ...args: unknown[]): Promise<unknown> },
  ) {}

  async get(key: string): Promise<BucketState | null> {
    const raw = await this.redis.get(this.prefix + key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as BucketState;
    } catch {
      return null;
    }
  }

  async set(key: string, state: BucketState, ttlMs: number): Promise<void> {
    const px = Math.max(1, ttlMs);
    // Use SET with PX for atomic TTL — works with ioredis and node-redis
    await this.redis.set(this.prefix + key, JSON.stringify(state), "PX", px);
  }
}

// Token bucket algorithm

export class TokenBucketRateLimiter {
  private defaultConfig: RateLimitConfig;

  constructor(
    private storage: RateLimitStorage,
    defaultConfig: RateLimitConfig = { rate: 1, burst: 60 },
  ) {
    this.defaultConfig = defaultConfig;
  }

  async check(key: string, config?: RateLimitConfig): Promise<RateLimitResult> {
    const cfg = config ?? this.defaultConfig;
    const now = Date.now();
    const state = await this.storage.get(key);

    let tokens: number;
    let lastRefill: number;

    if (!state) {
      // First request — start with a full bucket
      tokens = cfg.burst;
      lastRefill = now;
    } else {
      lastRefill = state.lastRefill;
      // Refill tokens based on elapsed time
      const elapsedMs = now - lastRefill;
      const refill = (elapsedMs / 1000) * cfg.rate;
      tokens = Math.min(cfg.burst, state.tokens + refill);
      lastRefill = now;
    }

    if (tokens < 1) {
      // Not enough tokens — calculate wait time
      const deficit = 1 - tokens;
      const retryAfterMs = Math.ceil((deficit / cfg.rate) * 1000);
      // Persist current state so competing requests see the same bucket
      const ttlMs = Math.max(cfg.burst / cfg.rate * 1000, 60_000);
      await this.storage.set(key, { tokens, lastRefill }, ttlMs);
      return { allowed: false, retryAfterMs, remaining: 0 };
    }

    tokens -= 1;
    const ttlMs = Math.max((cfg.burst / cfg.rate) * 1000, 60_000);
    await this.storage.set(key, { tokens, lastRefill }, ttlMs);

    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: Math.floor(tokens),
    };
  }

  async reset(key: string): Promise<void> {
    if ("reset" in this.storage && typeof (this.storage as MemoryRateLimitStorage).reset === "function") {
      (this.storage as MemoryRateLimitStorage).reset(key);
    } else {
      // For Redis storage, set to expired state
      await this.storage.set(key, { tokens: this.defaultConfig.burst, lastRefill: Date.now() }, 1);
    }
  }
}

// Pre-configured limits for different endpoint categories

export const RATE_LIMIT_DEFAULT: RateLimitConfig = { rate: 1, burst: 60 };
export const RATE_LIMIT_AUTH: RateLimitConfig = { rate: 1 / 12, burst: 5 };
export const RATE_LIMIT_UPLOAD: RateLimitConfig = { rate: 1 / 6, burst: 10 };
export const RATE_LIMIT_WEBHOOK: RateLimitConfig = { rate: 10, burst: 100 };
export const RATE_LIMIT_CONSULTATION: RateLimitConfig = { rate: 1 / 6, burst: 10 };

// Paths exempt from rate limiting (health checks, webhooks handled elsewhere)

export const RATE_LIMIT_EXEMPT_PATHS = [
  "/api/health",
  "/api/payments/webhook",
];

// Singleton storage — initialized lazily, switched between memory/Redis.

let globalStorage: RateLimitStorage | null = null;

function getStorage(): RateLimitStorage {
  if (globalStorage) return globalStorage;

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    // Dynamic import to avoid hard dependency on ioredis
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Redis = require("ioredis");
      const client = new Redis(redisUrl);
      globalStorage = new RedisRateLimitStorage(client);
      return globalStorage;
    } catch {
      // ioredis not installed — fall back to memory
    }
  }

  globalStorage = new MemoryRateLimitStorage();
  return globalStorage;
}

export function _resetStorage(): void {
  globalStorage = null;
}

// Exported singleton rate limiter

export const rateLimiter = new TokenBucketRateLimiter(getStorage());

// Convenience: build a rate limit key from IP or user ID.
// Used by middleware to switch between per-IP and per-user limiting.

export function rateLimitKey(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}
