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
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn()
    },
    consultation: {
      findMany: vi.fn(),
      count: vi.fn()
    },
    serviceOrder: {
      findMany: vi.fn(),
      count: vi.fn()
    },
    user: {
      findMany: vi.fn()
    }
  }
}));

import AdminPage from "@/app/admin/page";
import WhitelistPage from "@/app/admin/whitelist/page";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

describe("admin pages", () => {
  it("redirects non-admin users away from admin overview", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-1",
      role: UserRole.USER
    } as never);

    await expect(AdminPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("renders packages and whitelist management for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "admin-1",
      role: UserRole.ADMIN
    } as never);
    vi.mocked(prisma.agentPackage.findMany).mockResolvedValue([
      {
        id: "pkg-1",
        name: "Research Assistant",
        status: "PUBLISHED",
        downloadCount: 21,
        validationResult: {
          risks: ["network.permission"]
        },
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
        status: "PUBLISHED",
        downloadCount: 9,
        validationResult: {
          risks: []
        },
        owner: {
          email: "ops@example.com"
        },
        consultations: []
      }
    ] as never);
    vi.mocked(prisma.agentPackage.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.agentPackage.aggregate).mockResolvedValue({
      _sum: {
        downloadCount: 21
      }
    } as never);
    vi.mocked(prisma.consultation.findMany).mockResolvedValue([
      {
        id: "consultation-1",
        buyerEmail: "buyer@example.com",
        requirement: "Need deployment help",
        status: "NEW",
        agentPackage: {
          name: "Research Assistant"
        },
        provider: {
          email: "creator@example.com"
        }
      }
    ] as never);
    vi.mocked(prisma.consultation.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.serviceOrder.findMany).mockResolvedValue([
      {
        id: "order-1",
        title: "Deployment package",
        buyerEmail: "buyer@example.com",
        status: "DELIVERED",
        paymentStatus: "PAID",
        provider: {
          email: "creator@example.com"
        },
        deliveries: [
          {
            fileName: "handoff.txt",
            submittedAt: new Date("2026-04-30T08:00:00.000Z"),
            acceptedAt: null
          }
        ],
        consultation: {
          agentPackage: {
            name: "Research Assistant"
          }
        }
      },
      {
        id: "order-2",
        title: "Recovery package",
        buyerEmail: "retry@example.com",
        status: "PENDING_PAYMENT",
        paymentStatus: "FAILED",
        paymentReference: "devpay_failed",
        provider: {
          email: "ops@example.com"
        },
        deliveries: [],
        consultation: {
          agentPackage: {
            name: "Ops Copilot"
          }
        }
      }
    ] as never);
    vi.mocked(prisma.serviceOrder.count)
      .mockResolvedValueOnce(1 as never)
      .mockResolvedValueOnce(0 as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "user-1",
        email: "creator@example.com",
        role: "CREATOR",
        whitelistStatus: "ACTIVE",
        packages: [
          {
            id: "pkg-1",
            downloadCount: 21
          }
        ],
        providerOrders: []
      },
      {
        id: "user-2",
        email: "ops@example.com",
        role: "CREATOR",
        whitelistStatus: "ACTIVE",
        packages: [
          {
            id: "pkg-2",
            downloadCount: 9
          }
        ],
        providerOrders: [{ id: "order-2" }]
      }
    ] as never);

    const adminHtml = renderToStaticMarkup(await AdminPage());
    const whitelistHtml = renderToStaticMarkup(await WhitelistPage());

    expect(adminHtml).toContain("管理后台");
    expect(adminHtml).toContain("/admin/analytics");
    expect(adminHtml).toContain("Published");
    expect(adminHtml).toContain("Downloads");
    expect(adminHtml).toContain("21");
    expect(adminHtml).toContain("Research Assistant");
    expect(adminHtml).toContain("network.permission");
    expect(adminHtml).toContain("热门智能体");
    expect(adminHtml).toContain("Ops Copilot");
    expect(adminHtml).toContain("智能体转化明细");
    expect(adminHtml).toContain("咨询：2");
    expect(adminHtml).toContain("订单：2");
    expect(adminHtml).toContain("完成：1");
    expect(adminHtml).toContain("完成率：50%");
    expect(adminHtml).toContain("创作者榜单");
    expect(adminHtml).toContain("ops@example.com");
    expect(adminHtml).toContain("累计下载：21");
    expect(adminHtml).toContain("最近咨询");
    expect(adminHtml).toContain("buyer@example.com");
    expect(adminHtml).toContain("最近订单");
    expect(adminHtml).toContain("DELIVERED");
    expect(adminHtml).toContain("handoff.txt");
    expect(adminHtml).toContain("待验收");
    expect(adminHtml).toContain("支付异常订单");
    expect(adminHtml).toContain("devpay_failed");
    expect(adminHtml).toContain("重置为待支付");
    expect(whitelistHtml).toContain("白名单管理");
    expect(whitelistHtml).toContain("creator@example.com");
  });
});
