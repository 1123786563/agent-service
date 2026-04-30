import { PaymentStatus, ServiceOrderStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({
  getCurrentUser: vi.fn()
}));

vi.mock("@/server/orders/service", () => ({
  getServiceOrderById: vi.fn(),
  markServiceOrderPaid: vi.fn()
}));

import { POST as createPaymentSessionRoute } from "@/app/api/orders/[id]/pay/route";
import { GET as completeDevPaymentRoute } from "@/app/api/payments/dev/complete/route";
import { POST as paymentWebhookRoute } from "@/app/api/payments/webhook/route";
import { getCurrentUser } from "@/server/auth/session";
import { getServiceOrderById, markServiceOrderPaid } from "@/server/orders/service";

describe("payment routes", () => {
  it("redirects a buyer into the dev checkout flow for a payable order", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      email: "buyer@example.com"
    } as never);
    vi.mocked(getServiceOrderById).mockResolvedValue({
      id: "order-1",
      buyerEmail: "buyer@example.com",
      status: ServiceOrderStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.UNPAID,
      paymentProvider: "dev",
      paymentReference: null
    } as never);

    const response = await createPaymentSessionRoute(new Request("http://localhost/api/orders/order-1/pay", {
      method: "POST"
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/api/payments/dev/complete?");
  });

  it("rejects payment attempts for orders owned by another buyer", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      email: "buyer@example.com"
    } as never);
    vi.mocked(getServiceOrderById).mockResolvedValue({
      id: "order-1",
      buyerEmail: "other@example.com",
      status: ServiceOrderStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.UNPAID,
      paymentProvider: "dev",
      paymentReference: null
    } as never);

    const response = await createPaymentSessionRoute(new Request("http://localhost/api/orders/order-1/pay", {
      method: "POST"
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      errors: ["Buyer access is required"]
    });
  });

  it("applies a dev webhook success event through the shared payment path", async () => {
    vi.mocked(markServiceOrderPaid).mockResolvedValue({
      id: "order-1",
      status: ServiceOrderStatus.IN_PROGRESS,
      paymentStatus: PaymentStatus.PAID
    } as never);

    const response = await paymentWebhookRoute(new Request("http://localhost/api/payments/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "payment.succeeded",
        orderId: "order-1",
        paymentReference: "devpay_123"
      })
    }));

    expect(markServiceOrderPaid).toHaveBeenCalledWith({
      orderId: "order-1",
      paymentReference: "devpay_123"
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      type: "payment.succeeded",
      orderId: "order-1",
      orderStatus: ServiceOrderStatus.IN_PROGRESS,
      paymentStatus: PaymentStatus.PAID
    });
  });

  it("completes a dev payment and moves the order into progress", async () => {
    vi.mocked(markServiceOrderPaid).mockResolvedValue({
      id: "order-1",
      status: ServiceOrderStatus.IN_PROGRESS,
      paymentStatus: PaymentStatus.PAID
    } as never);

    const response = await completeDevPaymentRoute(
      new Request("http://localhost/api/payments/dev/complete?orderId=order-1&paymentReference=devpay_123")
    );

    expect(markServiceOrderPaid).toHaveBeenCalledWith({
      orderId: "order-1",
      paymentReference: "devpay_123"
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      orderId: "order-1",
      orderStatus: ServiceOrderStatus.IN_PROGRESS,
      paymentStatus: PaymentStatus.PAID
    });
  });
});
