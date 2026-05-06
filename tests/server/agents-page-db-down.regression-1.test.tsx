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

// Regression: ISSUE-001 — agents page returned 500 blank page when database was unreachable
// Found by /qa on 2026-05-06
// Report: .gstack/qa-reports/qa-report-localhost-3000-2026-05-06.md

describe("agents page error handling", () => {
  it("renders a friendly error message when the database is unreachable", async () => {
    vi.mocked(listPublishedAgentPackages).mockRejectedValue(
      new Error("Can't reach database server at `localhost:5432`")
    );

    const html = renderToStaticMarkup(await AgentsPage({
      searchParams: Promise.resolve({})
    }));

    expect(html).toContain("智能体市场");
    expect(html).toContain("暂时无法加载");
    expect(html).toContain("服务正在启动中");
  });

  it("renders a friendly error message when the database query fails", async () => {
    vi.mocked(listPublishedAgentPackages).mockRejectedValue(
      new Error("Connection refused")
    );

    const html = renderToStaticMarkup(await AgentsPage({
      searchParams: Promise.resolve({ q: "test" })
    }));

    expect(html).toContain("暂时无法加载");
    expect(html).not.toContain("results");
  });
});
