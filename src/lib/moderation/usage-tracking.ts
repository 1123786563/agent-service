import { prisma } from "@/server/db";
import { InMemoryCounterStore } from "./realtime-counters";

interface UsageLogEntry {
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseMs: number;
}

export async function logApiUsage(entry: UsageLogEntry): Promise<void> {
  await prisma.apiUsageLog.create({ data: entry });
}

export async function getApiKeyUsage(apiKeyId: string, periodDays: number = 30) {
  const since = new Date();
  since.setDate(since.getDate() - periodDays);

  const [totalCount, recentLogs, dailyBreakdown] = await Promise.all([
    prisma.apiUsageLog.count({
      where: { apiKeyId, createdAt: { gte: since } },
    }),
    prisma.apiUsageLog.findFirst({
      where: { apiKeyId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.apiUsageLog.groupBy({
      by: ["endpoint"],
      where: { apiKeyId, createdAt: { gte: since } },
      _count: { endpoint: true },
      orderBy: { _count: { endpoint: "desc" } },
    }),
  ]);

  return {
    totalRequests: totalCount,
    lastUsed: recentLogs?.createdAt ?? null,
    endpointBreakdown: dailyBreakdown.map((b) => ({
      endpoint: b.endpoint,
      count: b._count.endpoint,
    })),
  };
}

export async function getApiKeyQuotaRemaining(apiKeyId: string, rateLimit: number): Promise<{ remaining: number; limit: number; windowSeconds: number }> {
  const store = getQuotaStore();
  const key = `quota:${apiKeyId}`;
  const used = await store.get(key);
  return {
    remaining: Math.max(0, rateLimit - used),
    limit: rateLimit,
    windowSeconds: 60,
  };
}

const globalForQuota = globalThis as unknown as { quotaStore?: InMemoryCounterStore };
function getQuotaStore(): InMemoryCounterStore {
  if (!globalForQuota.quotaStore) {
    globalForQuota.quotaStore = new InMemoryCounterStore();
  }
  return globalForQuota.quotaStore;
}
