import { describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({
  create: vi.fn()
}));

vi.mock("@/server/db", () => ({
  prisma: {
    auditLog: {
      create
    }
  }
}));

import { recordAuditLog } from "@/server/audit/service";

describe("audit service", () => {
  it("persists a normalized audit record", async () => {
    create.mockResolvedValue({ id: "audit-1" });

    await recordAuditLog({
      actorId: "user-1",
      actorRole: "ADMIN",
      action: "asset.download",
      targetType: "Delivery",
      targetId: "delivery-1",
      ipAddress: "127.0.0.1",
      userAgent: "Vitest"
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: "user-1",
        actorRole: "ADMIN",
        action: "asset.download",
        targetType: "Delivery",
        targetId: "delivery-1",
        beforeSnapshot: undefined,
        afterSnapshot: undefined,
        ipAddress: "127.0.0.1",
        userAgent: "Vitest"
      }
    });
  });
});
