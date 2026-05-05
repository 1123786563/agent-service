import { PaymentStatus, RefundStatus, ServiceOrderStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { getPaymentAdapter } from "@/server/payments/adapter";
import type { NormalizedRefundEvent } from "@/server/payments/webhook-events";
import { applySettlementRefundAdjustment } from "@/server/settlements/service";

type RequestRefundInput = {
  orderId: string;
  requestedByUserId?: string | null;
  amountMinor?: number | null;
  reason?: string | null;
  disputeId?: string | null;
  allowAfterWorkStarted?: boolean;
};

function refundStatusFromProviderStatus(status: "pending" | "succeeded" | "failed") {
  if (status === "succeeded") {
    return RefundStatus.SUCCEEDED;
  }

  if (status === "failed") {
    return RefundStatus.FAILED;
  }

  return RefundStatus.PENDING;
}

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
      workStartedAt: true,
      paymentLedgerEntries: {
        where: {
          paymentStatus: PaymentStatus.PAID
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 1,
        select: {
          providerPaymentId: true,
          providerCheckoutSessionId: true
        }
      }
    }
  });

  if (!order) {
    throw new Error("Service order not found");
  }

  if (order.paymentStatus !== PaymentStatus.PAID) {
    throw new Error("Only paid orders can be refunded");
  }

  if (order.workStartedAt && !input.allowAfterWorkStarted) {
    throw new Error("Service order has already started");
  }

  const refundableStatuses: ServiceOrderStatus[] = [
    ServiceOrderStatus.PENDING_PAYMENT,
    ServiceOrderStatus.IN_PROGRESS,
    ServiceOrderStatus.DISPUTED
  ];
  if (!refundableStatuses.includes(order.status)) {
    throw new Error("Service order cannot be automatically refunded");
  }

  const amountMinor = input.amountMinor ?? order.priceCents;
  if (amountMinor <= 0 || amountMinor > order.priceCents) {
    throw new Error("Refund amount is invalid");
  }

  const providerPaymentReference =
    order.paymentLedgerEntries[0]?.providerPaymentId ??
    order.paymentLedgerEntries[0]?.providerCheckoutSessionId ??
    order.paymentReference ??
    `manual_${order.id}`;
  const provider = getPaymentAdapter(order.paymentProvider);
  const providerRefund = await provider.refundPayment({
    orderId,
    paymentReference: providerPaymentReference,
    amountMinor,
    currency: order.currency,
    reason: input.reason ?? null
  });
  const refundStatus = refundStatusFromProviderStatus(providerRefund.status);

  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.create({
      data: {
        orderId,
        disputeId: input.disputeId ?? null,
        provider: order.paymentProvider,
        paymentReference: providerPaymentReference,
        amountMinor,
        currency: order.currency,
        status: refundStatus,
        providerRefundId: providerRefund.providerRefundId,
        providerEventId: providerRefund.providerEventId ?? null,
        failureReason: providerRefund.failureReason ?? (input.reason?.trim() || null),
        requestedByUserId: input.requestedByUserId ?? null
      }
    });

    if (refundStatus === RefundStatus.SUCCEEDED) {
      await tx.serviceOrder.update({
        where: { id: orderId },
        data: {
          status: ServiceOrderStatus.CANCELLED,
          paymentStatus: amountMinor === order.priceCents ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED
        }
      });
      await applySettlementRefundAdjustment({
        orderId,
        amountMinor,
        reason: input.reason
      }, tx);
    }

    await tx.auditLog.create({
      data: {
        actorId: input.requestedByUserId ?? null,
        actorRole: "ADMIN",
        action: "refund.create",
        targetType: "Refund",
        targetId: refund.id,
        afterSnapshot: {
          orderId,
          disputeId: input.disputeId ?? null,
          amountMinor,
          currency: order.currency,
          status: refundStatus,
          providerRefundId: providerRefund.providerRefundId
        }
      }
    });

    return refund;
  });
}

export async function applyRefundEvent(event: NormalizedRefundEvent) {
  const order = await prisma.serviceOrder.findUnique({
    where: {
      id: event.orderId
    },
    select: {
      id: true,
      priceCents: true,
      currency: true
    }
  });

  if (!order) {
    throw new Error("Service order not found");
  }

  if (event.amountMinor <= 0 || event.amountMinor > order.priceCents) {
    throw new Error("Refund amount is invalid");
  }

  if (event.currency.toUpperCase() !== order.currency.toUpperCase()) {
    throw new Error("Refund currency does not match service order");
  }

  const refundStatus = event.type === "refund.succeeded" ? RefundStatus.SUCCEEDED : RefundStatus.FAILED;

  return prisma.$transaction(async (tx) => {
    const existingRefund = await tx.refund.findFirst({
      where: {
        OR: [
          {
            providerEventId: event.providerEventId
          },
          {
            providerRefundId: event.providerRefundId
          }
        ]
      },
      include: {
        order: true
      }
    });

    if (existingRefund?.providerEventId === event.providerEventId) {
      return existingRefund;
    }

    const refund = existingRefund
      ? await tx.refund.update({
          where: {
            id: existingRefund.id
          },
          data: {
            status: refundStatus,
            providerEventId: event.providerEventId,
            failureReason: event.failureReason ?? existingRefund.failureReason,
            completedAt: refundStatus === RefundStatus.SUCCEEDED ? new Date() : existingRefund.completedAt
          },
          include: {
            order: true
          }
        })
      : await tx.refund.create({
          data: {
            orderId: event.orderId,
            provider: event.provider,
            paymentReference: event.paymentReference ?? event.providerPaymentId ?? event.providerRefundId,
            amountMinor: event.amountMinor,
            currency: event.currency.toUpperCase(),
            status: refundStatus,
            providerRefundId: event.providerRefundId,
            providerEventId: event.providerEventId,
            failureReason: event.failureReason ?? null,
            completedAt: refundStatus === RefundStatus.SUCCEEDED ? new Date() : null
          },
          include: {
            order: true
          }
        });

    let updatedOrder = refund.order;
    if (refundStatus === RefundStatus.SUCCEEDED) {
      updatedOrder = await tx.serviceOrder.update({
        where: {
          id: event.orderId
        },
        data: {
          status: ServiceOrderStatus.CANCELLED,
          paymentStatus: event.amountMinor === order.priceCents ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED
        }
      });
      await applySettlementRefundAdjustment({
        orderId: event.orderId,
        amountMinor: event.amountMinor,
        reason: "refund_webhook"
      }, tx);
    }

    await tx.auditLog.create({
      data: {
        actorRole: "SYSTEM",
        action: "refund.webhook.processed",
        targetType: "Refund",
        targetId: refund.id,
        afterSnapshot: {
          provider: event.provider,
          providerEventId: event.providerEventId,
          providerRefundId: event.providerRefundId,
          type: event.type,
          status: refundStatus
        }
      }
    });

    return {
      ...refund,
      order: updatedOrder
    };
  });
}
