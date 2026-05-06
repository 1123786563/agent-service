import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NotFound from "@/app/not-found";

// Regression: ISSUE-001 — 404 page showed English default text instead of Chinese
// Found by /qa on 2026-05-06
// Report: .gstack/qa-reports/qa-report-localhost-3000-2026-05-06.md

describe("not-found page", () => {
  it("renders Chinese title and description", () => {
    const html = renderToStaticMarkup(<NotFound />);

    expect(html).toContain("页面未找到");
    expect(html).toContain("你访问的页面不存在");
  });

  it("renders link back to homepage", () => {
    const html = renderToStaticMarkup(<NotFound />);

    expect(html).toContain("返回首页");
    expect(html).toContain('href="/"');
  });
});
