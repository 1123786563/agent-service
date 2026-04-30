import { ConsultationStatus, WhitelistStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((location: string) => {
    throw new Error(`REDIRECT:${location}`);
  })
}));

vi.mock("@/server/auth/session", () => ({
  getCurrentUser: vi.fn()
}));

vi.mock("@/server/db", () => ({
  prisma: {
    consultation: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/app/creator/actions", () => ({
  createConsultationOrderAction: vi.fn()
}));

import CreatorConsultationsPage from "@/app/creator/consultations/page";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

describe("creator consultations page", () => {
  it("redirects anonymous users to login", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    await expect(CreatorConsultationsPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("renders consultations and order creation controls for active creators", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "creator-1",
      whitelistStatus: WhitelistStatus.ACTIVE
    } as never);
    vi.mocked(prisma.consultation.findMany).mockResolvedValue([
      {
        id: "consultation-1",
        buyerEmail: "buyer@example.com",
        requirement: "Deploy this agent for my team",
        scopedSummary: null,
        status: ConsultationStatus.NEW,
        createdAt: new Date("2026-04-30T08:00:00.000Z"),
        orders: [],
        agentPackage: {
          name: "Research Assistant"
        }
      }
    ] as never);

    const html = renderToStaticMarkup(await CreatorConsultationsPage());

    expect(html).toContain("Research Assistant");
    expect(html).toContain("buyer@example.com");
    expect(html).toContain("Deploy this agent for my team");
    expect(html).toContain("生成订单");
    expect(html).toContain("name=\"priceCents\"");
  });
});
