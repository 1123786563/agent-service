import { PaymentStatus, ServiceOrderStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({
  getCurrentUser: vi.fn()
}));

vi.mock("@/server/orders/service", () => ({
  getServiceOrderById: vi.fn(),
  cancelServiceOrder: vi.fn()
}));

import { POST } from "@/app/api/orders/[id]/cancel/route";
import { getCurrentUser } from "@/server/auth/session";
import { cancelServiceOrder, getServiceOrderById } from "@/server/orders/service";

describe("cancel order route", () => {
  it("redirects anonymous users to login", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/orders/order-1/cancel", {
      method: "POST"
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("lets the buyer cancel an unpaid order", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      email: "buyer@example.com"
    } as never);
    vi.mocked(getServiceOrderById).mockResolvedValue({
      id: "order-1",
      buyerEmail: "buyer@example.com",
      status: ServiceOrderStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.UNPAID
    } as never);
    vi.mocked(cancelServiceOrder).mockResolvedValue({
      id: "order-1",
      status: ServiceOrderStatus.CANCELLED
    } as never);

    const response = await POST(new Request("http://localhost/api/orders/order-1/cancel", {
      method: "POST"
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(cancelServiceOrder).toHaveBeenCalledWith({
      orderId: "order-1"
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/account/orders");
  });

  it("rejects cancellation attempts from unrelated users", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      email: "buyer@example.com"
    } as never);
    vi.mocked(getServiceOrderById).mockResolvedValue({
      id: "order-1",
      buyerEmail: "other@example.com",
      status: ServiceOrderStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.UNPAID
    } as never);

    const response = await POST(new Request("http://localhost/api/orders/order-1/cancel", {
      method: "POST"
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      errors: ["Buyer access is required"]
    });
  });
});
