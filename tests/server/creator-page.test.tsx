import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentPackageStatus, WhitelistStatus } from "@prisma/client";

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
    agentPackage: {
      findMany: vi.fn()
    },
    consultation: {
      count: vi.fn()
    },
    serviceOrder: {
      count: vi.fn(),
      findMany: vi.fn()
    }
  }
}));

import CreatorPage from "@/app/creator/page";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

describe("creator page", () => {
  it("redirects anonymous users to login", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    await expect(CreatorPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("shows the whitelist message for non-active creators", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-123",
      email: "user@example.com",
      whitelistStatus: WhitelistStatus.INVITED
    } as never);

    const html = renderToStaticMarkup(await CreatorPage());

    expect(html).toContain("你的邮箱尚未进入白名单");
    expect(prisma.agentPackage.findMany).not.toHaveBeenCalled();
  });

  it("shows the current creator packages", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-123",
      email: "user@example.com",
      whitelistStatus: WhitelistStatus.ACTIVE
    } as never);
    vi.mocked(prisma.agentPackage.findMany).mockResolvedValue([
      {
        id: "pkg-123",
        name: "Research Assistant",
        slug: "research-assistant-1-0-0",
        summary: "Summarizes research findings.",
        status: AgentPackageStatus.PUBLISHED,
        downloadCount: 12
      }
    ] as never);
    vi.mocked(prisma.consultation.count).mockResolvedValue(3 as never);
    vi.mocked(prisma.serviceOrder.count).mockResolvedValue(2 as never);
    vi.mocked(prisma.serviceOrder.findMany).mockResolvedValue([
      {
        priceCents: 50000
      }
    ] as never);

    const html = renderToStaticMarkup(await CreatorPage());

    expect(prisma.agentPackage.findMany).toHaveBeenCalledWith({
      where: {
        ownerId: "user-123"
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    expect(html).toContain("累计下载");
    expect(html).toContain("12");
    expect(html).toContain("待处理咨询");
    expect(html).toContain("3");
    expect(html).toContain("待结算金额（分）");
    expect(html).toContain("50000");
    expect(html).toContain("Research Assistant");
    expect(html).toContain("已发布");
    expect(html).toContain("/agents/research-assistant-1-0-0");
    expect(html).toContain("/creator/consultations");
    expect(html).toContain("/creator/orders");
  });
});
