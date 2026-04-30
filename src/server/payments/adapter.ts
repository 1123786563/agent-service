import { PaymentStatus, ServiceOrderStatus } from "@prisma/client";
import { z } from "zod";
import { getServiceOrderById, markServiceOrderPaid, markServiceOrderPaymentFailed } from "@/server/orders/service";
import { devPaymentAdapter } from "./dev-adapter";

const paymentProviderSchema = z.string().trim().min(1);

export const paymentEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("payment.succeeded"),
    orderId: z.string().trim().min(1),
    paymentReference: z.string().trim().min(1).nullable().optional()
  }),
  z.object({
    type: z.literal("payment.failed"),
    orderId: z.string().trim().min(1),
    paymentReference: z.string().trim().min(1).nullable().optional()
  })
]);

export type PaymentEvent = z.infer<typeof paymentEventSchema>;

export type PaymentCheckoutSession = {
  provider: string;
  checkoutUrl: string;
  paymentReference: string;
};

export type PaymentAdapter = {
  provider: string;
  createPaymentSession(input: {
    orderId: string;
    paymentReference?: string | null;
  }): Promise<PaymentCheckoutSession>;
  parseWebhookRequest(request: Request): Promise<PaymentEvent>;
};

export function getPaymentProvider(defaultProvider = process.env.PAYMENT_PROVIDER ?? "dev") {
  return paymentProviderSchema.parse(defaultProvider).toLowerCase();
}

export function getPaymentAdapter(provider = getPaymentProvider()): PaymentAdapter {
  if (provider === devPaymentAdapter.provider) {
    return devPaymentAdapter;
  }

  throw new Error(`Unsupported payment provider: ${provider}`);
}

export async function createPaymentSessionForOrder(orderId: string) {
  const order = await getServiceOrderById(orderId);
  if (!order) {
    throw new Error("Service order not found");
  }

  const payableStatuses: PaymentStatus[] = [PaymentStatus.UNPAID, PaymentStatus.FAILED];
  if (order.status !== ServiceOrderStatus.PENDING_PAYMENT || !payableStatuses.includes(order.paymentStatus)) {
    throw new Error("Service order is not payable");
  }

  const adapter = getPaymentAdapter(order.paymentProvider);

  return adapter.createPaymentSession({
    orderId: order.id,
    paymentReference: order.paymentReference
  });
}

export async function applyPaymentEvent(event: PaymentEvent) {
  if (event.type === "payment.failed") {
    return markServiceOrderPaymentFailed({
      orderId: event.orderId,
      paymentReference: event.paymentReference ?? undefined
    });
  }

  return markServiceOrderPaid({
    orderId: event.orderId,
    paymentReference: event.paymentReference ?? undefined
  });
}
