import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  prisma: {}
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn()
}));

vi.mock("@/server/mail/dev-mailer", () => ({
  sendDevLoginEmail: vi.fn()
}));

import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import {
  AuthFlowError,
  consumeMagicLink,
  getAuthFlowErrorMessage,
  isAuthFlowError,
  normalizeMagicLinkEmail
} from "@/server/auth/magic-link";
import { createSessionTokenHash } from "@/server/auth/session";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("magic link auth helpers", () => {
  it("normalizes valid emails before persistence", () => {
    expect(normalizeMagicLinkEmail("  Admin@Example.com ")).toBe("admin@example.com");
  });

  it("rejects empty or malformed emails with an auth flow error", () => {
    for (const email of ["", "   ", "not-an-email"]) {
      let thrown: unknown;

      try {
        normalizeMagicLinkEmail(email);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AuthFlowError);
      expect(isAuthFlowError(thrown)).toBe(true);
      expect((thrown as AuthFlowError).code).toBe("invalid-email");
    }
  });

  it("distinguishes auth flow errors from generic failures", () => {
    expect(isAuthFlowError(new AuthFlowError("invalid-token"))).toBe(true);
    expect(isAuthFlowError(new Error("boom"))).toBe(false);
  });

  it("maps auth flow error codes to stable messages", () => {
    expect(getAuthFlowErrorMessage("invalid-email")).toBe("Email address is invalid");
    expect(getAuthFlowErrorMessage("invalid-token")).toBe("Login link is invalid or expired");
  });

  it("rolls back the session row and token consume state when cookie setup fails", async () => {
    const consumeTransaction = {
      magicLinkToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ userId: "user-123" })
      },
      session: {
        create: vi.fn().mockResolvedValue({ id: "session-123" })
      }
    };
    const cleanupTransaction = {
      magicLinkToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      session: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    };

    vi.mocked(prisma).$transaction = vi
      .fn()
      .mockImplementationOnce(async (callback: (tx: typeof consumeTransaction) => Promise<unknown>) => {
        return callback(consumeTransaction);
      })
      .mockImplementationOnce(async (callback: (tx: typeof cleanupTransaction) => Promise<unknown>) => {
        return callback(cleanupTransaction);
      });

    vi.mocked(cookies).mockResolvedValue({
      set: vi.fn(() => {
        throw new Error("cookie failed");
      })
    } as never);

    await expect(consumeMagicLink(" raw-token ")).rejects.toThrow("cookie failed");

    expect(consumeTransaction.magicLinkToken.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: createSessionTokenHash("raw-token"),
        consumedAt: null,
        expiresAt: {
          gte: expect.any(Date)
        }
      },
      data: {
        consumedAt: expect.any(Date)
      }
    });
    expect(consumeTransaction.session.create).toHaveBeenCalledWith({
      data: {
        userId: "user-123",
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date)
      },
      select: {
        id: true
      }
    });
    expect(cleanupTransaction.session.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "session-123"
      }
    });
    expect(cleanupTransaction.magicLinkToken.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: createSessionTokenHash("raw-token"),
        consumedAt: expect.any(Date)
      },
      data: {
        consumedAt: null
      }
    });
  });
});
