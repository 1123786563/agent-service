import { prisma } from "@/server/db";
import type { QueueItem } from "./types";
import type { QueueStore } from "./queue-service";

export function createPrismaQueueStore(): QueueStore {
  return {
    async createItem(data) {
      const item = await prisma.contentQueueItem.create({ data });
      return item as QueueItem;
    },

    async findById(id) {
      const item = await prisma.contentQueueItem.findUnique({ where: { id } });
      return item as QueueItem | null;
    },

    async findPending(limit, offset) {
      const items = await prisma.contentQueueItem.findMany({
        where: { status: "PENDING" },
        orderBy: [
          { priority: "desc" },
          { createdAt: "asc" },
        ],
        take: limit,
        skip: offset,
      });
      return items as QueueItem[];
    },

    async findByAssignedReviewer(reviewerId, status) {
      const where: Record<string, unknown> = { assignedToId: reviewerId };
      if (status) where.status = status;
      const items = await prisma.contentQueueItem.findMany({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      });
      return items as QueueItem[];
    },

    async updateItem(id, data) {
      const item = await prisma.contentQueueItem.update({
        where: { id },
        data,
      });
      return item as QueueItem;
    },

    async getReviewerWorkloads() {
      const assigned = await prisma.contentQueueItem.groupBy({
        by: ["assignedToId"],
        where: {
          status: { in: ["ASSIGNED", "PENDING", "IN_REVIEW"] },
          assignedToId: { not: null },
        },
        _count: { id: true },
      });

      return assigned.map((row) => ({
        reviewerId: row.assignedToId!,
        pendingCount: row._count.id,
        inReviewCount: 0,
      }));
    },

    async countByStatus(status) {
      return prisma.contentQueueItem.count({ where: { status: status as "PENDING" } });
    },
  };
}
