import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/server/db";
import { InMemoryCounterStore } from "./realtime-counters";

const RATE_LIMIT_WINDOW_SECONDS = 60;

interface AuthenticatedApiKey {
  id: string;
  name: string;
  tier: "STANDARD" | "PREMIUM";
  rateLimit: number;
}

interface AuthResult {
  authenticated: true;
  apiKey: AuthenticatedApiKey;
}

interface AuthFailure {
  authenticated: false;
  error: string;
  statusCode: number;
}

type AuthOutcome = AuthResult | AuthFailure;

function hashApiKey(key: string): string {
  return createHmac("sha256", key).update("multica-api-key").digest("hex");
}

const globalForStore = globalThis as unknown as { rateLimitStore?: InMemoryCounterStore };
function getRateLimitStore(): InMemoryCounterStore {
  if (!globalForStore.rateLimitStore) {
    globalForStore.rateLimitStore = new InMemoryCounterStore();
  }
  return globalForStore.rateLimitStore;
}

export async function authenticateApiKey(request: Request): Promise<AuthOutcome> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return { authenticated: false, error: "Missing Authorization header", statusCode: 401 };
  }

  if (!authHeader.startsWith("Bearer ")) {
    return { authenticated: false, error: "Invalid authorization scheme. Use: Bearer <api_key>", statusCode: 401 };
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) {
    return { authenticated: false, error: "Empty API key", statusCode: 401 };
  }

  const keyHash = hashApiKey(rawKey);
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: { id: true, name: true, tier: true, rateLimit: true, isActive: true },
  });

  if (!apiKey || !apiKey.isActive) {
    return { authenticated: false, error: "Invalid or inactive API key", statusCode: 401 };
  }

  const rateLimitResult = await checkRateLimit(apiKey.id, apiKey.rateLimit);
  if (!rateLimitResult.allowed) {
    return {
      authenticated: false,
      error: `Rate limit exceeded. Retry after ${rateLimitResult.retryAfterSeconds}s`,
      statusCode: 429,
    };
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return {
    authenticated: true,
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      tier: apiKey.tier as "STANDARD" | "PREMIUM",
      rateLimit: apiKey.rateLimit,
    },
  };
}

async function checkRateLimit(
  apiKeyId: string,
  limit: number
): Promise<{ allowed: boolean; retryAfterSeconds: number; remaining: number }> {
  const store = getRateLimitStore();
  const key = `ratelimit:${apiKeyId}`;
  const current = await store.increment(key);

  if (current === 1) {
    await store.expire(key, RATE_LIMIT_WINDOW_SECONDS);
  }

  if (current > limit) {
    return { allowed: false, retryAfterSeconds: RATE_LIMIT_WINDOW_SECONDS, remaining: 0 };
  }

  return { allowed: true, retryAfterSeconds: 0, remaining: limit - current };
}

export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const rawKey = `mk_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 7);
  return { rawKey, keyHash, keyPrefix };
}

export function signWebhookPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = signWebhookPayload(payload, secret);
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export { RATE_LIMIT_WINDOW_SECONDS };
