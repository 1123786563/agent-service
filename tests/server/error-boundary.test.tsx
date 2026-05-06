import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ErrorBoundary from "@/app/error";

// Regression: ISSUE-003 — no error boundary, users saw blank page on server errors
// Found by /qa on 2026-05-06
// Report: .gstack/qa-reports/qa-report-localhost-3000-2026-05-06.md

describe("error boundary", () => {
  it("renders error message and retry button", () => {
    const error = new Error("Something went wrong");
    const html = renderToStaticMarkup(
      ErrorBoundary({ error, reset: () => {} })
    );

    expect(html).toContain("出了点问题");
    expect(html).toContain("Something went wrong");
    expect(html).toContain("重试");
    expect(html).toContain("返回首页");
  });

  it("shows fallback message when error has no message", () => {
    const error = new Error();
    error.message = "";
    const html = renderToStaticMarkup(
      ErrorBoundary({ error, reset: () => {} })
    );

    expect(html).toContain("出了点问题");
    expect(html).toContain("页面加载时发生错误");
  });

  it("renders link to homepage", () => {
    const error = new Error("test");
    const html = renderToStaticMarkup(
      ErrorBoundary({ error, reset: () => {} })
    );

    expect(html).toContain('href="/"');
  });
});
