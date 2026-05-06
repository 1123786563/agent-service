import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Regression: ISSUE-002 — agents filter dropdown didn't include current URL category
//   when no packages had that category, causing dropdown to show "全部" instead
// Found by /qa on 2026-05-07
// Report: .gstack/qa-reports/qa-report-localhost-2026-05-07.md

vi.mock("@/server/agents/package-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/agents/package-service")>();
  return {
    ...actual,
    listPublishedAgentPackages: vi.fn(),
    isAgentPackageServiceAvailable: vi.fn().mockReturnValue(false),
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
    categories: ["ops"],
    downloadCount: 0,
    metadataJson: {},
    skills: [],
    workflows: [],
    consultations: [],
  }
] as never;

describe("agents page — URL category shown in dropdown (ISSUE-002 regression)", () => {
  it("includes URL category in dropdown even when no packages have that category", async () => {
    vi.mocked(listPublishedAgentPackages).mockResolvedValue(emptyPackages);

    const html = renderToStaticMarkup(await AgentsPage({
      searchParams: Promise.resolve({ category: "research" })
    }));

    // The dropdown should have a "research" option
    expect(html).toMatch(/<option[^>]*value="research"[^>]*>research<\/option>/);
    // The dropdown should have it selected (defaultValue)
    expect(html).toMatch(/value="research"[^>]*selected/);
  });

  it("includes URL category alongside existing package categories", async () => {
    vi.mocked(listPublishedAgentPackages).mockResolvedValue(emptyPackages);

    const html = renderToStaticMarkup(await AgentsPage({
      searchParams: Promise.resolve({ category: "writing" })
    }));

    // Should have both "ops" (from package) and "writing" (from URL)
    expect(html).toMatch(/value="ops"/);
    expect(html).toMatch(/value="writing"/);
  });
});
