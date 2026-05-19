import { describe, expect, it } from "vitest";
import { evaluateRules, computeToxicityScore, getDefaultRules } from "@/lib/moderation/rule-engine";
import type { Rule } from "@/lib/moderation/rule-engine";

describe("evaluateRules", () => {
  it("returns empty array for clean text", () => {
    const rules = getDefaultRules();
    const result = evaluateRules("Hello, what a nice day!", "en", rules);
    expect(result).toHaveLength(0);
  });

  it("matches profanity rules", () => {
    const rules = getDefaultRules();
    const result = evaluateRules("What the fuck is this?", "en", rules);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((m) => m.category === "profanity")).toBe(true);
    expect(result.some((m) => m.phrase.toLowerCase().includes("fuck"))).toBe(true);
  });

  it("provides correct indices for matches", () => {
    const rule: Rule[] = [
      { pattern: /\b(bad)\b/gi, category: "test", severity: "low", languages: [] },
    ];
    const result = evaluateRules("This is bad content", "en", rule);

    expect(result).toHaveLength(1);
    expect(result[0].startIndex).toBe(8);
    expect(result[0].endIndex).toBe(11);
    expect(result[0].phrase).toBe("bad");
  });

  it("filters rules by language", () => {
    const rules: Rule[] = [
      { pattern: /\b(test)\b/gi, category: "en_only", severity: "low", languages: ["en"] },
      { pattern: /(テスト)/g, category: "ja_only", severity: "low", languages: ["ja"] },
    ];

    const enResult = evaluateRules("this is a test テスト", "en", rules);
    expect(enResult.some((m) => m.category === "en_only")).toBe(true);

    const jaResult = evaluateRules("this is a test テスト", "ja", rules);
    expect(jaResult.some((m) => m.category === "ja_only")).toBe(true);
  });

  it("matches all languages when languages array is empty", () => {
    const rules: Rule[] = [
      { pattern: /\b(test)\b/gi, category: "all_lang", severity: "low", languages: [] },
    ];

    expect(evaluateRules("test", "en", rules)).toHaveLength(1);
    expect(evaluateRules("test", "zh", rules)).toHaveLength(1);
  });
});

describe("computeToxicityScore", () => {
  it("returns 0 for no flagged phrases", () => {
    expect(computeToxicityScore([])).toBe(0);
  });

  it("increases with higher severity", () => {
    const low = computeToxicityScore([
      { phrase: "x", category: "test", severity: "low", startIndex: 0, endIndex: 1 },
    ]);
    const critical = computeToxicityScore([
      { phrase: "x", category: "test", severity: "critical", startIndex: 0, endIndex: 1 },
    ]);

    expect(critical).toBeGreaterThan(low);
  });

  it("increases with more flagged phrases", () => {
    const single = computeToxicityScore([
      { phrase: "x", category: "test", severity: "medium", startIndex: 0, endIndex: 1 },
    ]);
    const multiple = computeToxicityScore([
      { phrase: "x", category: "test", severity: "medium", startIndex: 0, endIndex: 1 },
      { phrase: "y", category: "test", severity: "medium", startIndex: 2, endIndex: 3 },
      { phrase: "z", category: "test", severity: "medium", startIndex: 4, endIndex: 5 },
    ]);

    expect(multiple).toBeGreaterThan(single);
  });

  it("caps at 1.0", () => {
    const score = computeToxicityScore(
      Array.from({ length: 20 }, (_, i) => ({
        phrase: `x${i}`,
        category: "test",
        severity: "critical" as const,
        startIndex: i,
        endIndex: i + 1,
      }))
    );

    expect(score).toBeLessThanOrEqual(1.0);
  });
});

describe("getDefaultRules", () => {
  it("returns rules for all supported languages", () => {
    const rules = getDefaultRules();
    const languages = new Set(rules.flatMap((r) => r.languages));

    expect(languages.has("en")).toBe(true);
    expect(languages.has("zh")).toBe(true);
    expect(languages.has("ja")).toBe(true);
    expect(languages.has("ko")).toBe(true);
  });

  it("includes critical severity rules for threats and hate speech", () => {
    const rules = getDefaultRules();
    const criticalRules = rules.filter((r) => r.severity === "critical");

    expect(criticalRules.length).toBeGreaterThan(0);
    expect(criticalRules.some((r) => r.category === "hate_speech")).toBe(true);
    expect(criticalRules.some((r) => r.category === "threat")).toBe(true);
  });
});
