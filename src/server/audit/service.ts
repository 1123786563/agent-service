import { prisma } from "@/server/db";

export type AuditLogInput = {
  actorId?: string | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function recordAuditLog(input: AuditLogInput) {
  return prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorRole: input.actorRole,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      beforeSnapshot: input.beforeSnapshot ?? undefined,
      afterSnapshot: input.afterSnapshot ?? undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null
    }
  });
}
