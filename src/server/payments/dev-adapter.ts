import crypto from "node:crypto";
import { z } from "zod";
import type { CreateCheckoutSessionInput, PaymentProvider } from "./adapter";
import type { NormalizedPaymentEvent } from "./webhook-events";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

const devWebhookPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("payment.succeeded"),
    provider: z.literal("dev").default("dev"),
    providerEventId: z.string().trim().min(1),
    orderId: z.string().trim().min(1),
    amountMinor: z.number().int().positive().optional(),
    currency: z.string().trim().length(3).optional(),
    paymentReference: z.string().trim().min(1).nullable().optional()
  }),
  z.object({
    type: z.literal("payment.failed"),
    provider: z.literal("dev").default("dev"),
    providerEventId: z.string().trim().min(1),
    orderId: z.string().trim().min(1),
    amountMinor: z.number().int().positive().optional(),
    currency: z.string().trim().length(3).optional(),
    paymentReference: z.string().trim().min(1).nullable().optional()
  }),
  z.object({
    type: z.literal("payment.cancelled"),
    provider: z.literal("dev").default("dev"),
    providerEventId: z.string().trim().min(1),
    orderId: z.string().trim().min(1),
    amountMinor: z.number().int().positive().optional(),
    currency: z.string().trim().length(3).optional(),
    paymentReference: z.string().trim().min(1).nullable().optional()
  })
]);

function createDevPaymentReference() {
  return `devpay_${crypto.randomUUID()}`;
}

function createProviderEventId() {
  return `evt_${crypto.randomUUID()}`;
}

export function createDevCheckoutUrl(orderId: string, paymentReference: string) {
  const url = new URL("/api/payments/dev/complete", appUrl);
  url.searchParams.set("orderId", orderId);
  url.searchParams.set("paymentReference", paymentReference);
  return url.toString();
}

function normalizeDevEvent(input: {
  type: NormalizedPaymentEvent["type"];
  orderId: string;
  paymentReference?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
}): NormalizedPaymentEvent {
  return {
    type: input.type,
    provider: "dev",
    providerEventId: createProviderEventId(),
    orderId: z.string().trim().min(1).parse(input.orderId),
    paymentReference: input.paymentReference?.trim() || createDevPaymentReference(),
    amountMinor: input.amountMinor ?? null,
    currency: input.currency?.trim().toUpperCase() || null,
    rawPayload: {
      type: input.type,
      orderId: input.orderId,
      paymentReference: input.paymentReference ?? null,
      amountMinor: input.amountMinor ?? null,
      currency: input.currency ?? null
    }
  };
}

export function createDevPaymentSucceededEvent(input: {
  orderId: string;
  paymentReference?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
}) {
  return normalizeDevEvent({
    type: "payment.succeeded",
    orderId: input.orderId,
    paymentReference: input.paymentReference,
    amountMinor: input.amountMinor,
    currency: input.currency
  });
}

export function createDevPaymentFailedEvent(input: {
  orderId: string;
  paymentReference?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
}) {
  return normalizeDevEvent({
    type: "payment.failed",
    orderId: input.orderId,
    paymentReference: input.paymentReference,
    amountMinor: input.amountMinor,
    currency: input.currency
  });
}

export function createDevPaymentCancelledEvent(input: {
  orderId: string;
  paymentReference?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
}) {
  return normalizeDevEvent({
    type: "payment.cancelled",
    orderId: input.orderId,
    paymentReference: input.paymentReference,
    amountMinor: input.amountMinor,
    currency: input.currency
  });
}

export const devPaymentAdapter: PaymentProvider = {
  provider: "dev",
  async createCheckoutSession(input: CreateCheckoutSessionInput) {
    const paymentReference = input.paymentReference?.trim() || createDevPaymentReference();

    return {
      provider: "dev",
      checkoutUrl: createDevCheckoutUrl(input.orderId, paymentReference),
      paymentReference
    };
  },
  async parseWebhook(request) {
    const payload = devWebhookPayloadSchema.parse(await request.json());
    return {
      type: payload.type,
      provider: payload.provider,
      providerEventId: payload.providerEventId,
      orderId: payload.orderId,
      paymentReference: payload.paymentReference ?? null,
      amountMinor: payload.amountMinor ?? null,
      currency: payload.currency?.trim().toUpperCase() ?? null,
      rawPayload: payload
    } satisfies NormalizedPaymentEvent;
  }
};
