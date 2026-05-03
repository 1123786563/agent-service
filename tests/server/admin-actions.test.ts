import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/server/auth/session", () => ({
  requireAdmin: vi.fn()
}));

vi.mock("@/server/disputes/service", () => ({
  resolveLatestOpenDisputeForOrder: vi.fn()
}));

vi.mock("@/server/settlements/service", () => ({
  buildSettlementLine: vi.fn(),
  submitSettlementBatch: vi.fn(),
  markSettlementBatchPaidOut: vi.fn()
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: {
      upsert: vi.fn()
    },
    agentPackage: {
      update: vi.fn()
    },
    serviceOrder: {
      update: vi.fn()
    }
  }
}));

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { resolveLatestOpenDisputeForOrder } from "@/server/disputes/service";
import { buildSettlementLine, markSettlementBatchPaidOut, submitSettlementBatch } from "@/server/settlements/service";
import { prisma } from "@/server/db";
import {
  activateCreatorWhitelist,
  archiveAgentPackage,
  markSettlementBatchPaidOutAction,
  markOrderSettled,
  resetOrderPayment,
  resolveDisputedOrder
} from "@/app/admin/actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin actions", () => {
  it("activates creator whitelist entries", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1" } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user-1" } as never);

    const formData = new FormData();
    formData.append("email", "creator@example.com");

    await activateCreatorWhitelist(formData);

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { email: "creator@example.com" },
      create: {
        email: "creator@example.com",
        role: "CREATOR",
        whitelistStatus: "ACTIVE"
      },
      update: {
        role: "CREATOR",
        whitelistStatus: "ACTIVE"
      }
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/whitelist");
  });

  it("archives agent packages", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1" } as never);
    vi.mocked(prisma.agentPackage.update).mockResolvedValue({ id: "pkg-1" } as never);

    const formData = new FormData();
    formData.append("packageId", "pkg-1");

    await archiveAgentPackage(formData);

    expect(prisma.agentPackage.update).toHaveBeenCalledWith({
      where: { id: "pkg-1" },
      data: { status: "ARCHIVED" }
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/agents");
  });

  it("resets failed order payments back to unpaid", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1" } as never);
    vi.mocked(prisma.serviceOrder.update).mockResolvedValue({ id: "order-1" } as never);

    const formData = new FormData();
    formData.append("orderId", "order-1");

    await resetOrderPayment(formData);

    expect(prisma.serviceOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        status: "PENDING_PAYMENT",
        paymentStatus: "UNPAID",
        paymentReference: null
      }
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/analytics");
    expect(revalidatePath).toHaveBeenCalledWith("/account/orders");
    expect(revalidatePath).toHaveBeenCalledWith("/creator/orders");
  });

  it("resolves disputed orders to a selected status", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1" } as never);
    vi.mocked(prisma.serviceOrder.update).mockResolvedValue({ id: "order-2" } as never);

    const formData = new FormData();
    formData.append("orderId", "order-2");
    formData.append("nextStatus", "DELIVERED");

    await resolveDisputedOrder(formData);

    expect(resolveLatestOpenDisputeForOrder).toHaveBeenCalledWith({
      orderId: "order-2",
      resolutionType: "RETURN_TO_DELIVERED"
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/analytics");
    expect(revalidatePath).toHaveBeenCalledWith("/account/orders");
    expect(revalidatePath).toHaveBeenCalledWith("/creator/orders");
  });

  it("marks completed orders as settled", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1" } as never);
    vi.mocked(buildSettlementLine).mockResolvedValue({
      id: "line-1",
      providerId: "creator-1"
    } as never);
    vi.mocked(submitSettlementBatch).mockResolvedValue({ id: "batch-1" } as never);

    const formData = new FormData();
    formData.append("orderId", "order-3");
    formData.append("settlementReference", "bank-transfer-2026-05-01");

    await markOrderSettled(formData);

    expect(buildSettlementLine).toHaveBeenCalledWith("order-3");
    expect(submitSettlementBatch).toHaveBeenCalledWith({
      providerId: "creator-1",
      lineIds: ["line-1"],
      payoutReference: "bank-transfer-2026-05-01"
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/analytics");
    expect(revalidatePath).toHaveBeenCalledWith("/creator/orders");
  });

  it("marks submitted settlement batches as paid out", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1" } as never);
    vi.mocked(markSettlementBatchPaidOut).mockResolvedValue({ id: "batch-1" } as never);

    const formData = new FormData();
    formData.append("batchId", "batch-1");
    formData.append("settlementReference", "bank-transfer-2026-05-02");

    await markSettlementBatchPaidOutAction(formData);

    expect(markSettlementBatchPaidOut).toHaveBeenCalledWith({
      batchId: "batch-1",
      payoutReference: "bank-transfer-2026-05-02"
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/analytics");
    expect(revalidatePath).toHaveBeenCalledWith("/creator/orders");
  });
});
