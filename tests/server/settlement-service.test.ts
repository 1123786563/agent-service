import { PaymentStatus, ServiceOrderStatus, SettlementBatchStatus, SettlementLineStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  serviceOrder: {
    findUnique: vi.fn(),
    updateMany: vi.fn()
  },
  settlementLine: {
    upsert: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  },
  settlementAdjustment: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn()
  },
  settlementBatch: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  },
  $transaction: vi.fn()
}));

vi.mock("@/server/db", () => ({
  prisma: prismaMock
}));

import {
  applySettlementRefundAdjustment,
  buildSettlementLine,
  markSettlementBatchPaidOut,
  submitSettlementBatch
} from "@/server/settlements/service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("settlement service", () => {
  it("creates a pending settlement line only for completed paid orders", async () => {
    prismaMock.serviceOrder.findUnique.mockResolvedValue({
      id: "order-1",
      providerId: "creator-1",
      priceCents: 2500,
      currency: "USD",
      status: ServiceOrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      disputes: [],
      refunds: []
    });
    prismaMock.settlementLine.upsert.mockResolvedValue({
      id: "line-1",
      status: SettlementLineStatus.PENDING
    });

    const line = await buildSettlementLine("order-1");

    expect(line.status).toBe(SettlementLineStatus.PENDING);
  });

  it("locks lines into a submitted batch", async () => {
    prismaMock.settlementLine.findMany.mockResolvedValue([
      {
        id: "line-1",
        providerId: "creator-1",
        netAmountMinor: 2500,
        refundDeductionAmount: 0,
        adjustmentAmount: 0,
        currency: "USD"
      }
    ]);
    prismaMock.settlementAdjustment.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        settlementBatch: {
          create: vi.fn().mockResolvedValue({
            id: "batch-1",
            status: SettlementBatchStatus.SUBMITTED,
            lineSnapshot: {
              lines: [{ id: "line-1" }],
              adjustments: []
            }
          })
        },
        settlementLine: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 })
        },
        settlementAdjustment: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 })
        }
      })
    );

    const batch = await submitSettlementBatch({
      providerId: "creator-1",
      lineIds: ["line-1"]
    });

    expect(batch.status).toBe(SettlementBatchStatus.SUBMITTED);
    expect(batch.lineSnapshot).toEqual({
      lines: [{ id: "line-1" }],
      adjustments: []
    });
  });

  it("deducts refunds from pending settlement lines", async () => {
    prismaMock.settlementLine.findUnique.mockResolvedValue({
      id: "line-1",
      orderId: "order-1",
      providerId: "creator-1",
      currency: "USD",
      status: SettlementLineStatus.PENDING
    });
    prismaMock.settlementLine.update.mockResolvedValue({
      id: "line-1",
      refundDeductionAmount: 500
    });

    const result = await applySettlementRefundAdjustment({
      orderId: "order-1",
      amountMinor: 500
    });

    expect(result).toMatchObject({
      refundDeductionAmount: 500
    });
    expect(prismaMock.settlementAdjustment.create).not.toHaveBeenCalled();
  });

  it("creates negative adjustments when refunds arrive after settlement lock", async () => {
    prismaMock.settlementLine.findUnique.mockResolvedValue({
      id: "line-2",
      orderId: "order-2",
      providerId: "creator-1",
      currency: "USD",
      status: SettlementLineStatus.SETTLED
    });
    prismaMock.settlementAdjustment.create.mockResolvedValue({
      id: "adjustment-1",
      amountMinor: -700
    });

    const result = await applySettlementRefundAdjustment({
      orderId: "order-2",
      amountMinor: 700,
      reason: "refund_after_settlement"
    });

    expect(result).toMatchObject({
      amountMinor: -700
    });
  });

  it("marks submitted batches as paid out and projects settlement fields to orders", async () => {
    prismaMock.settlementBatch.findUnique.mockResolvedValue({
      id: "batch-1",
      status: SettlementBatchStatus.SUBMITTED,
      payoutReference: null,
      settlementLines: [
        {
          id: "line-1",
          orderId: "order-1"
        }
      ]
    });
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        settlementBatch: {
          update: vi.fn().mockResolvedValue({
            id: "batch-1",
            status: SettlementBatchStatus.PAID_OUT,
            payoutReference: "bank-transfer-2026-05-01"
          })
        },
        settlementLine: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 })
        },
        serviceOrder: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 })
        }
      })
    );

    const batch = await markSettlementBatchPaidOut({
      batchId: "batch-1",
      payoutReference: "bank-transfer-2026-05-01"
    });

    expect(batch.status).toBe(SettlementBatchStatus.PAID_OUT);
    expect(batch.payoutReference).toBe("bank-transfer-2026-05-01");
  });
});
