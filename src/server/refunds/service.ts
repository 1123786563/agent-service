import { PaymentStatus, RefundStatus, ServiceOrderStatus } from "@prisma/client";
import { prisma } from "@/server/db";

type RequestRefundInput = {
  orderId: string;
  requestedByUserId?: string | null;
  amountMinor?: number | null;
  reason?: string | null;
  disputeId?: string | null;
};

export async function requestRefund(input: RequestRefundInput) {
  const orderId = input.orderId.trim();
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      priceCents: true,
      currency: true,
      status: true,
      paymentStatus: true,
      paymentProvider: true,
      paymentReference: true,
      workStartedAt: true
    }
  });

  if (!order) {
    throw new Error("Service order not found");
  }

  if (order.paymentStatus !== PaymentStatus.PAID) {
    throw new Error("Only paid orders can be refunded");
  }

  if (order.workStartedAt) {
    throw new Error("Service order has already started");
  }

  if (order.status !== ServiceOrderStatus.PENDING_PAYMENT && order.status !== ServiceOrderStatus.IN_PROGRESS) {
    throw new Error("Service order cannot be automatically refunded");
  }

  const amountMinor = input.amountMinor ?? order.priceCents;
  if (amountMinor <= 0 || amountMinor > order.priceCents) {
    throw new Error("Refund amount is invalid");
  }

  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.create({
      data: {
        orderId,
        disputeId: input.disputeId ?? null,
        provider: order.paymentProvider,
        paymentReference: order.paymentReference ?? `manual_${order.id}`,
        amountMinor,
        currency: order.currency,
        status: RefundStatus.PENDING,
        failureReason: input.reason?.trim() || null,
        requestedByUserId: input.requestedByUserId ?? null
      }
    });

    await tx.serviceOrder.update({
      where: { id: orderId },
      data: {
        status: ServiceOrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.REFUNDED
      }
    });

    return refund;
  });
}
