import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs server-side smoke tests", () => {
    expect(1 + 1).toBe(2);
  });
});
