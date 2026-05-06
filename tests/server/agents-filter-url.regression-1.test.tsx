import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Regression: ISSUE-006 — filter button generated empty URL params (q=&category=&sort=downloads)
// Found by /qa on 2026-05-06
// Report: .gstack/qa-reports/qa-report-localhost-3000-2026-05-06.md

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/server/agents/package-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/agents/package-service")>();
  return {
    ...actual,
    listPublishedAgentPackages: vi.fn()
  };
});

import AgentsPage from "@/app/agents/page";
import { listPublishedAgentPackages } from "@/server/agents/package-service";

const emptyPackages = [
  {
    id: "pkg-1",
    name: "Test Agent",
    slug: "test-agent",
    summary: "A test.",
    version: "1.0.0",
    categories: [],
    downloadCount: 0,
    metadataJson: {},
    skills: [],
    workflows: [],
    consultations: []
  }
] as never;

describe("agents page — clean filter URLs (ISSUE-006 regression)", () => {
  it("buildAgentsUrl omits empty q and category in 查看全部 link", async () => {
    vi.mocked(listPublishedAgentPackages).mockResolvedValue(emptyPackages);

    const html = renderToStaticMarkup(await AgentsPage({
      searchParams: Promise.resolve({ service: "1" })
    }));

    const hrefMatch = html.match(/href="([^"]*agents[^"]*)"/g);
    expect(hrefMatch).toBeDefined();
    for (const match of hrefMatch!) {
      expect(match).not.toContain("q=&");
      expect(match).not.toContain("category=&");
      expect(match).not.toMatch(/&&/);
    }
  });

  it("buildAgentsUrl includes sort when non-default and omits empty params", async () => {
    vi.mocked(listPublishedAgentPackages).mockResolvedValue(emptyPackages);

    const html = renderToStaticMarkup(await AgentsPage({
      searchParams: Promise.resolve({ sort: "downloads", service: "1" })
    }));

    expect(html).toContain("sort=downloads");
    expect(html).not.toContain("q=&");
    expect(html).not.toContain("category=&");
  });

  it("buildAgentsUrl includes q and category when provided", async () => {
    vi.mocked(listPublishedAgentPackages).mockResolvedValue(emptyPackages);

    const html = renderToStaticMarkup(await AgentsPage({
      searchParams: Promise.resolve({ q: "test", category: "research", sort: "name" })
    }));

    expect(html).toMatch(/q=test/);
    expect(html).toMatch(/category=research/);
    expect(html).toMatch(/sort=name/);
  });
});
