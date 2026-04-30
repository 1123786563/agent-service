import { PaymentStatus, ServiceOrderStatus, UserRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  acceptLatestDelivery,
  createDeliveryForOrder,
  getDeliveryForDownload,
  listDeliveriesForOrder
} from "@/server/deliveries/service";

function createDeps(overrides: {
  order?: unknown;
  delivery?: unknown;
  deliveries?: unknown[];
  createDeliveryError?: Error;
} = {}) {
  const store = {
    findOrderById: vi.fn().mockResolvedValue(overrides.order ?? {
      id: "order-1",
      providerId: "creator-1",
      buyerEmail: "buyer@example.com",
      status: ServiceOrderStatus.IN_PROGRESS,
      paymentStatus: PaymentStatus.PAID
    }),
    createDeliveryAndMarkDelivered: vi.fn(async (data) => {
      if (overrides.createDeliveryError) {
        throw overrides.createDeliveryError;
      }

      return {
        id: "delivery-1",
        ...data,
        serviceOrder: {
          id: data.serviceOrderId,
          buyerEmail: "buyer@example.com"
        }
      };
    }),
    findManyForOrder: vi.fn().mockResolvedValue(overrides.deliveries ?? [{ id: "delivery-1" }]),
    findDeliveryById: vi.fn().mockResolvedValue(overrides.delivery ?? {
      id: "delivery-1",
      serviceOrderId: "order-1",
      providerId: "creator-1",
      fileName: "handoff.txt",
      serviceOrder: {
        id: "order-1",
        buyerEmail: "buyer@example.com"
      }
    }),
    acceptLatestDeliveryForOrder: vi.fn().mockResolvedValue({
      id: "delivery-1",
      acceptedAt: new Date("2026-04-30T12:00:00.000Z"),
      serviceOrder: {
        id: "order-1",
        status: ServiceOrderStatus.COMPLETED
      }
    })
  };
  const storage = {
    save: vi.fn().mockResolvedValue({
      url: "/api/deliveries/handoff.txt",
      fileName: "handoff.txt",
      sizeBytes: 14
    }),
    read: vi.fn().mockResolvedValue(Buffer.from("delivery-bytes")),
    delete: vi.fn().mockResolvedValue(undefined)
  };

  return {
    store,
    storage,
    deps: {
      store,
      storage
    }
  };
}

