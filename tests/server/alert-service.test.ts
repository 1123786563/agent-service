import { describe, expect, it } from "vitest";
import { evaluateThreshold } from "@/lib/moderation/alert-service";

describe("evaluateThreshold", () => {
  it("returns true for gt when value exceeds threshold", () => {
    expect(evaluateThreshold(10, "gt", 5)).toBe(true);
    expect(evaluateThreshold(5, "gt", 5)).toBe(false);
    expect(evaluateThreshold(4, "gt", 5)).toBe(false);
  });

  it("returns true for gte when value meets or exceeds threshold", () => {
    expect(evaluateThreshold(10, "gte", 5)).toBe(true);
    expect(evaluateThreshold(5, "gte", 5)).toBe(true);
    expect(evaluateThreshold(4, "gte", 5)).toBe(false);
  });

  it("returns true for lt when value is below threshold", () => {
    expect(evaluateThreshold(3, "lt", 5)).toBe(true);
    expect(evaluateThreshold(5, "lt", 5)).toBe(false);
    expect(evaluateThreshold(6, "lt", 5)).toBe(false);
  });

  it("returns true for lte when value is at or below threshold", () => {
    expect(evaluateThreshold(3, "lte", 5)).toBe(true);
    expect(evaluateThreshold(5, "lte", 5)).toBe(true);
    expect(evaluateThreshold(6, "lte", 5)).toBe(false);
  });

  it("returns true for eq when value equals threshold", () => {
    expect(evaluateThreshold(5, "eq", 5)).toBe(true);
    expect(evaluateThreshold(5.0, "eq", 5)).toBe(true);
    expect(evaluateThreshold(5.1, "eq", 5)).toBe(false);
  });

  it("handles edge cases with zero", () => {
    expect(evaluateThreshold(0, "gt", -1)).toBe(true);
    expect(evaluateThreshold(0, "lt", 1)).toBe(true);
    expect(evaluateThreshold(0, "eq", 0)).toBe(true);
    expect(evaluateThreshold(0, "gte", 0)).toBe(true);
    expect(evaluateThreshold(0, "lte", 0)).toBe(true);
  });

  it("handles negative values", () => {
    expect(evaluateThreshold(-5, "lt", 0)).toBe(true);
    expect(evaluateThreshold(-5, "gte", -5)).toBe(true);
  });

  it("handles floating point values", () => {
    expect(evaluateThreshold(0.7, "gt", 0.5)).toBe(true);
    expect(evaluateThreshold(0.3, "gte", 0.3)).toBe(true);
    expect(evaluateThreshold(99.9, "lt", 100)).toBe(true);
  });
});
