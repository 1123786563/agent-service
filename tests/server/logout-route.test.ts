import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({
  getCurrentSession: vi.fn(),
  deleteSessionByToken: vi.fn(),
  SESSION_COOKIE: "hermes_market_session",
}));

import { POST } from "@/app/api/auth/logout/route";
import { getCurrentSession, deleteSessionByToken } from "@/server/auth/session";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/logout", () => {
  it("deletes the session and clears the cookie when logged in", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      token: "abc",
      tokenHash: "hash",
      expiresAt: new Date(),
    } as never);

    const response = await POST();
    const body = await response.json();

    expect(deleteSessionByToken).toHaveBeenCalledWith("abc");
    expect(body.ok).toBe(true);

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("hermes_market_session=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("still clears the cookie when not logged in", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);

    const response = await POST();
    const body = await response.json();

    expect(deleteSessionByToken).not.toHaveBeenCalled();
    expect(body.ok).toBe(true);

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("Max-Age=0");
  });
});
