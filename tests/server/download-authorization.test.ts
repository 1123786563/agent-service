import { AgentPackageStatus, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueAgentPackage, findUniqueDelivery } = vi.hoisted(() => ({
  findUniqueAgentPackage: vi.fn(),
  findUniqueDelivery: vi.fn()
}));

vi.mock("@/server/db", () => ({
  prisma: {
    agentPackage: {
      findUnique: findUniqueAgentPackage
    },
    delivery: {
      findUnique: findUniqueDelivery
    }
  }
}));

import { authorizeAgentZipDownload, authorizeDeliveryAssetDownload } from "@/server/storage/download-authorization";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("download authorization", () => {
  it("authorizes published agent zips", async () => {
    findUniqueAgentPackage.mockResolvedValue({
      id: "pkg-1",
      slug: "demo-agent",
      status: AgentPackageStatus.PUBLISHED,
      zipFileName: "demo-agent.zip",
      objectKey: null,
      updatedAt: new Date("2026-05-03T00:00:00.000Z")
    });

    await expect(authorizeAgentZipDownload("demo-agent")).resolves.toMatchObject({
      resourceId: "pkg-1",
      objectKey: "agents/demo-agent.zip",
      actorScope: "anonymous"
    });
  });

  it("rejects unpublished agent zips", async () => {
    findUniqueAgentPackage.mockResolvedValue({
      id: "pkg-1",
      slug: "draft-agent",
      status: AgentPackageStatus.DRAFT,
      zipFileName: "draft-agent.zip",
      objectKey: null,
      updatedAt: new Date("2026-05-03T00:00:00.000Z")
    });

    await expect(authorizeAgentZipDownload("draft-agent")).rejects.toThrow("Agent package not found");
  });

  it("authorizes buyer-owned delivery access", async () => {
    findUniqueDelivery.mockResolvedValue({
      id: "delivery-1",
      serviceOrderId: "order-1",
      providerId: "creator-1",
      fileName: "handoff.txt",
      objectKey: null,
      createdAt: new Date("2026-05-03T00:00:00.000Z"),
      acceptedAt: null,
      serviceOrder: {
        id: "order-1",
        buyerEmail: "buyer@example.com",
        status: "DELIVERED"
      }
    });

    await expect(authorizeDeliveryAssetDownload({
      orderId: "order-1",
      deliveryId: "delivery-1",
      requester: {
        userId: "buyer-1",
        email: "buyer@example.com",
        role: UserRole.USER
      }
    })).resolves.toMatchObject({
      actorScope: "buyer",
      objectKey: "deliveries/handoff.txt"
    });
  });

  it("rejects unrelated delivery access", async () => {
    findUniqueDelivery.mockResolvedValue({
      id: "delivery-1",
      serviceOrderId: "order-1",
      providerId: "creator-1",
      fileName: "handoff.txt",
      objectKey: null,
      createdAt: new Date("2026-05-03T00:00:00.000Z"),
      acceptedAt: null,
      serviceOrder: {
        id: "order-1",
        buyerEmail: "buyer@example.com",
        status: "DELIVERED"
      }
    });

    await expect(authorizeDeliveryAssetDownload({
      orderId: "order-1",
      deliveryId: "delivery-1",
      requester: {
        userId: "other-1",
        email: "other@example.com",
        role: UserRole.USER
      }
    })).rejects.toThrow("Delivery access is required");
  });
});
