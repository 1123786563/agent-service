import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  prisma: {
    oAuthAccount: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/server/db";
import { refreshOAuthToken } from "@/server/auth/token-refresh";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("refreshOAuthToken", () => {
  it("returns existing token if not yet expired", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000);
    vi.mocked(prisma.oAuthAccount.findFirst).mockResolvedValue({
      id: "account-1",
      accessToken: "existing-token",
      refreshToken: "refresh-token",
      expiresAt: futureExpiry,
    } as never);

    const result = await refreshOAuthToken("user-1", "google");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.accessToken).toBe("existing-token");
      expect(result.expiresAt).toEqual(futureExpiry);
    }
  });

  it("returns no_refresh_token when account not found", async () => {
    vi.mocked(prisma.oAuthAccount.findFirst).mockResolvedValue(null);

    const result = await refreshOAuthToken("user-1", "google");

    expect(result).toEqual({ success: false, reason: "no_refresh_token" });
  });

  it("returns refresh_failed when token has expired and no refresh token exists", async () => {
    const pastExpiry = new Date(Date.now() - 1000);
    vi.mocked(prisma.oAuthAccount.findFirst).mockResolvedValue({
      id: "account-1",
      accessToken: "expired-token",
      refreshToken: null,
      expiresAt: pastExpiry,
    } as never);

    const result = await refreshOAuthToken("user-1", "google");

    expect(result).toEqual({ success: false, reason: "refresh_failed" });
  });
});
