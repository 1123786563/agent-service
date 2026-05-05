export type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
};

export class SlidingWindowCounter {
  private buckets: Map<string, { count: number; resetAt: number }> = new Map();
  private defaultConfig: RateLimitConfig;

  constructor(defaultConfig: RateLimitConfig = { windowMs: 60_000, maxRequests: 60 }) {
    this.defaultConfig = defaultConfig;
  }

  check(key: string, config?: RateLimitConfig): RateLimitResult {
    const cfg = config ?? this.defaultConfig;
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + cfg.windowMs };
      this.buckets.set(key, bucket);
    }

    if (bucket.count >= cfg.maxRequests) {
      return {
        allowed: false,
        retryAfterMs: bucket.resetAt - now,
        remaining: 0,
      };
    }

    bucket.count++;
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: cfg.maxRequests - bucket.count,
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}

export const RATE_LIMIT_AUTH: RateLimitConfig = { windowMs: 60_000, maxRequests: 5 };
export const RATE_LIMIT_UPLOAD: RateLimitConfig = { windowMs: 60_000, maxRequests: 10 };
export const RATE_LIMIT_WEBHOOK: RateLimitConfig = { windowMs: 60_000, maxRequests: 100 };
export const RATE_LIMIT_CONSULTATION: RateLimitConfig = { windowMs: 60_000, maxRequests: 10 };

export const rateLimiter = new SlidingWindowCounter();
