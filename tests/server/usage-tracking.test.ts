import { describe, expect, it, vi } from "vitest";

// Mock prisma
vi.mock("@/server/db", () => ({
  prisma: {
    apiUsageLog: {
      create: vi.fn().mockResolvedValue({ id: "log1" }),
      count: vi.fn().mockResolvedValue(42),
      findFirst: vi.fn().mockResolvedValue({ createdAt: new Date("2026-01-15") }),
      groupBy: vi.fn().mockResolvedValue([
        { endpoint: "/api/v1/moderation/analyze-text", _count: { endpoint: 30 } },
        { endpoint: "/api/v1/moderation/queue", _count: { endpoint: 12 } },
      ]),
    },
  },
}));

import { logApiUsage, getApiKeyUsage, getApiKeyQuotaRemaining } from "@/lib/moderation/usage-tracking";
import { prisma } from "@/server/db";

describe("logApiUsage", () => {
  it("creates a usage log entry", async () => {
    await logApiUsage({
      apiKeyId: "key1",
      endpoint: "/api/v1/moderation/analyze-text",
      method: "POST",
      statusCode: 200,
      responseMs: 45,
    });

    expect(prisma.apiUsageLog.create).toHaveBeenCalledWith({
      data: {
        apiKeyId: "key1",
        endpoint: "/api/v1/moderation/analyze-text",
        method: "POST",
        statusCode: 200,
        responseMs: 45,
      },
    });
  });
});

describe("getApiKeyUsage", () => {
  it("returns usage statistics", async () => {
    const usage = await getApiKeyUsage("key1", 30);

    expect(usage.totalRequests).toBe(42);
    expect(usage.lastUsed).toEqual(new Date("2026-01-15"));
    expect(usage.endpointBreakdown).toHaveLength(2);
    expect(usage.endpointBreakdown[0].endpoint).toBe("/api/v1/moderation/analyze-text");
    expect(usage.endpointBreakdown[0].count).toBe(30);
  });

  it("returns null lastUsed when no logs exist", async () => {
    vi.mocked(prisma.apiUsageLog.findFirst).mockResolvedValueOnce(null as any);
    const usage = await getApiKeyUsage("key1", 30);
    expect(usage.lastUsed).toBeNull();
  });
});

describe("getApiKeyQuotaRemaining", () => {
  it("returns remaining quota", async () => {
    const quota = await getApiKeyQuotaRemaining("key1", 100);
    expect(quota.limit).toBe(100);
    expect(quota.remaining).toBe(100);
    expect(quota.windowSeconds).toBe(60);
  });
});
