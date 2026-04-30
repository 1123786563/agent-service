import { ConsultationStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/server/auth/session", () => ({
  requireCreator: vi.fn()
}));

vi.mock("@/server/consultations/service", () => ({
  getConsultationById: vi.fn(),
  updateConsultation: vi.fn()
}));

vi.mock("@/server/orders/service", () => ({
  createServiceOrder: vi.fn()
}));

vi.mock("@/server/payments/adapter", () => ({
  getPaymentProvider: vi.fn(() => "dev")
}));

import { revalidatePath } from "next/cache";
import { createConsultationOrderAction } from "@/app/creator/actions";
import { requireCreator } from "@/server/auth/session";
import { getConsultationById, updateConsultation } from "@/server/consultations/service";
import { createServiceOrder } from "@/server/orders/service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("creator actions", () => {
  it("scopes a consultation and creates an order", async () => {
    vi.mocked(requireCreator).mockResolvedValue({ id: "creator-1" } as never);
    vi.mocked(getConsultationById).mockResolvedValue({
      id: "consultation-1",
      providerId: "creator-1",
      status: ConsultationStatus.NEW,
      scopedSummary: null
    } as never);
    vi.mocked(updateConsultation).mockResolvedValue({
      id: "consultation-1",
      status: ConsultationStatus.SCOPED
    } as never);
    vi.mocked(createServiceOrder).mockResolvedValue({
      id: "order-1"
    } as never);

    const formData = new FormData();
    formData.set("consultationId", "consultation-1");
    formData.set("title", "Deployment package");
    formData.set("scopedSummary", "Deploy for 20 internal users");
    formData.set("priceCents", "50000");
    formData.set("currency", "usd");

    await createConsultationOrderAction(formData);

    expect(updateConsultation).toHaveBeenCalledWith({
      consultationId: "consultation-1",
      providerId: "creator-1",
      status: ConsultationStatus.SCOPED,
      scopedSummary: "Deploy for 20 internal users"
    });
    expect(createServiceOrder).toHaveBeenCalledWith({
      consultationId: "consultation-1",
      providerId: "creator-1",
      title: "Deployment package",
      scope: "Deploy for 20 internal users",
      priceCents: 50000,
      currency: "USD",
      paymentProvider: "dev"
    });
    expect(revalidatePath).toHaveBeenCalledWith("/creator");
    expect(revalidatePath).toHaveBeenCalledWith("/creator/consultations");
    expect(revalidatePath).toHaveBeenCalledWith("/creator/orders");
  });

  it("rejects consultations that already have orders", async () => {
    vi.mocked(requireCreator).mockResolvedValue({ id: "creator-1" } as never);
    vi.mocked(getConsultationById).mockResolvedValue({
      id: "consultation-1",
      providerId: "creator-1",
      status: ConsultationStatus.ORDER_CREATED,
      scopedSummary: "Existing scope"
    } as never);

    const formData = new FormData();
    formData.set("consultationId", "consultation-1");
    formData.set("title", "Deployment package");
    formData.set("scopedSummary", "Existing scope");
    formData.set("priceCents", "50000");
    formData.set("currency", "USD");

    await expect(createConsultationOrderAction(formData)).rejects.toThrow("Consultation already has an order");
    expect(updateConsultation).not.toHaveBeenCalled();
    expect(createServiceOrder).not.toHaveBeenCalled();
  });
});
