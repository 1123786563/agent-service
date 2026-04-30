import { ConsultationStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  createConsultation,
  listConsultationsForProvider,
  updateConsultation
} from "@/server/consultations/service";

describe("consultation service", () => {
  it("creates a consultation for a published package", async () => {
    const store = {
      findPublishedAgentPackageBySlug: vi.fn().mockResolvedValue({
        id: "pkg-1",
        ownerId: "creator-1"
      }),
      create: vi.fn().mockResolvedValue({
        id: "consultation-1",
        buyerEmail: "buyer@example.com",
        requirement: "Need a custom deployment"
      }),
      findManyForProvider: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    };

    const consultation = await createConsultation({
      agentSlug: "research-assistant",
      buyerEmail: "Buyer@Example.com",
      requirement: "  Need a custom deployment  "
    }, {
      store
    });

    expect(store.findPublishedAgentPackageBySlug).toHaveBeenCalledWith("research-assistant");
    expect(store.create).toHaveBeenCalledWith({
      data: {
        agentPackageId: "pkg-1",
        providerId: "creator-1",
        buyerEmail: "buyer@example.com",
        buyerUserId: null,
        requirement: "Need a custom deployment",
        status: ConsultationStatus.NEW
      }
    });
    expect(consultation.id).toBe("consultation-1");
  });

  it("rejects creation when the agent package is not published", async () => {
    await expect(createConsultation({
      agentSlug: "missing-agent",
      buyerEmail: "buyer@example.com",
      requirement: "Need help"
    }, {
      store: {
        findPublishedAgentPackageBySlug: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        findManyForProvider: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn()
      }
    })).rejects.toThrow("Published agent package not found");
  });

  it("lists consultations for a provider", async () => {
    const consultations = [{ id: "consultation-1" }];
    const store = {
      findPublishedAgentPackageBySlug: vi.fn(),
      create: vi.fn(),
      findManyForProvider: vi.fn().mockResolvedValue(consultations),
      findUnique: vi.fn(),
      update: vi.fn()
    };

    await expect(listConsultationsForProvider("creator-1", { store })).resolves.toEqual(consultations);
    expect(store.findManyForProvider).toHaveBeenCalledWith("creator-1");
  });

  it("updates a consultation to scoped when a summary is provided", async () => {
    const store = {
      findPublishedAgentPackageBySlug: vi.fn(),
      create: vi.fn(),
      findManyForProvider: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({
        id: "consultation-1",
        providerId: "creator-1",
        status: ConsultationStatus.IN_DISCUSSION,
        scopedSummary: null
      }),
      update: vi.fn().mockResolvedValue({
        id: "consultation-1",
        status: ConsultationStatus.SCOPED,
        scopedSummary: "Deliver a hosted deployment"
      })
    };

    const consultation = await updateConsultation({
      consultationId: "consultation-1",
      providerId: "creator-1",
      status: ConsultationStatus.SCOPED,
      scopedSummary: "  Deliver a hosted deployment  "
    }, {
      store
    });

    expect(store.update).toHaveBeenCalledWith({
      where: { id: "consultation-1" },
      data: {
        status: ConsultationStatus.SCOPED,
        scopedSummary: "Deliver a hosted deployment"
      }
    });
    expect(consultation.status).toBe(ConsultationStatus.SCOPED);
  });

  it("rejects invalid status transitions", async () => {
    await expect(updateConsultation({
      consultationId: "consultation-1",
      providerId: "creator-1",
      status: ConsultationStatus.IN_DISCUSSION
    }, {
      store: {
        findPublishedAgentPackageBySlug: vi.fn(),
        create: vi.fn(),
        findManyForProvider: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({
          id: "consultation-1",
          providerId: "creator-1",
          status: ConsultationStatus.CLOSED,
          scopedSummary: null
        }),
        update: vi.fn()
      }
    })).rejects.toThrow("Invalid consultation status transition: CLOSED -> IN_DISCUSSION");
  });
});
