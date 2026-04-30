import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
}));

vi.mock("@/server/agents/package-service", () => ({
  getPublishedAgentPackageBySlug: vi.fn()
}));

import AgentDetailPage from "@/app/agents/[slug]/page";
import { getPublishedAgentPackageBySlug } from "@/server/agents/package-service";

describe("agent detail page", () => {
  it("renders the published package detail", async () => {
    vi.mocked(getPublishedAgentPackageBySlug).mockResolvedValue({
      id: "pkg-123",
      name: "Research Assistant",
      slug: "research-assistant-1-0-0",
      summary: "Summarizes research findings.",
      version: "1.0.0",
      validationResult: {
        risks: ["network.permission"]
      },
      owner: {
        email: "creator@example.com"
      },
      skills: [
        {
          id: "skill-1",
          name: "research",
          description: "Finds sources.",
          path: "skills/research/SKILL.md"
        }
      ],
      workflows: [
        {
          id: "workflow-1",
          name: "default",
          description: "Default flow.",
          path: "workflows/main.json"
        }
      ]
    } as never);

    const html = renderToStaticMarkup(await AgentDetailPage({
      params: Promise.resolve({ slug: "research-assistant-1-0-0" })
    }));

    expect(html).toContain("Research Assistant");
    expect(html).toContain("creator@example.com");
    expect(html).toContain("/api/agents/research-assistant-1-0-0/download");
    expect(html).toContain("network.permission");
    expect(html).toContain("咨询服务");
    expect(html).toContain("name=\"buyerEmail\"");
  });

  it("renders not found for an unknown slug", async () => {
    vi.mocked(getPublishedAgentPackageBySlug).mockResolvedValue(null);

    await expect(AgentDetailPage({
      params: Promise.resolve({ slug: "missing-agent" })
    })).rejects.toThrow("NOT_FOUND");
  });
});