describe("delivery service", () => {
  it("creates a delivery for an in-progress paid order and marks it delivered", async () => {
    const { store, storage, deps } = createDeps();

    const delivery = await createDeliveryForOrder({
      orderId: "order-1",
      providerId: "creator-1",
      buffer: Buffer.from("delivery-bytes"),
      fileName: "handoff.txt",
      note: "  Final setup notes  "
    }, deps);

    expect(storage.save).toHaveBeenCalledWith(Buffer.from("delivery-bytes"), "handoff.txt");
    expect(store.createDeliveryAndMarkDelivered).toHaveBeenCalledWith({
      serviceOrderId: "order-1",
      providerId: "creator-1",
      fileUrl: "/api/deliveries/handoff.txt",
      fileName: "handoff.txt",
      fileSizeBytes: 14,
      note: "Final setup notes"
    });
    expect(delivery.id).toBe("delivery-1");
  });

  it("rejects delivery upload from a non-owner provider", async () => {
    const { storage, deps } = createDeps();

    await expect(createDeliveryForOrder({
      orderId: "order-1",
      providerId: "other-creator",
      buffer: Buffer.from("delivery-bytes"),
      fileName: "handoff.txt"
    }, deps)).rejects.toThrow("Service order does not belong to this provider");

    expect(storage.save).not.toHaveBeenCalled();
  });

  it("rejects delivery upload unless the order is in progress and paid", async () => {
    const { storage, deps } = createDeps({
      order: {
        id: "order-1",
        providerId: "creator-1",
        buyerEmail: "buyer@example.com",
        status: ServiceOrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.UNPAID
      }
    });

    await expect(createDeliveryForOrder({
      orderId: "order-1",
      providerId: "creator-1",
      buffer: Buffer.from("delivery-bytes"),
      fileName: "handoff.txt"
    }, deps)).rejects.toThrow("Service order must be in progress before delivery upload");

    expect(storage.save).not.toHaveBeenCalled();
  });

  it("cleans up the stored file if database delivery creation fails", async () => {
    const { storage, deps } = createDeps({
      createDeliveryError: new Error("database failed")
    });

    await expect(createDeliveryForOrder({
      orderId: "order-1",
      providerId: "creator-1",
      buffer: Buffer.from("delivery-bytes"),
      fileName: "handoff.txt"
    }, deps)).rejects.toThrow("database failed");

    expect(storage.delete).toHaveBeenCalledWith("handoff.txt");
  });

  it("lists deliveries for an order", async () => {
    const { store, deps } = createDeps({
      deliveries: [{ id: "delivery-1" }, { id: "delivery-2" }]
    });

    await expect(listDeliveriesForOrder("order-1", deps)).resolves.toEqual([
      { id: "delivery-1" },
      { id: "delivery-2" }
    ]);
    expect(store.findManyForOrder).toHaveBeenCalledWith("order-1");
  });

  it("allows buyer, provider, and admin to download delivery files", async () => {
    const { storage, deps } = createDeps();

    await expect(getDeliveryForDownload({
      orderId: "order-1",
      deliveryId: "delivery-1",
      requester: {
        userId: "buyer-1",
        email: "buyer@example.com",
        role: UserRole.USER
      }
    }, deps)).resolves.toMatchObject({
      delivery: {
        id: "delivery-1"
      },
      buffer: Buffer.from("delivery-bytes")
    });

    await expect(getDeliveryForDownload({
      orderId: "order-1",
      deliveryId: "delivery-1",
      requester: {
        userId: "creator-1",
        email: "creator@example.com",
        role: UserRole.CREATOR
      }
    }, deps)).resolves.toMatchObject({
      delivery: {
        id: "delivery-1"
      }
    });

    await expect(getDeliveryForDownload({
      orderId: "order-1",
      deliveryId: "delivery-1",
      requester: {
        userId: "admin-1",
        email: "admin@example.com",
        role: UserRole.ADMIN
      }
    }, deps)).resolves.toMatchObject({
      delivery: {
        id: "delivery-1"
      }
    });

    expect(storage.read).toHaveBeenCalledTimes(3);
  });

  it("rejects delivery download for unrelated users", async () => {
    const { storage, deps } = createDeps();

    await expect(getDeliveryForDownload({
      orderId: "order-1",
      deliveryId: "delivery-1",
      requester: {
        userId: "other-user",
        email: "other@example.com",
        role: UserRole.USER
      }
    }, deps)).rejects.toThrow("Delivery access is required");

    expect(storage.read).not.toHaveBeenCalled();
  });

  it("accepts the latest delivery for the buyer and marks the order complete", async () => {
    const { store, deps } = createDeps({
      order: {
        id: "order-1",
        providerId: "creator-1",
        buyerEmail: "buyer@example.com",
        status: ServiceOrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID
      }
    });

    const delivery = await acceptLatestDelivery({
      orderId: "order-1",
      buyerEmail: "Buyer@Example.com"
    }, deps);

    expect(store.acceptLatestDeliveryForOrder).toHaveBeenCalledWith({
      orderId: "order-1",
      acceptedAt: expect.any(Date)
    });
    expect(delivery.serviceOrder.status).toBe(ServiceOrderStatus.COMPLETED);
  });

  it("rejects completion before an order is delivered", async () => {
    const { store, deps } = createDeps();

    await expect(acceptLatestDelivery({
      orderId: "order-1",
      buyerEmail: "buyer@example.com"
    }, deps)).rejects.toThrow("Service order must be delivered before completion");

    expect(store.acceptLatestDeliveryForOrder).not.toHaveBeenCalled();
  });
});
