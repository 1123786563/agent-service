import { describe, expect, it } from "vitest";
import { analyzeText, analyzeTextInputSchema } from "@/lib/moderation/text-analyzer";
import type { Rule } from "@/lib/moderation/rule-engine";

describe("analyzeText", () => {
  it("approves clean text", () => {
    const result = analyzeText({ text: "Hello, how are you today?" });

    expect(result.toxicityScore).toBe(0);
    expect(result.flaggedPhrases).toHaveLength(0);
    expect(result.recommendation).toBe("approve");
    expect(result.confidence).toBe("high");
    expect(result.processingTimeMs).toBeLessThan(200);
  });

  it("detects English profanity and flags it", () => {
    const result = analyzeText({ text: "What the fuck is this shit?" });

    expect(result.toxicityScore).toBeGreaterThan(0);
    expect(result.flaggedPhrases.length).toBeGreaterThanOrEqual(2);
    expect(result.recommendation).toBe("flag");
    expect(result.detectedLanguage).toBe("en");
    expect(result.processingTimeMs).toBeLessThan(200);
  });

  it("detects hate speech and rejects it", () => {
    const result = analyzeText({ text: "We must kill all those people" });

    expect(result.toxicityScore).toBeGreaterThanOrEqual(0.8);
    expect(result.recommendation).toBe("reject");
    expect(result.flaggedPhrases.some((p) => p.category === "hate_speech")).toBe(true);
  });

  it("detects threats as critical severity", () => {
    const result = analyzeText({ text: "I will kill you if you don't stop" });

    expect(result.toxicityScore).toBeGreaterThanOrEqual(0.8);
    expect(result.recommendation).toBe("reject");
    expect(result.flaggedPhrases.some((p) => p.category === "threat" && p.severity === "critical")).toBe(true);
  });

  it("detects harassment", () => {
    const result = analyzeText({ text: "You are worthless trash" });

    expect(result.toxicityScore).toBeGreaterThan(0);
    expect(result.flaggedPhrases.some((p) => p.category === "harassment")).toBe(true);
    expect(result.recommendation).toBe("flag");
  });

  it("detects Chinese profanity", () => {
    const result = analyzeText({ text: "这个草泥马真烦人", language: "zh" });

    expect(result.toxicityScore).toBeGreaterThan(0);
    expect(result.flaggedPhrases.length).toBeGreaterThanOrEqual(1);
    expect(result.recommendation).toBe("flag");
  });

  it("detects Japanese profanity", () => {
    const result = analyzeText({ text: "死ね、このバカ", language: "ja" });

    expect(result.toxicityScore).toBeGreaterThan(0);
    expect(result.flaggedPhrases.length).toBeGreaterThanOrEqual(2);
  });

  it("detects Korean profanity", () => {
    const result = analyzeText({ text: "씨발 이 개새끼", language: "ko" });

    expect(result.toxicityScore).toBeGreaterThan(0);
    expect(result.flaggedPhrases.length).toBeGreaterThanOrEqual(1);
  });

  it("auto-detects language when set to auto", () => {
    const result = analyzeText({ text: "これはテストです", language: "auto" });

    expect(result.detectedLanguage).toBe("ja");
  });

  it("auto-detects Chinese text", () => {
    const result = analyzeText({ text: "今天天气不错", language: "auto" });

    expect(result.detectedLanguage).toBe("zh");
  });

  it("auto-detects Korean text", () => {
    const result = analyzeText({ text: "안녕하세요", language: "auto" });

    expect(result.detectedLanguage).toBe("ko");
  });

  it("uses custom rules when provided", () => {
    const customRules: Rule[] = [
      {
        pattern: /\b(forbiddenword)\b/gi,
        category: "custom",
        severity: "high",
        languages: [],
      },
    ];

    const result = analyzeText(
      { text: "This has a forbiddenword in it" },
      { rules: customRules }
    );

    expect(result.flaggedPhrases).toHaveLength(1);
    expect(result.flaggedPhrases[0].phrase).toBe("forbiddenword");
    expect(result.flaggedPhrases[0].category).toBe("custom");
    expect(result.flaggedPhrases[0].severity).toBe("high");
  });

  it("respects max text length validation", () => {
    const longText = "a".repeat(100_001);

    const result = analyzeTextInputSchema.safeParse({ text: longText });
    expect(result.success).toBe(false);
  });

  it("reports processing time", () => {
    const result = analyzeText({ text: "Clean text" });
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("handles spam detection", () => {
    const result = analyzeText({ text: "Click here to claim your free money. You won the grand prize!" });

    expect(result.flaggedPhrases.some((p) => p.category === "spam")).toBe(true);
  });
});
