import crypto from "node:crypto";
import { z } from "zod";
import type { PaymentAdapter, PaymentEvent } from "./adapter";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

const devWebhookPayloadSchema = z.discriminatedUnion("type", [
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

function createDevPaymentReference() {
  return `devpay_${crypto.randomUUID()}`;
}

export function createDevCheckoutUrl(orderId: string, paymentReference: string) {
  const url = new URL("/api/payments/dev/complete", appUrl);
  url.searchParams.set("orderId", orderId);
  url.searchParams.set("paymentReference", paymentReference);
  return url.toString();
}

export function createDevPaymentSucceededEvent(input: {
  orderId: string;
  paymentReference?: string | null;
}): PaymentEvent {
  return {
    type: "payment.succeeded",
    orderId: z.string().trim().min(1).parse(input.orderId),
    paymentReference: input.paymentReference?.trim() || createDevPaymentReference()
  };
}

export const devPaymentAdapter: PaymentAdapter = {
  provider: "dev",
  async createPaymentSession(input) {
    const event = createDevPaymentSucceededEvent(input);

    return {
      provider: "dev",
      checkoutUrl: createDevCheckoutUrl(event.orderId, event.paymentReference ?? createDevPaymentReference()),
      paymentReference: event.paymentReference ?? createDevPaymentReference()
    };
  },
  async parseWebhookRequest(request) {
    const payload = await request.json();
    return devWebhookPayloadSchema.parse(payload);
  }
};
