import { PaymentStatus, ServiceOrderStatus, SettlementBatchStatus, SettlementLineStatus } from "@prisma/client";
import { prisma } from "@/server/db";

export async function buildSettlementLine(orderId: string) {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) {
    throw new Error("Order ID is required");
  }

  const order = await prisma.serviceOrder.findUnique({
    where: { id: normalizedOrderId },
    select: {
      id: true,
      providerId: true,
      priceCents: true,
      currency: true,
      status: true,
      paymentStatus: true
    }
  });

  if (!order) {
    throw new Error("Service order not found");
  }

  if (order.status !== ServiceOrderStatus.COMPLETED || order.paymentStatus !== PaymentStatus.PAID) {
    throw new Error("Service order is not eligible for settlement");
  }

  return prisma.settlementLine.upsert({
    where: { orderId: normalizedOrderId },
    create: {
      orderId: normalizedOrderId,
      providerId: order.providerId,
      grossAmountMinor: order.priceCents,
      platformFeeAmountMinor: 0,
      netAmountMinor: order.priceCents,
      currency: order.currency,
      status: SettlementLineStatus.PENDING,
      eligibleAt: new Date()
    },
    update: {
      grossAmountMinor: order.priceCents,
      netAmountMinor: order.priceCents,
      currency: order.currency
    }
  });
}

export async function submitSettlementBatch(input: {
  providerId: string;
  lineIds: string[];
  payoutReference?: string | null;
}) {
  const providerId = input.providerId.trim();
  if (!providerId) {
    throw new Error("Provider ID is required");
  }

  const lines = await prisma.settlementLine.findMany({
    where: {
      id: {
        in: input.lineIds
      },
      providerId,
      status: SettlementLineStatus.PENDING
    }
  });

  if (lines.length === 0) {
    throw new Error("Settlement lines not found");
  }

  const totalAmountMinor = lines.reduce((sum, line) => sum + line.netAmountMinor - line.refundDeductionAmount + line.adjustmentAmount, 0);
  const currency = lines[0].currency;

  if (lines.some((line) => line.currency !== currency)) {
    throw new Error("Settlement batch must contain one currency");
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.settlementBatch.create({
      data: {
        providerId,
        totalAmountMinor,
        currency,
        status: SettlementBatchStatus.SUBMITTED,
        payoutReference: input.payoutReference?.trim() || null,
        submittedAt: new Date(),
        lineSnapshot: lines
      }
    });

    await tx.settlementLine.updateMany({
      where: {
        id: {
          in: lines.map((line) => line.id)
        }
      },
      data: {
        status: SettlementLineStatus.LOCKED,
        lockedAt: new Date(),
        settlementBatchId: batch.id
      }
    });

    return batch;
  });
}

export async function markSettlementBatchPaidOut(input: {
  batchId: string;
  payoutReference?: string | null;
}) {
  const batchId = input.batchId.trim();
  if (!batchId) {
    throw new Error("Batch ID is required");
  }

  const batch = await prisma.settlementBatch.findUnique({
    where: { id: batchId },
    include: {
      settlementLines: {
        select: {
          id: true,
          orderId: true
        }
      }
    }
  });

  if (!batch) {
    throw new Error("Settlement batch not found");
  }

  if (batch.status !== SettlementBatchStatus.SUBMITTED) {
    throw new Error("Settlement batch is not pending payout");
  }

  if (batch.settlementLines.length === 0) {
    throw new Error("Settlement batch has no lines");
  }

  const paidOutAt = new Date();
  const payoutReference = input.payoutReference?.trim() || batch.payoutReference || null;
  const lineIds = batch.settlementLines.map((line) => line.id);
  const orderIds = batch.settlementLines.map((line) => line.orderId);

  return prisma.$transaction(async (tx) => {
    const updatedBatch = await tx.settlementBatch.update({
      where: { id: batch.id },
      data: {
        status: SettlementBatchStatus.PAID_OUT,
        payoutReference,
        paidOutAt
      }
    });

    await tx.settlementLine.updateMany({
      where: {
        id: {
          in: lineIds
        }
      },
      data: {
        status: SettlementLineStatus.SETTLED,
        settledAt: paidOutAt
      }
    });

    await tx.serviceOrder.updateMany({
      where: {
        id: {
          in: orderIds
        }
      },
      data: {
        settledAt: paidOutAt,
        settlementReference: payoutReference
      }
    });

    return updatedBatch;
  });
}
