import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn()
    }
  }
}));

import CreatorPublicPage from "@/app/creators/[id]/page";
import { prisma } from "@/server/db";

describe("creator public page", () => {
  it("renders creator metrics and published packages", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "creator-1",
      email: "creator@example.com",
      packages: [
        {
          id: "pkg-1",
          name: "Research Assistant",
          slug: "research-assistant",
          summary: "Summarizes research findings.",
          version: "1.0.0",
          categories: ["research"],
          downloadCount: 21,
          metadataJson: {
            author: { name: "Creator" },
            service: { available: true, types: ["customization"] }
          },
          skills: [{ id: "skill-1", description: "Finds sources." }],
          workflows: [{ id: "workflow-1", description: "Default flow." }]
        }
      ],
      providerOrders: [{ id: "order-1" }, { id: "order-2" }]
    } as never);

    const html = renderToStaticMarkup(await CreatorPublicPage({
      params: Promise.resolve({ id: "creator-1" })
    }));

    expect(html).toContain("creator@example.com");
    expect(html).toContain("21 downloads");
    expect(html).toContain("2 completed orders");
    expect(html).toContain("Research Assistant");
    expect(html).toContain("/agents/research-assistant");
  });

  it("renders not found for unknown creators", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(CreatorPublicPage({
      params: Promise.resolve({ id: "missing-creator" })
    })).rejects.toThrow("NOT_FOUND");
  });
});
