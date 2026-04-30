import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WhitelistStatus } from "@prisma/client";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((location: string) => {
    throw new Error(`REDIRECT:${location}`);
  })
}));

vi.mock("@/server/auth/session", () => ({
  getCurrentUser: vi.fn()
}));

import NewAgentPage from "@/app/creator/agents/new/page";
import { getCurrentUser } from "@/server/auth/session";

describe("new creator agent page", () => {
  it("redirects anonymous users to login", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    await expect(NewAgentPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("shows the whitelist message for non-active creators", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-123",
      email: "user@example.com",
      whitelistStatus: WhitelistStatus.INVITED
    } as never);

    const html = renderToStaticMarkup(await NewAgentPage());

    expect(html).toContain("你的邮箱尚未进入白名单");
  });
});
