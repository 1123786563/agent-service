import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({
  getCurrentUser: vi.fn()
}));

vi.mock("@/server/deliveries/service", () => ({
  acceptLatestDelivery: vi.fn()
}));

import { POST } from "@/app/api/orders/[id]/complete/route";
import { getCurrentUser } from "@/server/auth/session";
import { acceptLatestDelivery } from "@/server/deliveries/service";

describe("complete order route", () => {
  it("redirects anonymous users to login", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/orders/order-1/complete", {
      method: "POST"
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(acceptLatestDelivery).not.toHaveBeenCalled();
  });

  it("accepts the latest delivery for the logged-in buyer", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      email: "buyer@example.com"
    } as never);
    vi.mocked(acceptLatestDelivery).mockResolvedValue({ id: "delivery-1" } as never);

    const response = await POST(new Request("http://localhost/api/orders/order-1/complete", {
      method: "POST"
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(acceptLatestDelivery).toHaveBeenCalledWith({
      orderId: "order-1",
      buyerEmail: "buyer@example.com"
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/account/orders");
  });

  it("returns validation errors from delivery acceptance", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      email: "buyer@example.com"
    } as never);
    vi.mocked(acceptLatestDelivery).mockRejectedValue(new Error("Service order must be delivered before completion"));

    const response = await POST(new Request("http://localhost/api/orders/order-1/complete", {
      method: "POST"
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      errors: ["Service order must be delivered before completion"]
    });
  });
});
