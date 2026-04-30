import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  prisma: {}
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn()
}));

vi.mock("@/server/mail/dev-mailer", () => ({
  sendDevLoginEmail: vi.fn()
}));

import { AuthFlowError, isAuthFlowError, normalizeMagicLinkEmail } from "@/server/auth/magic-link";

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
});
