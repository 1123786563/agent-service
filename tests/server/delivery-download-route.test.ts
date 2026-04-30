import { UserRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({
  getCurrentUser: vi.fn()
}));

vi.mock("@/server/deliveries/service", () => ({
  getDeliveryForDownload: vi.fn()
}));

import { GET } from "@/app/api/orders/[id]/deliveries/[deliveryId]/download/route";
import { getCurrentUser } from "@/server/auth/session";
import { getDeliveryForDownload } from "@/server/deliveries/service";

describe("delivery download route", () => {
  it("redirects anonymous users to login", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/orders/order-1/deliveries/delivery-1/download"), {
      params: Promise.resolve({ id: "order-1", deliveryId: "delivery-1" })
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(getDeliveryForDownload).not.toHaveBeenCalled();
  });

  it("returns the delivery file for an authorized user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "buyer-1",
      email: "buyer@example.com",
      role: UserRole.USER
    } as never);
    vi.mocked(getDeliveryForDownload).mockResolvedValue({
      delivery: {
        fileName: "handoff.txt"
      },
      buffer: Buffer.from("delivery-bytes")
    } as never);

    const response = await GET(new Request("http://localhost/api/orders/order-1/deliveries/delivery-1/download"), {
      params: Promise.resolve({ id: "order-1", deliveryId: "delivery-1" })
    });

    expect(getDeliveryForDownload).toHaveBeenCalledWith({
      orderId: "order-1",
      deliveryId: "delivery-1",
      requester: {
        userId: "buyer-1",
        email: "buyer@example.com",
        role: UserRole.USER
      }
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="handoff.txt"');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("delivery-bytes"));
  });

  it("returns access errors from the delivery service", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "other-1",
      email: "other@example.com",
      role: UserRole.USER
    } as never);
    vi.mocked(getDeliveryForDownload).mockRejectedValue(new Error("Delivery access is required"));

    const response = await GET(new Request("http://localhost/api/orders/order-1/deliveries/delivery-1/download"), {
      params: Promise.resolve({ id: "order-1", deliveryId: "delivery-1" })
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      errors: ["Delivery access is required"]
    });
  });
});
