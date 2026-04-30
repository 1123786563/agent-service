import { WhitelistStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({
  getCurrentUser: vi.fn(),
  requireCreator: vi.fn()
}));

vi.mock("@/server/deliveries/service", () => ({
  createDeliveryForOrder: vi.fn()
}));

import { POST } from "@/app/api/orders/[id]/deliveries/route";
import { getCurrentUser, requireCreator } from "@/server/auth/session";
import { createDeliveryForOrder } from "@/server/deliveries/service";

describe("delivery upload route", () => {
  it("redirects anonymous users to login", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/orders/order-1/deliveries", {
      method: "POST",
      body: new FormData()
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(requireCreator).not.toHaveBeenCalled();
  });

  it("returns 403 when the creator is not whitelisted", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-1",
      whitelistStatus: WhitelistStatus.INVITED
    } as never);

    const response = await POST(new Request("http://localhost/api/orders/order-1/deliveries", {
      method: "POST",
      body: new FormData()
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      errors: ["Creator whitelist is required"]
    });
    expect(requireCreator).not.toHaveBeenCalled();
  });

  it("returns 400 when the upload is missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "creator-1",
      whitelistStatus: WhitelistStatus.ACTIVE
    } as never);
    vi.mocked(requireCreator).mockResolvedValue({ id: "creator-1" } as never);

    const response = await POST(new Request("http://localhost/api/orders/order-1/deliveries", {
      method: "POST",
      body: new FormData()
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      errors: ["Missing delivery file"]
    });
  });

  it("returns validation errors from delivery creation", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "creator-1",
      whitelistStatus: WhitelistStatus.ACTIVE
    } as never);
    vi.mocked(requireCreator).mockResolvedValue({ id: "creator-1" } as never);
    vi.mocked(createDeliveryForOrder).mockRejectedValue(
      new Error("Service order must be in progress before delivery upload")
    );

    const formData = new FormData();
    formData.set("file", new File([Buffer.from("delivery-bytes")], "handoff.txt", { type: "text/plain" }));

    const response = await POST(new Request("http://localhost/api/orders/order-1/deliveries", {
      method: "POST",
      body: formData
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      errors: ["Service order must be in progress before delivery upload"]
    });
  });

  it("uploads a delivery and redirects back to creator orders", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "creator-1",
      whitelistStatus: WhitelistStatus.ACTIVE
    } as never);
    vi.mocked(requireCreator).mockResolvedValue({ id: "creator-1" } as never);
    vi.mocked(createDeliveryForOrder).mockResolvedValue({ id: "delivery-1" } as never);

    const formData = new FormData();
    formData.set("file", new File([Buffer.from("delivery-bytes")], "handoff.txt", { type: "text/plain" }));
    formData.set("note", "  Final setup notes  ");

    const response = await POST(new Request("http://localhost/api/orders/order-1/deliveries", {
      method: "POST",
      body: formData
    }), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(createDeliveryForOrder).toHaveBeenCalledWith({
      orderId: "order-1",
      providerId: "creator-1",
      buffer: Buffer.from("delivery-bytes"),
      fileName: "handoff.txt",
      note: "Final setup notes"
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/creator/orders");
  });
});
