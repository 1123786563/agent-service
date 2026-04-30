import { PaymentStatus, ServiceOrderStatus } from "@prisma/client";
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

import AccountOrdersPage from "@/app/account/orders/page";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

describe("account orders page", () => {
  it("redirects anonymous users to login", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    await expect(AccountOrdersPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("renders payable buyer orders", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      email: "buyer@example.com"
    } as never);
    vi.mocked(prisma.serviceOrder.findMany).mockResolvedValue([
      {
        id: "order-1",
        title: "Deployment package",
        scope: "Deploy for 20 internal users",
        currency: "USD",
        priceCents: 50000,
        status: ServiceOrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.UNPAID,
        consultation: {
          agentPackage: {
            name: "Research Assistant"
          }
        },
        provider: {
          email: "creator@example.com"
        }
      }
    ] as never);

    const html = renderToStaticMarkup(await AccountOrdersPage());

    expect(html).toContain("Deployment package");
    expect(html).toContain("Research Assistant");
    expect(html).toContain("creator@example.com");
    expect(html).toContain("去支付");
    expect(html).toContain("/api/orders/order-1/pay");
  });
});
