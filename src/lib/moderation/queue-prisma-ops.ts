import { prisma } from "@/server/db";

export async function getPendingItems(limit: number, offset: number) {
  return prisma.contentQueueItem.findMany({
    where: { status: "PENDING" },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: limit,
    skip: offset,
  });
}

export async function assignReviewer(itemId: string) {
  const item = await prisma.contentQueueItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Queue item not found");
  if (item.status !== "PENDING") throw new Error(`Cannot assign reviewer: item status is ${item.status}`);

  // Find reviewer with lowest workload
  const workloads = await prisma.contentQueueItem.groupBy({
    by: ["assignedToId"],
    where: {
      status: { in: ["ASSIGNED", "IN_REVIEW"] },
      assignedToId: { not: null },
    },
    _count: { id: true },
  });

  // Get all admin/creator users as potential reviewers
  const reviewers = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "CREATOR"] } },
    select: { id: true },
    take: 1,
  });

  if (reviewers.length === 0) throw new Error("No reviewers available");

  // Pick reviewer with lowest workload, fallback to first reviewer
  let reviewerId = reviewers[0].id;
  if (workloads.length > 0) {
    const sorted = [...workloads].sort((a, b) => a._count.id - b._count.id);
    reviewerId = sorted[0].assignedToId ?? reviewers[0].id;
  }

  return prisma.contentQueueItem.update({
    where: { id: itemId },
    data: { assignedToId: reviewerId, status: "ASSIGNED" },
  });
}

export async function resolveItem(itemId: string, resolution: string) {
  const item = await prisma.contentQueueItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Queue item not found");
  if (item.status !== "ASSIGNED" && item.status !== "IN_REVIEW") {
    throw new Error(`Cannot resolve: item status is ${item.status}`);
  }

  return prisma.contentQueueItem.update({
    where: { id: itemId },
    data: { status: "RESOLVED", resolution, resolvedAt: new Date() },
  });
}

export async function escalateItem(itemId: string) {
  const item = await prisma.contentQueueItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Queue item not found");

  return prisma.contentQueueItem.update({
    where: { id: itemId },
    data: { status: "ESCALATED", priority: "CRITICAL", escalatedAt: new Date() },
  });
}
