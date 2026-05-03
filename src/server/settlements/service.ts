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
