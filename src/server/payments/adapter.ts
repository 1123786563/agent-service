import { PaymentStatus, ServiceOrderStatus } from "@prisma/client";
import { z } from "zod";
import { recordAuditLog } from "@/server/audit/service";
import {
  getServiceOrderById,
  markServiceOrderPaid,
  markServiceOrderPaymentCancelled,
  markServiceOrderPaymentFailed,
  ConcurrentModificationError
} from "@/server/orders/service";
import { recordPaymentEvent } from "./ledger";
import { devPaymentAdapter } from "./dev-adapter";
import { StripePaymentProvider } from "./stripe-adapter";
import {
  paymentStatusFromEventType,
  type NormalizedPaymentEvent,
  type NormalizedProviderEvent
} from "./webhook-events";

const paymentProviderSchema = z.string().trim().min(1);

export type PaymentCheckoutSession = {
  provider: string;
  checkoutUrl: string;
  paymentReference: string;
};

export type CreateCheckoutSessionInput = {
  orderId: string;
  amountMinor: number;
  currency: string;
  paymentReference?: string | null;
};

export type RefundPaymentInput = {
  orderId: string;
  paymentReference: string;
  amountMinor: number;
  currency: string;
  reason?: string | null;
};

export type RefundPaymentResult = {
  provider: string;
  providerRefundId: string;
  providerEventId?: string | null;
  status: "pending" | "succeeded" | "failed";
  failureReason?: string | null;
  rawPayload?: unknown;
};

export interface PaymentProvider {
  provider: string;
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<PaymentCheckoutSession>;
  parseWebhook(request: Request): Promise<NormalizedProviderEvent>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
}

export function getPaymentProvider(defaultProvider = process.env.PAYMENT_PROVIDER ?? "dev") {
  return paymentProviderSchema.parse(defaultProvider).toLowerCase();
}

export function getPaymentAdapter(provider = getPaymentProvider()): PaymentProvider {
  if (provider === devPaymentAdapter.provider) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Dev payment adapter is not available in production");
    }
    return devPaymentAdapter;
  }

  if (provider === StripePaymentProvider.providerName) {
    return new StripePaymentProvider();
  }

  throw new Error(`Unsupported payment provider: ${provider}`);
}

export async function createPaymentSessionForOrder(orderId: string) {
  const order = await getServiceOrderById(orderId);
  if (!order) {
    throw new Error("Service order not found");
  }

  const payableStatuses: PaymentStatus[] = [PaymentStatus.UNPAID, PaymentStatus.FAILED, PaymentStatus.CANCELLED];
  if (order.status !== ServiceOrderStatus.PENDING_PAYMENT || !payableStatuses.includes(order.paymentStatus)) {
    throw new Error("Service order is not payable");
  }

  const adapter = getPaymentAdapter(order.paymentProvider);

  return adapter.createCheckoutSession({
    orderId: order.id,
    amountMinor: order.priceCents,
    currency: order.currency,
    paymentReference: order.paymentReference
  });
}

async function validateNormalizedPaymentEvent(event: NormalizedPaymentEvent) {
  const order = await getServiceOrderById(event.orderId);
  if (!order) {
    throw new Error("Service order not found");
  }

  if (event.amountMinor != null && event.amountMinor !== order.priceCents) {
    throw new Error("Payment amount does not match service order");
  }

  if (event.currency && event.currency.toUpperCase() !== order.currency.toUpperCase()) {
    throw new Error("Payment currency does not match service order");
  }

  return order;
}

export async function applyPaymentEvent(event: NormalizedPaymentEvent) {
  const order = await validateNormalizedPaymentEvent(event);
  const ledgerResult = await recordPaymentEvent({
    orderId: event.orderId,
    provider: event.provider,
    providerEventId: event.providerEventId,
    providerPaymentId: event.providerPaymentId ?? null,
    providerCheckoutSessionId: event.providerCheckoutSessionId ?? null,
    amountMinor: event.amountMinor ?? order.priceCents,
    currency: event.currency?.toUpperCase() ?? order.currency,
    paymentStatus: paymentStatusFromEventType(event.type),
    failureReason: event.failureReason ?? null,
    idempotencyKey: event.idempotencyKey ?? null,
    rawPayload: event.rawPayload
  });

  if (ledgerResult.duplicate) {
    return order;
  }

  let updatedOrder;
  if (event.type === "payment.failed") {
    try {
      updatedOrder = await markServiceOrderPaymentFailed({
        orderId: event.orderId,
        paymentReference: event.paymentReference ?? undefined
      });
    } catch (error) {
      if (error instanceof ConcurrentModificationError) {
        updatedOrder = await getServiceOrderById(event.orderId);
        await recordAuditLog({
          actorRole: "SYSTEM",
          action: "payment.webhook.concurrent_modification",
          targetType: "ServiceOrder",
          targetId: event.orderId,
          afterSnapshot: { provider: event.provider, providerEventId: event.providerEventId, type: event.type, note: "concurrent modification" }
        });
        return updatedOrder ?? order;
      }
      throw error;
    }
  } else if (event.type === "payment.cancelled") {
    try {
      updatedOrder = await markServiceOrderPaymentCancelled({
        orderId: event.orderId,
        paymentReference: event.paymentReference ?? undefined
      });
    } catch (error) {
      if (error instanceof ConcurrentModificationError) {
        updatedOrder = await getServiceOrderById(event.orderId);
        await recordAuditLog({
          actorRole: "SYSTEM",
          action: "payment.webhook.concurrent_modification",
          targetType: "ServiceOrder",
          targetId: event.orderId,
          afterSnapshot: { provider: event.provider, providerEventId: event.providerEventId, type: event.type, note: "concurrent modification" }
        });
        return updatedOrder ?? order;
      }
      throw error;
    }
  } else {
    try {
      updatedOrder = await markServiceOrderPaid({
        orderId: event.orderId,
        paymentReference: event.paymentReference ?? undefined
      });
    } catch (error) {
      if (error instanceof ConcurrentModificationError) {
        updatedOrder = await getServiceOrderById(event.orderId);
        await recordAuditLog({
          actorRole: "SYSTEM",
          action: "payment.webhook.concurrent_modification",
          targetType: "ServiceOrder",
          targetId: event.orderId,
          afterSnapshot: { provider: event.provider, providerEventId: event.providerEventId, type: event.type, note: "concurrent modification" }
        });
        return updatedOrder ?? order;
      }
      throw error;
    }
  }

  await recordAuditLog({
    actorRole: "SYSTEM",
    action: "payment.webhook.processed",
    targetType: "ServiceOrder",
    targetId: event.orderId,
    afterSnapshot: {
      provider: event.provider,
      providerEventId: event.providerEventId,
      type: event.type,
      paymentStatus: paymentStatusFromEventType(event.type)
    }
  });

  return updatedOrder;
}
