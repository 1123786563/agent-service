import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/server/auth/session", () => ({
  requireAdmin: vi.fn()
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
import { prisma } from "@/server/db";
import { activateCreatorWhitelist, archiveAgentPackage, resetOrderPayment } from "@/app/admin/actions";

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
});
