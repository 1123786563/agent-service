import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({
  getCurrentSession: vi.fn()
}));

vi.mock("@/server/deliveries/service", () => ({
  getDeliveryForDownload: vi.fn()
}));

vi.mock("@/server/storage/download-authorization", () => ({
  authorizeDeliveryAssetDownload: vi.fn()
}));

vi.mock("@/server/storage/download-tickets", () => ({
  createDownloadTicket: vi.fn(() => "delivery-ticket"),
  verifyDownloadTicket: vi.fn()
}));

vi.mock("@/server/audit/service", () => ({
  recordAuditLog: vi.fn()
}));

import { GET } from "@/app/api/orders/[id]/deliveries/[deliveryId]/download/route";
import { recordAuditLog } from "@/server/audit/service";
import { getCurrentSession } from "@/server/auth/session";
import { getDeliveryForDownload } from "@/server/deliveries/service";
import { authorizeDeliveryAssetDownload } from "@/server/storage/download-authorization";
import { createDownloadTicket, verifyDownloadTicket } from "@/server/storage/download-tickets";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("delivery download route", () => {
  it("redirects anonymous users to login", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/orders/order-1/deliveries/delivery-1/download"), {
      params: Promise.resolve({ id: "order-1", deliveryId: "delivery-1" })
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(getDeliveryForDownload).not.toHaveBeenCalled();
  });

  it("returns the delivery file for an authorized user", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      id: "session-1",
      user: {
        id: "buyer-1",
        email: "buyer@example.com",
        role: UserRole.USER
      }
    } as never);
    vi.mocked(authorizeDeliveryAssetDownload).mockResolvedValue({
      actorScope: "buyer",
      resourceType: "delivery_asset",
      resourceId: "delivery-1",
      objectKey: "deliveries/handoff.txt",
      resourceVersion: "2026-05-03T00:00:00.000Z",
      fileName: "handoff.txt"
    });
    vi.mocked(getDeliveryForDownload).mockResolvedValue({
      delivery: {
        fileName: "handoff.txt"
      },
      buffer: Buffer.from("delivery-bytes")
    } as never);

    const response = await GET(new Request("http://localhost/api/orders/order-1/deliveries/delivery-1/download"), {
      params: Promise.resolve({ id: "order-1", deliveryId: "delivery-1" })
    });

    expect(createDownloadTicket).toHaveBeenCalled();
    expect(verifyDownloadTicket).toHaveBeenCalledWith("delivery-ticket", {
      audience: "delivery-download",
      actorId: "buyer-1"
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
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "buyer-1",
      action: "asset.download",
      targetType: "Delivery",
      targetId: "delivery-1"
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="handoff.txt"');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("delivery-bytes"));
  });

  it("returns access errors from the delivery service", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      id: "session-2",
      user: {
        id: "other-1",
        email: "other@example.com",
        role: UserRole.USER
      }
    } as never);
    vi.mocked(authorizeDeliveryAssetDownload).mockRejectedValue(new Error("Delivery access is required"));

    const response = await GET(new Request("http://localhost/api/orders/order-1/deliveries/delivery-1/download"), {
      params: Promise.resolve({ id: "order-1", deliveryId: "delivery-1" })
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      errors: ["Delivery access is required"]
    });
  });
});
