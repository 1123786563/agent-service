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
});
