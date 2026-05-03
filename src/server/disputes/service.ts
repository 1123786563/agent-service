import { DisputeResolutionType, DisputeStatus, PaymentStatus, ServiceOrderStatus } from "@prisma/client";
import { recordAuditLog } from "@/server/audit/service";
import { prisma } from "@/server/db";

type CreateDisputeInput = {
  orderId: string;
  openedByUserId?: string | null;
  reason: string;
  evidence?: Array<{
    submittedByUserId?: string | null;
    note?: string | null;
    attachmentObjectKey?: string | null;
    attachmentFileName?: string | null;
    visibleToBuyer?: boolean;
    visibleToProvider?: boolean;
  }>;
};

type ResolveDisputeInput = {
  disputeId: string;
  resolutionType: DisputeResolutionType;
  resolutionNote?: string | null;
};

const disputableStatuses: ServiceOrderStatus[] = [
  ServiceOrderStatus.PAID,
  ServiceOrderStatus.IN_PROGRESS,
  ServiceOrderStatus.DELIVERED
];

export async function createDispute(input: CreateDisputeInput) {
  const orderId = input.orderId.trim();
  const reason = input.reason.trim();

  if (!orderId) {
    throw new Error("Order ID is required");
  }

  if (!reason) {
    throw new Error("Dispute reason is required");
  }

  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      paymentStatus: true
    }
  });

  if (!order) {
    throw new Error("Service order not found");
  }

  if (!disputableStatuses.includes(order.status)) {
    throw new Error("Service order cannot enter dispute from its current status");
  }

  const existingOpenDispute = await prisma.dispute.findFirst({
    where: {
      orderId,
      status: {
        in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW]
      }
    }
  });

  if (existingOpenDispute) {
    return existingOpenDispute;
  }

  return prisma.$transaction(async (tx) => {
    const dispute = await tx.dispute.create({
      data: {
        orderId,
        openedByUserId: input.openedByUserId ?? null,
        reason,
        status: DisputeStatus.OPEN,
        evidence: input.evidence?.length
          ? {
              create: input.evidence.map((item) => ({
                submittedByUserId: item.submittedByUserId ?? null,
                note: item.note?.trim() || null,
                attachmentObjectKey: item.attachmentObjectKey ?? null,
                attachmentFileName: item.attachmentFileName ?? null,
                visibleToBuyer: item.visibleToBuyer ?? true,
                visibleToProvider: item.visibleToProvider ?? true
              }))
            }
          : undefined
      },
      include: {
        evidence: true
      }
    });

    await tx.serviceOrder.update({
      where: { id: orderId },
      data: {
        status: ServiceOrderStatus.DISPUTED
      }
    });

    await recordAuditLog({
      actorId: input.openedByUserId ?? null,
      actorRole: "USER",
      action: "dispute.create",
      targetType: "Dispute",
      targetId: dispute.id,
      afterSnapshot: {
        orderId
      }
    });

    return dispute;
  });
}

function statusFromResolutionType(resolutionType: DisputeResolutionType) {
  if (resolutionType === DisputeResolutionType.RETURN_TO_PROGRESS) {
    return ServiceOrderStatus.IN_PROGRESS;
  }

  if (resolutionType === DisputeResolutionType.RETURN_TO_DELIVERED) {
    return ServiceOrderStatus.DELIVERED;
  }

  if (resolutionType === DisputeResolutionType.REJECTED) {
    return ServiceOrderStatus.DELIVERED;
  }

  return ServiceOrderStatus.CANCELLED;
}

export async function resolveDispute(input: ResolveDisputeInput) {
  const disputeId = input.disputeId.trim();
  if (!disputeId) {
    throw new Error("Dispute ID is required");
  }

  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      order: true
    }
  });

  if (!dispute) {
    throw new Error("Dispute not found");
  }

  if (dispute.status === DisputeStatus.RESOLVED) {
    return dispute;
  }

  const nextOrderStatus = statusFromResolutionType(input.resolutionType);

  return prisma.$transaction(async (tx) => {
    const resolvedDispute = await tx.dispute.update({
      where: { id: disputeId },
      data: {
        status: DisputeStatus.RESOLVED,
        resolutionType: input.resolutionType,
        resolutionNote: input.resolutionNote?.trim() || null,
        resolvedAt: new Date()
      },
      include: {
        order: true,
        evidence: true
      }
    });

    await tx.serviceOrder.update({
      where: { id: dispute.orderId },
      data: {
        status: nextOrderStatus,
        paymentStatus:
          nextOrderStatus === ServiceOrderStatus.CANCELLED && dispute.order.paymentStatus === PaymentStatus.PAID
            ? PaymentStatus.REFUNDED
            : dispute.order.paymentStatus
      }
    });

    await recordAuditLog({
      actorRole: "ADMIN",
      action: "dispute.resolve",
      targetType: "Dispute",
      targetId: disputeId,
      afterSnapshot: {
        resolutionType: input.resolutionType,
        nextOrderStatus
      }
    });

    return resolvedDispute;
  });
}

export async function resolveLatestOpenDisputeForOrder(input: {
  orderId: string;
  resolutionType: DisputeResolutionType;
  resolutionNote?: string | null;
}) {
  const dispute = await prisma.dispute.findFirst({
    where: {
      orderId: input.orderId,
      status: {
        in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW]
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (!dispute) {
    throw new Error("Open dispute not found");
  }

  return resolveDispute({
    disputeId: dispute.id,
    resolutionType: input.resolutionType,
    resolutionNote: input.resolutionNote
  });
}
