import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UserRole } from "@prisma/client";

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
    },
    user: {
      findMany: vi.fn()
    }
  }
}));

import AdminAnalyticsPage from "@/app/admin/analytics/page";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

describe("admin analytics page", () => {
  it("redirects non-admin users away from analytics", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-1",
      role: UserRole.USER
    } as never);

    await expect(AdminAnalyticsPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("renders funnel, package rankings, and creator efficiency", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "admin-1",
      role: UserRole.ADMIN
    } as never);
    vi.mocked(prisma.agentPackage.findMany).mockResolvedValue([
      {
        id: "pkg-1",
        name: "Research Assistant",
        slug: "research-assistant",
        downloadCount: 20,
        owner: {
          email: "creator@example.com"
        },
        consultations: [
          {
            orders: [{ status: "COMPLETED" }]
          },
          {
            orders: [{ status: "IN_PROGRESS" }]
          }
        ]
      },
      {
        id: "pkg-2",
        name: "Ops Copilot",
        slug: "ops-copilot",
        downloadCount: 10,
        owner: {
          email: "ops@example.com"
        },
        consultations: [
          {
            orders: []
          }
        ]
      }
    ] as never);
    vi.mocked(prisma.consultation.count).mockResolvedValue(3 as never);
    vi.mocked(prisma.serviceOrder.count)
      .mockResolvedValueOnce(2 as never)
      .mockResolvedValueOnce(1 as never);
    vi.mocked(prisma.serviceOrder.findMany).mockResolvedValue([
      {
        priceCents: 5000,
        settledAt: new Date("2026-05-01T00:00:00.000Z")
      },
      {
        priceCents: 7000,
        settledAt: null
      }
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "creator-1",
        email: "creator@example.com",
        packages: [
          {
            downloadCount: 20,
            consultations: [
              {
                orders: [{ status: "COMPLETED" }]
              }
            ]
          }
        ],
        providerOrders: [{ id: "order-1" }]
      },
      {
        id: "creator-2",
        email: "ops@example.com",
        packages: [
          {
            downloadCount: 10,
            consultations: [
              {
                orders: []
              }
            ]
          }
        ],
        providerOrders: []
      }
    ] as never);

    const html = renderToStaticMarkup(await AdminAnalyticsPage());

    expect(html).toContain("运营分析");
    expect(html).toContain("累计下载");
    expect(html).toContain("咨询率 10%");
    expect(html).toContain("下单率 67%");
    expect(html).toContain("完成率 50%");
    expect(html).toContain("已结算订单");
    expect(html).toContain("待结算金额（分）");
    expect(html).toContain("漏斗明细");
    expect(html).toContain("高转化智能体");
    expect(html).toContain("Research Assistant");
    expect(html).toContain("/agents/research-assistant");
    expect(html).toContain("综合分：70");
    expect(html).toContain("创作者效率");
    expect(html).toContain("结算概览");
    expect(html).toContain("5000 分");
    expect(html).toContain("7000 分");
    expect(html).toContain("/creators/creator-1");
    expect(html).toContain("返回概览");
  });
});
