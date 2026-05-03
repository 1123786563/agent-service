import { PaymentStatus, ServiceOrderStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({
  getCurrentUser: vi.fn()
}));

vi.mock("@/server/orders/service", () => ({
  getServiceOrderById: vi.fn()
}));

vi.mock("@/server/disputes/service", () => ({
  createDispute: vi.fn()
}));

import { POST } from "@/app/api/orders/[id]/dispute/route";
import { getCurrentUser } from "@/server/auth/session";
import { createDispute } from "@/server/disputes/service";
import { getServiceOrderById } from "@/server/orders/service";

describe("dispute order route", () => {
  it("redirects anonymous users to login", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/orders/order-1/dispute", {
      method: "POST"
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("lets the buyer mark an order as disputed", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "buyer-1",
      email: "buyer@example.com",
      role: "USER"
    } as never);
    vi.mocked(getServiceOrderById).mockResolvedValue({
      id: "order-1",
      providerId: "creator-1",
      buyerEmail: "buyer@example.com",
      status: ServiceOrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PAID
    } as never);
    vi.mocked(createDispute).mockResolvedValue({
      id: "order-1",
      status: "OPEN"
    } as never);

    const response = await POST(new Request("http://localhost/api/orders/order-1/dispute", {
      method: "POST"
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(createDispute).toHaveBeenCalledWith({
      orderId: "order-1",
      openedByUserId: "buyer-1",
      reason: "User requested dispute from order screen"
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/account/orders");
  });

  it("rejects dispute attempts from unrelated users", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "buyer-1",
      email: "buyer@example.com",
      role: "USER"
    } as never);
    vi.mocked(getServiceOrderById).mockResolvedValue({
      id: "order-1",
      providerId: "creator-1",
      buyerEmail: "other@example.com",
      status: ServiceOrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PAID
    } as never);

    const response = await POST(new Request("http://localhost/api/orders/order-1/dispute", {
      method: "POST"
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      errors: ["Order access is required"]
    });
  });
});
