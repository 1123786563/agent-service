import type { CreateCheckoutSessionInput, PaymentCheckoutSession, PaymentProvider } from "./adapter";
import type { NormalizedPaymentEvent } from "./webhook-events";

export class StripePaymentProvider implements PaymentProvider {
  static providerName = "stripe";
  provider = StripePaymentProvider.providerName;

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<PaymentCheckoutSession> {
    void input;
    throw new Error("Stripe provider is not configured");
  }

  async parseWebhook(request: Request): Promise<NormalizedPaymentEvent> {
    void request;
    throw new Error("Stripe provider is not configured");
  }
}
