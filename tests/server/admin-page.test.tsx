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
        validationResult: {
          risks: ["network.permission"]
        },
        owner: {
          email: "creator@example.com"
        }
      }
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "user-1",
        email: "creator@example.com",
        role: "CREATOR",
        whitelistStatus: "ACTIVE"
      }
    ] as never);

    const adminHtml = renderToStaticMarkup(await AdminPage());
    const whitelistHtml = renderToStaticMarkup(await WhitelistPage());

    expect(adminHtml).toContain("管理后台");
    expect(adminHtml).toContain("Research Assistant");
    expect(adminHtml).toContain("network.permission");
    expect(whitelistHtml).toContain("白名单管理");
    expect(whitelistHtml).toContain("creator@example.com");
  });
});
