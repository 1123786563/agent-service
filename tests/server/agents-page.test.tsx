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
  it("renders published agent cards and service-first conversion links", async () => {
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
      },
      {
        id: "pkg-456",
        name: "Utility Bot",
        slug: "utility-bot-1-0-0",
        summary: "Handles routine tasks.",
        version: "1.0.0",
        categories: ["ops"],
        downloadCount: 2,
        metadataJson: {},
        skills: [{ id: "skill-2", description: "Does routine work." }],
        workflows: [{ id: "workflow-2", description: "Utility flow." }]
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
    expect(html).toContain("/agents/research-assistant-1-0-0#consultation");
    expect(html).toContain("12 downloads");
    expect(html).toContain("完整度 100%");
    expect(html).toContain("支持定制/部署服务");
    expect(html).toContain("仅看可提供服务");
    expect(html).toContain("name=\"q\"");
    expect(html).toContain("results");
    expect(listPublishedAgentPackages).toHaveBeenCalledWith({
      query: "research",
      category: "research",
      sort: "downloads"
    });
  });

  it("filters down to service-enabled packages when requested", async () => {
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
          service: { available: true, types: ["customization"] }
        },
        skills: [{ id: "skill-1", description: "Finds sources." }],
        workflows: [{ id: "workflow-1", description: "Default flow." }]
      },
      {
        id: "pkg-456",
        name: "Utility Bot",
        slug: "utility-bot-1-0-0",
        summary: "Handles routine tasks.",
        version: "1.0.0",
        categories: ["ops"],
        downloadCount: 2,
        metadataJson: {},
        skills: [{ id: "skill-2", description: "Does routine work." }],
        workflows: [{ id: "workflow-2", description: "Utility flow." }]
      }
    ] as never);

    const html = renderToStaticMarkup(await AgentsPage({
      searchParams: Promise.resolve({
        service: "1"
      })
    }));

    expect(html).toContain("Research Assistant");
    expect(html).not.toContain("Utility Bot");
    expect(html).toContain("1 results");
    expect(html).toContain("查看全部");
    expect(html).toContain("checked");
  });
});
