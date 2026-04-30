import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  prisma: {
    session: {
      create: vi.fn(),
      deleteMany: vi.fn()
    }
  }
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn()
}));

import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import {
  buildSessionRecord,
  createSession,
  createSessionRecord,
  createSessionTokenHash,
  isAdminEmail,
  writeSessionCookie
} from "@/server/auth/session";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("session utilities", () => {
  it("hashes session tokens without returning the raw token", () => {
    const hash = createSessionTokenHash("secret-token");

    expect(hash).not.toBe("secret-token");
    expect(hash).toHaveLength(64);
  });

  it("detects admin emails from a comma-separated env value", () => {
    expect(isAdminEmail("admin@example.com", "admin@example.com,ops@example.com")).toBe(true);
    expect(isAdminEmail("user@example.com", "admin@example.com,ops@example.com")).toBe(false);
  });

  it("builds deterministic session records from explicit inputs", () => {
    const now = new Date("2026-04-30T00:00:00.000Z");
    const session = buildSessionRecord("user-123", {
      now,
      token: "secret-token"
    });

    expect(session).toEqual({
      userId: "user-123",
      token: "secret-token",
      tokenHash: createSessionTokenHash("secret-token"),
      expiresAt: new Date("2026-05-30T00:00:00.000Z")
    });
  });

  it("persists a derived session record and returns the created id", async () => {
    const create = vi.fn().mockResolvedValue({ id: "session-123" });

    const session = await createSessionRecord({ create }, "user-123");

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "user-123",
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt
      },
      select: {
        id: true
      }
    });
    expect(session.id).toBe("session-123");
    expect(session.userId).toBe("user-123");
    expect(session.tokenHash).toHaveLength(64);
    expect(session.token).toBeTruthy();
  });

  it("writes the session cookie with the expected security attributes", () => {
    const set = vi.fn();
    const expiresAt = new Date("2026-05-30T00:00:00.000Z");

    writeSessionCookie({ set }, { token: "secret-token", expiresAt });

    expect(set).toHaveBeenCalledWith("hermes_market_session", "secret-token", {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      expires: expiresAt
    });
  });

  it("creates a session row and writes a cookie on success", async () => {
    vi.mocked(prisma.session.create).mockResolvedValue({ id: "session-123" });
    vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 0 });

    const set = vi.fn();
    vi.mocked(cookies).mockResolvedValue({ set } as never);

    await createSession("user-123");

    expect(prisma.session.create).toHaveBeenCalledWith({
      data: {
        userId: "user-123",
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date)
      },
      select: {
        id: true
      }
    });
    expect(set).toHaveBeenCalledTimes(1);
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it("preserves the original cookie error when cleanup also fails", async () => {
    const cookieError = new Error("cookie failed");

    vi.mocked(prisma.session.create).mockResolvedValue({ id: "session-123" });
    vi.mocked(prisma.session.deleteMany).mockRejectedValue(new Error("cleanup failed"));
    vi.mocked(cookies).mockResolvedValue({
      set: vi.fn(() => {
        throw cookieError;
      })
    } as never);

    await expect(createSession("user-123")).rejects.toBe(cookieError);

    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "session-123"
      }
    });
  });
});
