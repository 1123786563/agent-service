import { DisputeResolutionType, DisputeStatus, PaymentStatus, ServiceOrderStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  serviceOrder: {
    findUnique: vi.fn()
  },
  dispute: {
    findFirst: vi.fn(),
    findUnique: vi.fn()
  },
  $transaction: vi.fn()
}));

vi.mock("@/server/db", () => ({
  prisma: prismaMock
}));

vi.mock("@/server/audit/service", () => ({
  recordAuditLog: vi.fn().mockResolvedValue({ id: "audit-1" })
}));

import { createDispute, resolveDispute } from "@/server/disputes/service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dispute service", () => {
  it("creates a dispute with evidence and marks the order disputed", async () => {
    prismaMock.serviceOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: ServiceOrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PAID
    });
    prismaMock.dispute.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        dispute: {
          create: vi.fn().mockResolvedValue({
            id: "dispute-1",
            status: DisputeStatus.OPEN,
            evidence: [{ id: "evidence-1" }]
          })
        },
        serviceOrder: {
          update: vi.fn().mockResolvedValue({})
        }
      })
    );

    const dispute = await createDispute({
      orderId: "order-1",
      openedByUserId: "buyer-1",
      reason: "Broken output",
      evidence: [{ note: "See attached screenshot" }]
    });

    expect(dispute.status).toBe(DisputeStatus.OPEN);
    expect(dispute.evidence).toHaveLength(1);
  });

  it("resolves a dispute back to delivered", async () => {
    prismaMock.dispute.findUnique.mockResolvedValue({
      id: "dispute-1",
      orderId: "order-1",
      status: DisputeStatus.OPEN,
      order: {
        id: "order-1",
        paymentStatus: PaymentStatus.PAID
      }
    });
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        dispute: {
          update: vi.fn().mockResolvedValue({
            id: "dispute-1",
            status: DisputeStatus.RESOLVED,
            resolutionType: DisputeResolutionType.RETURN_TO_DELIVERED,
            evidence: [],
            order: {
              id: "order-1"
            }
          })
        },
        serviceOrder: {
          update: vi.fn().mockResolvedValue({})
        }
      })
    );

    const dispute = await resolveDispute({
      disputeId: "dispute-1",
      resolutionType: DisputeResolutionType.RETURN_TO_DELIVERED
    });

    expect(dispute.status).toBe(DisputeStatus.RESOLVED);
    expect(dispute.resolutionType).toBe(DisputeResolutionType.RETURN_TO_DELIVERED);
  });
});
