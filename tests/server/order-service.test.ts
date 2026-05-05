import { ConsultationStatus, PaymentStatus, ServiceOrderStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  createServiceOrder,
  listServiceOrdersForBuyerEmail,
  listServiceOrdersForProvider,
  markServiceOrderPaid,
  markServiceOrderPaymentCancelled,
  markServiceOrderPaymentFailed,
  markServiceOrderDisputed,
  resolveDisputedServiceOrder,
  cancelServiceOrder,
  ConcurrentModificationError
} from "@/server/orders/service";

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    findConsultationById: vi.fn(),
    createOrderForConsultation: vi.fn(),
    findManyForBuyerEmail: vi.fn(),
    findManyForProvider: vi.fn(),
    findUniqueById: vi.fn(),
    updateOrder: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    ...overrides
  };
}

describe("order service", () => {
  it("creates an order from a scoped consultation", async () => {
    const store = makeStore({
      findConsultationById: vi.fn().mockResolvedValue({
        id: "consultation-1",
        providerId: "creator-1",
        buyerEmail: "buyer@example.com",
        buyerUserId: "buyer-1",
        status: ConsultationStatus.SCOPED,
        scopedSummary: "Hosted deployment"
      }),
      createOrderForConsultation: vi.fn().mockResolvedValue({
        id: "order-1",
        status: ServiceOrderStatus.PENDING_PAYMENT
      })
    });

    const order = await createServiceOrder({
      consultationId: "consultation-1",
      providerId: "creator-1",
      title: "Deployment package",
      scope: "Deploy the agent into production",
      priceCents: 25000,
      currency: "usd",
      paymentProvider: "dev"
    }, { store });

    expect(store.createOrderForConsultation).toHaveBeenCalledWith({
      consultationId: "consultation-1",
      buyerEmail: "buyer@example.com",
      buyerUserId: "buyer-1",
      providerId: "creator-1",
      title: "Deployment package",
      scope: "Deploy the agent into production",
      priceCents: 25000,
      currency: "USD",
      paymentProvider: "dev"
    });
    expect(order.id).toBe("order-1");
  });

  it("rejects order creation when the consultation is not scoped", async () => {
    await expect(createServiceOrder({
      consultationId: "consultation-1",
      providerId: "creator-1",
      title: "Deployment package",
      scope: "Deploy the agent into production",
      priceCents: 25000,
      currency: "USD",
      paymentProvider: "dev"
    }, {
      store: makeStore({
        findConsultationById: vi.fn().mockResolvedValue({
          id: "consultation-1",
          providerId: "creator-1",
          buyerEmail: "buyer@example.com",
          buyerUserId: null,
          status: ConsultationStatus.NEW,
          scopedSummary: null
        })
      })
    })).rejects.toThrow("Consultation must be scoped before creating an order");
  });

  it("handles duplicate consultation order via P2002", async () => {
    const store = makeStore({
      findConsultationById: vi.fn().mockResolvedValue({
        id: "consultation-1",
        providerId: "creator-1",
        buyerEmail: "buyer@example.com",
        buyerUserId: "buyer-1",
        status: ConsultationStatus.SCOPED,
        scopedSummary: "Hosted deployment"
      }),
      createOrderForConsultation: vi.fn().mockRejectedValue({ code: "P2002" })
    });

    await expect(createServiceOrder({
      consultationId: "consultation-1",
      providerId: "creator-1",
      title: "Deployment package",
      scope: "Deploy the agent into production",
      priceCents: 25000,
      currency: "usd",
      paymentProvider: "dev"
    }, { store })).rejects.toThrow("订单已创建");
  });

  it("lists service orders for buyer and provider", async () => {
    const buyerOrders = [{ id: "order-1" }];
    const providerOrders = [{ id: "order-2" }];
    const store = makeStore({
      findManyForBuyerEmail: vi.fn().mockResolvedValue(buyerOrders),
      findManyForProvider: vi.fn().mockResolvedValue(providerOrders)
    });

    await expect(listServiceOrdersForBuyerEmail("Buyer@Example.com", { store })).resolves.toEqual(buyerOrders);
    await expect(listServiceOrdersForProvider("creator-1", { store })).resolves.toEqual(providerOrders);
    expect(store.findManyForBuyerEmail).toHaveBeenCalledWith("buyer@example.com");
    expect(store.findManyForProvider).toHaveBeenCalledWith("creator-1");
  });

  it("marks a pending order as paid and moves it into progress", async () => {
    const updatedOrder = {
      id: "order-1",
      status: ServiceOrderStatus.IN_PROGRESS,
      paymentStatus: PaymentStatus.PAID
    };
    const store = makeStore({
      findUniqueById: vi.fn()
        .mockResolvedValueOnce({
          id: "order-1",
          status: ServiceOrderStatus.PENDING_PAYMENT,
          paymentStatus: PaymentStatus.UNPAID,
          paymentReference: null
        })
        .mockResolvedValueOnce(updatedOrder),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    });

    const order = await markServiceOrderPaid({
      orderId: "order-1",
      paymentReference: "pay-ref-1"
    }, { store });

    expect(store.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-1",
        status: { notIn: [ServiceOrderStatus.CANCELLED, ServiceOrderStatus.DISPUTED] },
        paymentStatus: { not: PaymentStatus.PAID }
      },
      data: {
        paymentStatus: PaymentStatus.PAID,
        status: ServiceOrderStatus.IN_PROGRESS,
        paymentReference: "pay-ref-1"
      }
    });
    expect(order.status).toBe(ServiceOrderStatus.IN_PROGRESS);
  });

  it("is idempotent when the order is already paid and in progress", async () => {
    const existingOrder = {
      id: "order-1",
      status: ServiceOrderStatus.IN_PROGRESS,
      paymentStatus: PaymentStatus.PAID,
      paymentReference: "pay-ref-1"
    };
    const store = makeStore({
      findUniqueById: vi.fn().mockResolvedValue(existingOrder)
    });

    await expect(markServiceOrderPaid({ orderId: "order-1" }, { store })).resolves.toEqual(existingOrder);
    expect(store.updateMany).not.toHaveBeenCalled();
  });

  it("rejects payment confirmation for cancelled orders", async () => {
    await expect(markServiceOrderPaid({
      orderId: "order-1"
    }, {
      store: makeStore({
        findUniqueById: vi.fn().mockResolvedValue({
          id: "order-1",
          status: ServiceOrderStatus.CANCELLED,
          paymentStatus: PaymentStatus.UNPAID,
          paymentReference: null
        })
      })
    })).rejects.toThrow("Cannot mark cancelled order as paid");
  });

  it("throws ConcurrentModificationError when updateMany affects 0 rows", async () => {
    const store = makeStore({
      findUniqueById: vi.fn().mockResolvedValue({
        id: "order-1",
        status: ServiceOrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.UNPAID,
        paymentReference: null
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 })
    });

    await expect(markServiceOrderPaid({ orderId: "order-1" }, { store }))
      .rejects.toThrow(ConcurrentModificationError);
  });

  it("marks a pending order payment as failed and keeps it payable", async () => {
    const updatedOrder = {
      id: "order-1",
      status: ServiceOrderStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.FAILED
    };
    const store = makeStore({
      findUniqueById: vi.fn()
        .mockResolvedValueOnce({
          id: "order-1",
          status: ServiceOrderStatus.PENDING_PAYMENT,
          paymentStatus: PaymentStatus.UNPAID,
          paymentReference: null
        })
        .mockResolvedValueOnce(updatedOrder),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    });

    const order = await markServiceOrderPaymentFailed({
      orderId: "order-1",
      paymentReference: "pay-ref-2"
    }, { store });

    expect(store.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-1",
        status: { notIn: [ServiceOrderStatus.CANCELLED, ServiceOrderStatus.DISPUTED, ServiceOrderStatus.DELIVERED, ServiceOrderStatus.COMPLETED] }
      },
      data: {
        paymentStatus: PaymentStatus.FAILED,
        status: ServiceOrderStatus.PENDING_PAYMENT,
        paymentReference: "pay-ref-2"
      }
    });
    expect(order.paymentStatus).toBe(PaymentStatus.FAILED);
  });

  it("marks a pending order payment as cancelled and keeps it pending", async () => {
    const updatedOrder = {
      id: "order-1",
      status: ServiceOrderStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.CANCELLED
    };
    const store = makeStore({
      findUniqueById: vi.fn()
        .mockResolvedValueOnce({
          id: "order-1",
          status: ServiceOrderStatus.PENDING_PAYMENT,
          paymentStatus: PaymentStatus.UNPAID,
          paymentReference: null
        })
        .mockResolvedValueOnce(updatedOrder),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    });

    const order = await markServiceOrderPaymentCancelled({
      orderId: "order-1",
      paymentReference: "pay-ref-3"
    }, { store });

    expect(store.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-1",
        status: ServiceOrderStatus.PENDING_PAYMENT,
        paymentStatus: { not: PaymentStatus.CANCELLED }
      },
      data: {
        paymentStatus: PaymentStatus.CANCELLED,
        status: ServiceOrderStatus.PENDING_PAYMENT,
        paymentReference: "pay-ref-3"
      }
    });
    expect(order.paymentStatus).toBe(PaymentStatus.CANCELLED);
  });

  it("marks an in-progress order as disputed", async () => {
    const updatedOrder = {
      id: "order-1",
      status: ServiceOrderStatus.DISPUTED
    };
    const store = makeStore({
      findUniqueById: vi.fn()
        .mockResolvedValueOnce({
          id: "order-1",
          status: ServiceOrderStatus.IN_PROGRESS,
          paymentStatus: PaymentStatus.PAID
        })
        .mockResolvedValueOnce(updatedOrder),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    });

    const order = await markServiceOrderDisputed({ orderId: "order-1" }, { store });

    expect(store.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-1",
        status: { in: [ServiceOrderStatus.PAID, ServiceOrderStatus.IN_PROGRESS, ServiceOrderStatus.DELIVERED] }
      },
      data: {
        status: ServiceOrderStatus.DISPUTED
      }
    });
    expect(order.status).toBe(ServiceOrderStatus.DISPUTED);
  });

  it("resolves a disputed order to a chosen status", async () => {
    const updatedOrder = {
      id: "order-1",
      status: ServiceOrderStatus.DELIVERED
    };
    const store = makeStore({
      findUniqueById: vi.fn()
        .mockResolvedValueOnce({
          id: "order-1",
          status: ServiceOrderStatus.DISPUTED,
          paymentStatus: PaymentStatus.PAID
        })
        .mockResolvedValueOnce(updatedOrder),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    });

    const order = await resolveDisputedServiceOrder({
      orderId: "order-1",
      nextStatus: ServiceOrderStatus.DELIVERED
    }, { store });

    expect(store.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: ServiceOrderStatus.DISPUTED },
      data: {
        status: ServiceOrderStatus.DELIVERED
      }
    });
    expect(order.status).toBe(ServiceOrderStatus.DELIVERED);
  });

  it("cancels unpaid pending orders", async () => {
    const updatedOrder = {
      id: "order-4",
      status: ServiceOrderStatus.CANCELLED
    };
    const store = makeStore({
      findUniqueById: vi.fn()
        .mockResolvedValueOnce({
          id: "order-4",
          status: ServiceOrderStatus.PENDING_PAYMENT,
          paymentStatus: PaymentStatus.UNPAID
        })
        .mockResolvedValueOnce(updatedOrder),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    });

    const order = await cancelServiceOrder({ orderId: "order-4" }, { store });

    expect(store.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-4",
        status: ServiceOrderStatus.PENDING_PAYMENT,
        paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.FAILED, PaymentStatus.CANCELLED] }
      },
      data: {
        status: ServiceOrderStatus.CANCELLED
      }
    });
    expect(order.status).toBe(ServiceOrderStatus.CANCELLED);
  });

  it("allows cancelling pending orders after a cancelled payment attempt", async () => {
    const updatedOrder = {
      id: "order-5",
      status: ServiceOrderStatus.CANCELLED
    };
    const store = makeStore({
      findUniqueById: vi.fn()
        .mockResolvedValueOnce({
          id: "order-5",
          status: ServiceOrderStatus.PENDING_PAYMENT,
          paymentStatus: PaymentStatus.CANCELLED
        })
        .mockResolvedValueOnce(updatedOrder),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    });

    await expect(cancelServiceOrder({ orderId: "order-5" }, { store })).resolves.toMatchObject({
      status: ServiceOrderStatus.CANCELLED
    });
  });
});
