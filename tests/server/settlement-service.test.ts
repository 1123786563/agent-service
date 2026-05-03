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
    updateMany: vi.fn()
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

import { buildSettlementLine, markSettlementBatchPaidOut, submitSettlementBatch } from "@/server/settlements/service";

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
      paymentStatus: PaymentStatus.PAID
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
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        settlementBatch: {
          create: vi.fn().mockResolvedValue({
            id: "batch-1",
            status: SettlementBatchStatus.SUBMITTED,
            lineSnapshot: [{ id: "line-1" }]
          })
        },
        settlementLine: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 })
        }
      })
    );

    const batch = await submitSettlementBatch({
      providerId: "creator-1",
      lineIds: ["line-1"]
    });

    expect(batch.status).toBe(SettlementBatchStatus.SUBMITTED);
    expect(batch.lineSnapshot).toEqual([{ id: "line-1" }]);
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
