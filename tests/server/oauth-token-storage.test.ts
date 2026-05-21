import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock("@/server/auth/session", () => ({
  createSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { prisma } from "@/server/db";
import { handleOAuthLogin } from "@/server/auth/oauth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleOAuthLogin", () => {
  const baseInfo = {
    provider: "google" as const,
    providerAccountId: "google-123",
    email: "test@example.com",
    emailVerified: true,
    name: "Test User",
    avatarUrl: "https://example.com/avatar.jpg",
  };

  it("rejects unverified emails", async () => {
    await expect(
      handleOAuthLogin({ ...baseInfo, emailVerified: false })
    ).rejects.toThrow("Email not verified");
  });

  it("stores access token, refresh token, and expiry when creating a new user with OAuth", async () => {
    const expiresAt = new Date("2026-06-01T00:00:00Z");
    const userCreate = vi.fn().mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
    });
    const accountCreate = vi.fn().mockResolvedValue({ id: "account-1" });

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const tx = {
        oAuthAccount: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: accountCreate,
        },
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: userCreate,
        },
      };
      return fn(tx);
    });

    await handleOAuthLogin({
      ...baseInfo,
      accessToken: "ya29.access-token",
      refreshToken: "1//refresh-token",
      accessTokenExpiresAt: expiresAt,
    });

    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "test@example.com",
          oAuthAccounts: {
            create: expect.objectContaining({
              provider: "google",
              providerAccountId: "google-123",
              accessToken: "ya29.access-token",
              refreshToken: "1//refresh-token",
              expiresAt,
            }),
          },
        }),
      })
    );
  });

  it("updates tokens when existing OAuth account logs in again", async () => {
    const expiresAt = new Date("2026-06-01T00:00:00Z");
    const accountUpdate = vi.fn().mockResolvedValue({ id: "account-1" });

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const tx = {
        oAuthAccount: {
          findUnique: vi.fn().mockResolvedValue({
            id: "account-1",
            user: { id: "user-1", email: "test@example.com" },
          }),
          update: accountUpdate,
        },
        user: {
          findUnique: vi.fn(),
          create: vi.fn(),
        },
      };
      return fn(tx);
    });

    await handleOAuthLogin({
      ...baseInfo,
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      accessTokenExpiresAt: expiresAt,
    });

    expect(accountUpdate).toHaveBeenCalledWith({
      where: { id: "account-1" },
      data: {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresAt,
      },
    });
  });
});
