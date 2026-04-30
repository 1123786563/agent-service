import { ConsultationStatus, PaymentStatus, ServiceOrderStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  createServiceOrder,
  listServiceOrdersForBuyerEmail,
  listServiceOrdersForProvider,
  markServiceOrderPaid
} from "@/server/orders/service";

describe("order service", () => {
  it("creates an order from a scoped consultation", async () => {
    const store = {
      findConsultationById: vi.fn().mockResolvedValue({
        id: "consultation-1",
        providerId: "creator-1",
        buyerEmail: "buyer@example.com",
        buyerUserId: "buyer-1",
        status: ConsultationStatus.SCOPED,
        scopedSummary: "Hosted deployment"
      }),
      consultationHasOrder: vi.fn().mockResolvedValue(false),
      createOrderForConsultation: vi.fn().mockResolvedValue({
        id: "order-1",
        status: ServiceOrderStatus.PENDING_PAYMENT
      }),
      findManyForBuyerEmail: vi.fn(),
      findManyForProvider: vi.fn(),
      findUniqueById: vi.fn(),
      updateOrder: vi.fn()
    };

    const order = await createServiceOrder({
      consultationId: "consultation-1",
      providerId: "creator-1",
      title: "Deployment package",
      scope: "Deploy the agent into production",
      priceCents: 25000,
      currency: "usd",
      paymentProvider: "dev"
    }, {
      store
    });

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
      store: {
        findConsultationById: vi.fn().mockResolvedValue({
          id: "consultation-1",
          providerId: "creator-1",
          buyerEmail: "buyer@example.com",
          buyerUserId: null,
          status: ConsultationStatus.NEW,
          scopedSummary: null
        }),
        consultationHasOrder: vi.fn(),
        createOrderForConsultation: vi.fn(),
        findManyForBuyerEmail: vi.fn(),
        findManyForProvider: vi.fn(),
        findUniqueById: vi.fn(),
        updateOrder: vi.fn()
      }
    })).rejects.toThrow("Consultation must be scoped before creating an order");
  });

  it("lists service orders for buyer and provider", async () => {
    const buyerOrders = [{ id: "order-1" }];
    const providerOrders = [{ id: "order-2" }];
    const store = {
      findConsultationById: vi.fn(),
      consultationHasOrder: vi.fn(),
      createOrderForConsultation: vi.fn(),
      findManyForBuyerEmail: vi.fn().mockResolvedValue(buyerOrders),
      findManyForProvider: vi.fn().mockResolvedValue(providerOrders),
      findUniqueById: vi.fn(),
      updateOrder: vi.fn()
    };

    await expect(listServiceOrdersForBuyerEmail("Buyer@Example.com", { store })).resolves.toEqual(buyerOrders);
    await expect(listServiceOrdersForProvider("creator-1", { store })).resolves.toEqual(providerOrders);
    expect(store.findManyForBuyerEmail).toHaveBeenCalledWith("buyer@example.com");
    expect(store.findManyForProvider).toHaveBeenCalledWith("creator-1");
  });

  it("marks a pending order as paid and moves it into progress", async () => {
    const store = {
      findConsultationById: vi.fn(),
      consultationHasOrder: vi.fn(),
      createOrderForConsultation: vi.fn(),
      findManyForBuyerEmail: vi.fn(),
      findManyForProvider: vi.fn(),
      findUniqueById: vi.fn().mockResolvedValue({
        id: "order-1",
        status: ServiceOrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.UNPAID,
        paymentReference: null
      }),
      updateOrder: vi.fn().mockResolvedValue({
        id: "order-1",
        status: ServiceOrderStatus.IN_PROGRESS,
        paymentStatus: PaymentStatus.PAID
      })
    };

    const order = await markServiceOrderPaid({
      orderId: "order-1",
      paymentReference: "pay-ref-1"
    }, {
      store
    });

    expect(store.updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
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
    const store = {
      findConsultationById: vi.fn(),
      consultationHasOrder: vi.fn(),
      createOrderForConsultation: vi.fn(),
      findManyForBuyerEmail: vi.fn(),
      findManyForProvider: vi.fn(),
      findUniqueById: vi.fn().mockResolvedValue(existingOrder),
      updateOrder: vi.fn()
    };

    await expect(markServiceOrderPaid({ orderId: "order-1" }, { store })).resolves.toEqual(existingOrder);
    expect(store.updateOrder).not.toHaveBeenCalled();
  });

  it("rejects payment confirmation for cancelled orders", async () => {
    await expect(markServiceOrderPaid({
      orderId: "order-1"
    }, {
      store: {
        findConsultationById: vi.fn(),
        consultationHasOrder: vi.fn(),
        createOrderForConsultation: vi.fn(),
        findManyForBuyerEmail: vi.fn(),
        findManyForProvider: vi.fn(),
        findUniqueById: vi.fn().mockResolvedValue({
          id: "order-1",
          status: ServiceOrderStatus.CANCELLED,
          paymentStatus: PaymentStatus.UNPAID,
          paymentReference: null
        }),
        updateOrder: vi.fn()
      }
    })).rejects.toThrow("Cannot mark cancelled order as paid");
  });
});
