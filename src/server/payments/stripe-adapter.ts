import crypto from "node:crypto";
import Stripe from "stripe";
import type {
  CreateCheckoutSessionInput,
  PaymentCheckoutSession,
  PaymentProvider,
  RefundPaymentInput,
  RefundPaymentResult
} from "./adapter";
import type { NormalizedProviderEvent } from "./webhook-events";

type StripeClient = Pick<Stripe, "checkout" | "refunds" | "webhooks">;

type StripePaymentProviderConfig = {
  secretKey?: string;
  webhookSecret?: string;
  appUrl?: string;
};

function getRequiredConfigValue(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is required for Stripe payments`);
  }

  return normalized;
}

function getAppUrl(value = process.env.APP_URL) {
  return value?.trim() || "http://localhost:3000";
}

function createStripePaymentReference() {
  return `stripe_${crypto.randomUUID()}`;
}

function normalizeCurrency(currency: string) {
  return currency.trim().toLowerCase();
}

function getStringId(value: string | { id: string } | null | undefined) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id;
}

function getMetadataValue(metadata: Stripe.Metadata | null | undefined, key: string) {
  return metadata?.[key]?.trim() || null;
}

function assertMetadataOrderId(orderId: string | null) {
  if (!orderId) {
    throw new Error("Stripe event is missing order metadata");
  }

  return orderId;
}

export class StripePaymentProvider implements PaymentProvider {
  static providerName = "stripe";
  provider = StripePaymentProvider.providerName;

  private readonly config: StripePaymentProviderConfig;
  private readonly injectedClient?: StripeClient;

  constructor(config: StripePaymentProviderConfig = {}, client?: StripeClient) {
    this.config = config;
    this.injectedClient = client;
  }

  private get client() {
    if (this.injectedClient) {
      return this.injectedClient;
    }

    return new Stripe(getRequiredConfigValue(this.config.secretKey ?? process.env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY"));
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<PaymentCheckoutSession> {
    const paymentReference = input.paymentReference?.trim() || createStripePaymentReference();
    const appUrl = getAppUrl(this.config.appUrl);
    const successUrl = new URL("/account/orders", appUrl);
    successUrl.searchParams.set("payment", "success");
    successUrl.searchParams.set("orderId", input.orderId);
    const cancelUrl = new URL("/account/orders", appUrl);
    cancelUrl.searchParams.set("payment", "cancelled");
    cancelUrl.searchParams.set("orderId", input.orderId);

    const session = await this.client.checkout.sessions.create({
      mode: "payment",
      client_reference_id: input.orderId,
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: normalizeCurrency(input.currency),
            unit_amount: input.amountMinor,
            product_data: {
              name: `Service order ${input.orderId}`
            }
          }
        }
      ],
      metadata: {
        orderId: input.orderId,
        paymentReference,
        provider: this.provider
      },
      payment_intent_data: {
        metadata: {
          orderId: input.orderId,
          paymentReference,
          provider: this.provider
        }
      }
    });

    if (!session.url) {
      throw new Error("Stripe checkout session did not return a URL");
    }

    return {
      provider: this.provider,
      checkoutUrl: session.url,
      paymentReference
    };
  }

  async parseWebhook(request: Request): Promise<NormalizedProviderEvent> {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      throw new Error("Stripe-Signature header is required");
    }

    const webhookSecret = getRequiredConfigValue(
      this.config.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET,
      "STRIPE_WEBHOOK_SECRET"
    );
    const rawBody = await request.text();
    const event = this.client.webhooks.constructEvent(rawBody, signature, webhookSecret);

    return this.normalizeWebhookEvent(event);
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    const refund = await this.client.refunds.create({
      payment_intent: input.paymentReference,
      amount: input.amountMinor,
      metadata: {
        orderId: input.orderId,
        paymentReference: input.paymentReference,
        currency: input.currency,
        reason: input.reason ?? ""
      }
    });

    const status = refund.status === "succeeded"
      ? "succeeded"
      : refund.status === "failed"
        ? "failed"
        : "pending";

    return {
      provider: this.provider,
      providerRefundId: refund.id,
      providerEventId: null,
      status,
      failureReason: refund.failure_reason ?? null,
      rawPayload: refund
    };
  }

  private normalizeWebhookEvent(event: Stripe.Event): NormalizedProviderEvent {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = assertMetadataOrderId(getMetadataValue(session.metadata, "orderId") ?? session.client_reference_id);
      const paymentReference = getMetadataValue(session.metadata, "paymentReference") ?? session.id;

      return {
        type: "payment.succeeded",
        provider: this.provider,
        providerEventId: event.id,
        orderId,
        paymentReference,
        providerPaymentId: getStringId(session.payment_intent),
        providerCheckoutSessionId: session.id,
        amountMinor: session.amount_total ?? null,
        currency: session.currency?.toUpperCase() ?? null,
        idempotencyKey: event.request?.idempotency_key ?? null,
        rawPayload: event
      };
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = assertMetadataOrderId(getMetadataValue(session.metadata, "orderId") ?? session.client_reference_id);
      const paymentReference = getMetadataValue(session.metadata, "paymentReference") ?? session.id;

      return {
        type: "payment.cancelled",
        provider: this.provider,
        providerEventId: event.id,
        orderId,
        paymentReference,
        providerPaymentId: getStringId(session.payment_intent),
        providerCheckoutSessionId: session.id,
        amountMinor: session.amount_total ?? null,
        currency: session.currency?.toUpperCase() ?? null,
        idempotencyKey: event.request?.idempotency_key ?? null,
        rawPayload: event
      };
    }

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const orderId = assertMetadataOrderId(getMetadataValue(paymentIntent.metadata, "orderId"));
      const paymentReference = getMetadataValue(paymentIntent.metadata, "paymentReference") ?? paymentIntent.id;

      return {
        type: "payment.succeeded",
        provider: this.provider,
        providerEventId: event.id,
        orderId,
        paymentReference,
        providerPaymentId: paymentIntent.id,
        amountMinor: paymentIntent.amount_received || paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase(),
        idempotencyKey: event.request?.idempotency_key ?? null,
        rawPayload: event
      };
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const orderId = assertMetadataOrderId(getMetadataValue(paymentIntent.metadata, "orderId"));
      const paymentReference = getMetadataValue(paymentIntent.metadata, "paymentReference") ?? paymentIntent.id;

      return {
        type: "payment.failed",
        provider: this.provider,
        providerEventId: event.id,
        orderId,
        paymentReference,
        providerPaymentId: paymentIntent.id,
        amountMinor: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase(),
        failureReason: paymentIntent.last_payment_error?.message ?? paymentIntent.last_payment_error?.code ?? null,
        idempotencyKey: event.request?.idempotency_key ?? null,
        rawPayload: event
      };
    }

    if (event.type === "refund.updated" || event.type === "refund.failed") {
      const refund = event.data.object as Stripe.Refund;
      const orderId = assertMetadataOrderId(getMetadataValue(refund.metadata, "orderId"));
      const paymentReference = getMetadataValue(refund.metadata, "paymentReference") ?? getStringId(refund.payment_intent);
      const isFailed = event.type === "refund.failed" || refund.status === "failed";

      return {
        type: isFailed ? "refund.failed" : "refund.succeeded",
        provider: this.provider,
        providerEventId: event.id,
        orderId,
        paymentReference,
        providerPaymentId: getStringId(refund.payment_intent),
        providerRefundId: refund.id,
        amountMinor: refund.amount,
        currency: refund.currency.toUpperCase(),
        failureReason: refund.failure_reason ?? null,
        idempotencyKey: event.request?.idempotency_key ?? null,
        rawPayload: event
      };
    }

    throw new Error(`Unsupported Stripe webhook event: ${event.type}`);
  }
}
