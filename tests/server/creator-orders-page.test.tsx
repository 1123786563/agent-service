import { PaymentStatus, ServiceOrderStatus, WhitelistStatus } from "@prisma/client";
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
    serviceOrder: {
      findMany: vi.fn()
    }
  }
}));

import CreatorOrdersPage from "@/app/creator/orders/page";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

describe("creator orders page", () => {
  it("renders creator orders with status labels", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "creator-1",
      whitelistStatus: WhitelistStatus.ACTIVE
    } as never);
    vi.mocked(prisma.serviceOrder.findMany).mockResolvedValue([
      {
        id: "order-1",
        title: "Research Assistant 服务订单",
        scope: "Deploy for 20 internal users",
        currency: "USD",
        priceCents: 50000,
        status: ServiceOrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.UNPAID,
        buyerEmail: "buyer@example.com",
        deliveries: [],
        consultation: {
          agentPackage: {
            name: "Research Assistant"
          }
        }
      }
    ] as never);

    const html = renderToStaticMarkup(await CreatorOrdersPage());

    expect(html).toContain("Research Assistant 服务订单");
    expect(html).toContain("Research Assistant");
    expect(html).toContain("buyer@example.com");
    expect(html).toContain("待支付");
  });

  it("renders delivery upload controls for in-progress orders", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "creator-1",
      whitelistStatus: WhitelistStatus.ACTIVE
    } as never);
    vi.mocked(prisma.serviceOrder.findMany).mockResolvedValue([
      {
        id: "order-1",
        title: "Research Assistant 服务订单",
        scope: "Deploy for 20 internal users",
        currency: "USD",
        priceCents: 50000,
        status: ServiceOrderStatus.IN_PROGRESS,
        paymentStatus: PaymentStatus.PAID,
        buyerEmail: "buyer@example.com",
        deliveries: [
          {
            fileName: "handoff.txt"
          }
        ],
        consultation: {
          agentPackage: {
            name: "Research Assistant"
          }
        }
      }
    ] as never);

    const html = renderToStaticMarkup(await CreatorOrdersPage());

    expect(html).toContain("进行中");
    expect(html).toContain("上传交付物");
    expect(html).toContain("/api/orders/order-1/deliveries");
    expect(html).toContain("handoff.txt");
    expect(html).toContain("/api/orders/order-1/dispute");
    expect(html).toContain("发起争议");
  });

  it("shows settlement state for completed orders", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "creator-1",
      whitelistStatus: WhitelistStatus.ACTIVE
    } as never);
    vi.mocked(prisma.serviceOrder.findMany).mockResolvedValue([
      {
        id: "order-2",
        title: "Settlement order",
        scope: "Completed work",
        currency: "USD",
        priceCents: 50000,
        status: ServiceOrderStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID,
        settledAt: null,
        buyerEmail: "buyer@example.com",
        deliveries: [],
        consultation: {
          agentPackage: {
            name: "Research Assistant"
          }
        }
      }
    ] as never);

    const html = renderToStaticMarkup(await CreatorOrdersPage());

    expect(html).toContain("Settlement order");
    expect(html).toContain("结算状态：待结算");
  });
});
