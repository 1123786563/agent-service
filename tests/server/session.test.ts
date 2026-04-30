import { describe, expect, it } from "vitest";
import { buildSessionRecord, createSessionTokenHash, isAdminEmail } from "@/server/auth/session";

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
});
