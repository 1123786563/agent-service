import { describe, expect, it } from "vitest";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

function makeRequest(path: string, options: { cookie?: string; method?: string } = {}) {
  const url = `http://localhost:3000${path}`;
  const headers: Record<string, string> = {};
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  return new NextRequest(url, { method: options.method ?? "GET", headers });
}

describe("middleware route protection", () => {
  it("redirects to /login when accessing /creator without session", () => {
    const req = makeRequest("/creator");
    const res = middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("next=%2Fcreator");
  });

  it("redirects to /login when accessing /account without session", () => {
    const req = makeRequest("/account/orders");
    const res = middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
  });

  it("allows /creator when session cookie is present", () => {
    const req = makeRequest("/creator", { cookie: "hermes_market_session=abc123" });
    const res = middleware(req);

    expect(res.status).toBe(200);
  });

  it("returns 401 for protected API routes without session", () => {
    const req = makeRequest("/api/auth/logout", { method: "POST" });
    const res = middleware(req);

    expect(res.status).toBe(401);
  });

  it("allows public API routes without session", () => {
    const req = makeRequest("/api/auth/login", { method: "POST" });
    const res = middleware(req);

    // Should not be 401
    expect(res.status).not.toBe(401);
  });

  it("allows public pages without session", () => {
    const req = makeRequest("/agents");
    const res = middleware(req);

    expect(res.status).toBe(200);
  });

  it("allows /login page without session", () => {
    const req = makeRequest("/login");
    const res = middleware(req);

    expect(res.status).toBe(200);
  });
});
