import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/server/agents/package-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/agents/package-service")>();
  return {
    ...actual,
    listPublishedAgentPackages: vi.fn()
  };
});

import AgentsPage from "@/app/agents/page";
import { listPublishedAgentPackages } from "@/server/agents/package-service";

describe("agents page", () => {
  it("renders published agent cards", async () => {
    vi.mocked(listPublishedAgentPackages).mockResolvedValue([
      {
        id: "pkg-123",
        name: "Research Assistant",
        slug: "research-assistant-1-0-0",
        summary: "Summarizes research findings.",
        version: "1.0.0",
        categories: ["research", "writing"],
        downloadCount: 12,
        metadataJson: {
          author: { name: "Creator" },
          service: { available: true, types: ["customization"] }
        },
        skills: [{ id: "skill-1", description: "Finds sources." }],
        workflows: [{ id: "workflow-1", description: "Default flow." }]
      }
    ] as never);

    const html = renderToStaticMarkup(await AgentsPage({
      searchParams: Promise.resolve({
        q: "research",
        category: "research",
        sort: "downloads"
      })
    }));

    expect(html).toContain("智能体市场");
    expect(html).toContain("Research Assistant");
    expect(html).toContain("research / writing");
    expect(html).toContain("/agents/research-assistant-1-0-0");
    expect(html).toContain("12 downloads");
    expect(html).toContain("完整度 100%");
    expect(html).toContain("name=\"q\"");
    expect(html).toContain("results");
    expect(listPublishedAgentPackages).toHaveBeenCalledWith({
      query: "research",
      category: "research",
      sort: "downloads"
    });
  });
});
