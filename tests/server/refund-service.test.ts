import { PaymentStatus, ServiceOrderStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  serviceOrder: {
    findUnique: vi.fn()
  },
  $transaction: vi.fn()
}));

vi.mock("@/server/db", () => ({
  prisma: prismaMock
}));

import { applyRefundEvent, requestRefund } from "@/server/refunds/service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("refund service", () => {
  it("creates an automatic refund only when work has not started", async () => {
    prismaMock.serviceOrder.findUnique.mockResolvedValue({
      id: "order-1",
      priceCents: 2500,
      currency: "USD",
      status: ServiceOrderStatus.IN_PROGRESS,
      paymentStatus: PaymentStatus.PAID,
      paymentProvider: "dev",
      paymentReference: "devpay_1",
      workStartedAt: null,
      paymentLedgerEntries: []
    });
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        refund: {
          create: vi.fn().mockResolvedValue({
            id: "refund-1",
            amountMinor: 2500,
            status: "PENDING"
          })
        },
        serviceOrder: {
          update: vi.fn().mockResolvedValue({})
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({})
        },
        settlementLine: {
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn()
        },
        settlementAdjustment: {
          create: vi.fn()
        }
      })
    );

    const refund = await requestRefund({
      orderId: "order-1",
      requestedByUserId: "buyer-1"
    });

    expect(refund.amountMinor).toBe(2500);
  });

  it("rejects automatic refunds after work has started", async () => {
    prismaMock.serviceOrder.findUnique.mockResolvedValue({
      id: "order-2",
      priceCents: 2500,
      currency: "USD",
      status: ServiceOrderStatus.IN_PROGRESS,
      paymentStatus: PaymentStatus.PAID,
      paymentProvider: "dev",
      paymentReference: "devpay_2",
      workStartedAt: new Date("2026-05-03T00:00:00.000Z"),
      paymentLedgerEntries: []
    });

    await expect(requestRefund({
      orderId: "order-2",
      requestedByUserId: "buyer-1"
    })).rejects.toThrow("Service order has already started");
  });

  it("applies successful refund webhooks idempotently", async () => {
    prismaMock.serviceOrder.findUnique.mockResolvedValue({
      id: "order-3",
      priceCents: 2500,
      currency: "USD"
    });
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        refund: {
          findFirst: vi.fn().mockResolvedValue({
            id: "refund-3",
            orderId: "order-3",
            amountMinor: 1200,
            currency: "USD",
            status: "PENDING",
            providerEventId: null,
            failureReason: null,
            completedAt: null,
            order: {
              id: "order-3"
            }
          }),
          update: vi.fn().mockResolvedValue({
            id: "refund-3",
            status: "SUCCEEDED",
            order: {
              id: "order-3",
              status: ServiceOrderStatus.CANCELLED,
              paymentStatus: PaymentStatus.PARTIALLY_REFUNDED
            }
          })
        },
        serviceOrder: {
          update: vi.fn().mockResolvedValue({})
        },
        settlementLine: {
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn()
        },
        settlementAdjustment: {
          create: vi.fn()
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({})
        }
      })
    );

    const refund = await applyRefundEvent({
      type: "refund.succeeded",
      provider: "stripe",
      providerEventId: "evt_refund_1",
      orderId: "order-3",
      paymentReference: "pi_123",
      providerPaymentId: "pi_123",
      providerRefundId: "re_123",
      amountMinor: 1200,
      currency: "USD",
      rawPayload: {}
    });

    expect(refund.status).toBe("SUCCEEDED");
  });
});
