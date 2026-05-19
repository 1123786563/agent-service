import { describe, expect, it, vi } from "vitest";
import { evaluateThreshold } from "@/lib/moderation/alert-service";

describe("evaluateThreshold", () => {
  it("returns true when value is greater than threshold", () => {
    expect(evaluateThreshold(10, "gt", 5)).toBe(true);
  });

  it("returns false when value is not greater than threshold", () => {
    expect(evaluateThreshold(5, "gt", 10)).toBe(false);
  });

  it("returns true when value equals threshold with gte operator", () => {
    expect(evaluateThreshold(5, "gte", 5)).toBe(true);
  });

  it("returns true when value equals threshold with eq operator", () => {
    expect(evaluateThreshold(5, "eq", 5)).toBe(true);
  });

  it("returns true when value is less than threshold", () => {
    expect(evaluateThreshold(3, "lt", 5)).toBe(true);
  });

  it("returns true when value equals threshold with lte operator", () => {
    expect(evaluateThreshold(5, "lte", 5)).toBe(true);
  });

  it("returns false for unknown operator", () => {
    expect(evaluateThreshold(10, "unknown" as any, 5)).toBe(false);
  });
});
