import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Regression: ISSUE-001 — no active navigation highlight
// Found by /qa on 2026-05-06
// Report: .gstack/qa-reports/qa-report-localhost-2026-05-06.md

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

import { usePathname } from "next/navigation";
import Nav from "@/app/nav";

describe("Nav active state", () => {
  it("highlights the current page link", () => {
    vi.mocked(usePathname).mockReturnValue("/agents");

    const html = renderToStaticMarkup(
      React.createElement(Nav)
    );

    expect(html).toContain('class="active"');
    expect(html).toContain("智能体");
    expect(html).toContain(">智能体</a>");
    // Other links should not be active
    expect(html).not.toMatch(/服务.*class="active"/);
  });

  it("highlights services page when on /services", () => {
    vi.mocked(usePathname).mockReturnValue("/services");

    const html = renderToStaticMarkup(
      React.createElement(Nav)
    );

    // The 服务 link should have active class and href /services
    const servicesLink = html.match(/<a[^>]*href="\/services"[^>]*>[^<]*服务<\/a>/)?.[0] ?? "";
    expect(servicesLink).toContain("active");
  });

  it("does not highlight any link when on homepage", () => {
    vi.mocked(usePathname).mockReturnValue("/");

    const html = renderToStaticMarkup(
      React.createElement(Nav)
    );

    expect(html).not.toContain('class="active"');
  });
});
