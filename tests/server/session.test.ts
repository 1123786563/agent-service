import { describe, expect, it } from "vitest";
import { createSessionTokenHash, isAdminEmail } from "@/server/auth/session";

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
});
