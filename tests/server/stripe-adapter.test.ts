import { describe, expect, it, vi } from "vitest";
import { StripePaymentProvider } from "@/server/payments/stripe-adapter";

function createMockStripeClient() {
  return {
    checkout: {
      sessions: {
        create: vi.fn()
      }
    },
    refunds: {
      create: vi.fn()
    },
    webhooks: {
      constructEvent: vi.fn()
    }
  };
}

describe("StripePaymentProvider", () => {
  it("creates a Stripe checkout session with order metadata", async () => {
    const client = createMockStripeClient();
    client.checkout.sessions.create.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123"
    });
    const provider = new StripePaymentProvider({
      secretKey: "sk_test_123",
      appUrl: "https://market.example.com"
    }, client as never);

    const session = await provider.createCheckoutSession({
      orderId: "order-1",
      amountMinor: 2500,
      currency: "USD",
      paymentReference: "stripe_ref_1"
    });

    expect(client.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      mode: "payment",
      client_reference_id: "order-1",
      success_url: "https://market.example.com/account/orders?payment=success&orderId=order-1",
      cancel_url: "https://market.example.com/account/orders?payment=cancelled&orderId=order-1",
      metadata: {
        orderId: "order-1",
        paymentReference: "stripe_ref_1",
        provider: "stripe"
      },
      payment_intent_data: {
        metadata: {
          orderId: "order-1",
          paymentReference: "stripe_ref_1",
          provider: "stripe"
        }
      }
    }));
    expect(client.checkout.sessions.create.mock.calls[0][0].line_items[0].price_data).toEqual({
      currency: "usd",
      unit_amount: 2500,
      product_data: {
        name: "Service order order-1"
      }
    });
    expect(session).toEqual({
      provider: "stripe",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
      paymentReference: "stripe_ref_1"
    });
  });

  it("normalizes a completed checkout session webhook", async () => {
    const client = createMockStripeClient();
    client.webhooks.constructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      request: {
        idempotency_key: "idem_1"
      },
      data: {
        object: {
          id: "cs_test_123",
          client_reference_id: "order-1",
          payment_intent: "pi_123",
          amount_total: 2500,
          currency: "usd",
          metadata: {
            orderId: "order-1",
            paymentReference: "stripe_ref_1"
          }
        }
      }
    });
    const provider = new StripePaymentProvider({
      webhookSecret: "whsec_123"
    }, client as never);

    const event = await provider.parseWebhook(new Request("http://localhost/api/payments/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "t=123,v1=abc"
      },
      body: JSON.stringify({ id: "evt_1" })
    }));

    expect(client.webhooks.constructEvent).toHaveBeenCalledWith(
      JSON.stringify({ id: "evt_1" }),
      "t=123,v1=abc",
      "whsec_123"
    );
    expect(event).toMatchObject({
      type: "payment.succeeded",
      provider: "stripe",
      providerEventId: "evt_1",
      orderId: "order-1",
      paymentReference: "stripe_ref_1",
      providerPaymentId: "pi_123",
      providerCheckoutSessionId: "cs_test_123",
      amountMinor: 2500,
      currency: "USD",
      idempotencyKey: "idem_1"
    });
  });

  it("normalizes a failed payment intent webhook", async () => {
    const client = createMockStripeClient();
    client.webhooks.constructEvent.mockReturnValue({
      id: "evt_2",
      type: "payment_intent.payment_failed",
      request: null,
      data: {
        object: {
          id: "pi_456",
          amount: 3400,
          currency: "usd",
          metadata: {
            orderId: "order-2",
            paymentReference: "stripe_ref_2"
          },
          last_payment_error: {
            message: "Your card was declined."
          }
        }
      }
    });
    const provider = new StripePaymentProvider({
      webhookSecret: "whsec_123"
    }, client as never);

    const event = await provider.parseWebhook(new Request("http://localhost/api/payments/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "t=123,v1=def"
      },
      body: "{}"
    }));

    expect(event).toMatchObject({
      type: "payment.failed",
      provider: "stripe",
      providerEventId: "evt_2",
      orderId: "order-2",
      paymentReference: "stripe_ref_2",
      providerPaymentId: "pi_456",
      amountMinor: 3400,
      currency: "USD",
      failureReason: "Your card was declined."
    });
  });

  it("normalizes a succeeded refund webhook", async () => {
    const client = createMockStripeClient();
    client.webhooks.constructEvent.mockReturnValue({
      id: "evt_refund_1",
      type: "refund.updated",
      request: {
        idempotency_key: "idem_refund_1"
      },
      data: {
        object: {
          id: "re_123",
          payment_intent: "pi_123",
          amount: 1200,
          currency: "usd",
          status: "succeeded",
          failure_reason: null,
          metadata: {
            orderId: "order-1",
            paymentReference: "pi_123"
          }
        }
      }
    });
    const provider = new StripePaymentProvider({
      webhookSecret: "whsec_123"
    }, client as never);

    const event = await provider.parseWebhook(new Request("http://localhost/api/payments/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "t=123,v1=refund"
      },
      body: "{}"
    }));

    expect(event).toMatchObject({
      type: "refund.succeeded",
      provider: "stripe",
      providerEventId: "evt_refund_1",
      orderId: "order-1",
      paymentReference: "pi_123",
      providerPaymentId: "pi_123",
      providerRefundId: "re_123",
      amountMinor: 1200,
      currency: "USD",
      idempotencyKey: "idem_refund_1"
    });
  });

  it("creates Stripe refunds with order metadata", async () => {
    const client = createMockStripeClient();
    client.refunds.create.mockResolvedValue({
      id: "re_123",
      status: "succeeded",
      failure_reason: null
    });
    const provider = new StripePaymentProvider({
      secretKey: "sk_test_123"
    }, client as never);

    const refund = await provider.refundPayment({
      orderId: "order-1",
      paymentReference: "pi_123",
      amountMinor: 1200,
      currency: "USD",
      reason: "admin arbitration"
    });

    expect(client.refunds.create).toHaveBeenCalledWith({
      payment_intent: "pi_123",
      amount: 1200,
      metadata: {
        orderId: "order-1",
        paymentReference: "pi_123",
        currency: "USD",
        reason: "admin arbitration"
      }
    });
    expect(refund).toMatchObject({
      provider: "stripe",
      providerRefundId: "re_123",
      status: "succeeded"
    });
  });

  it("rejects Stripe webhooks without a signature header", async () => {
    const provider = new StripePaymentProvider({
      webhookSecret: "whsec_123"
    }, createMockStripeClient() as never);

    await expect(provider.parseWebhook(new Request("http://localhost/api/payments/webhook", {
      method: "POST",
      body: "{}"
    }))).rejects.toThrow("Stripe-Signature header is required");
  });
});
