import { z } from "zod";
import type { TextAnalysisResult, ModerationRecommendation, ConfidenceLevel, FlaggedPhrase } from "./types";
import { detectLanguage } from "./language-detector";
import { evaluateRules, computeToxicityScore, getDefaultRules, type Rule } from "./rule-engine";

export const analyzeTextInputSchema = z.object({
  text: z.string().min(1).max(100_000),
  language: z.enum(["en", "zh", "ja", "ko", "auto"]).default("auto"),
});

export type AnalyzeTextInput = z.infer<typeof analyzeTextInputSchema>;

function determineRecommendation(score: number, flaggedPhrases: FlaggedPhrase[]): ModerationRecommendation {
  const hasCritical = flaggedPhrases.some((p) => p.severity === "critical");

  if (hasCritical || score >= 0.8) return "reject";
  if (score >= 0.3) return "flag";
  return "approve";
}

function determineConfidence(flaggedPhrases: FlaggedPhrase[]): ConfidenceLevel {
  if (flaggedPhrases.length === 0) return "high";
  if (flaggedPhrases.length <= 2) return "medium";
  if (flaggedPhrases.length >= 5) return "high";
  return "medium";
}

export interface TextAnalyzerDeps {
  rules?: Rule[];
  detectLanguage?: (text: string) => string;
}

export function analyzeText(
  input: { text: string; language?: "en" | "zh" | "ja" | "ko" | "auto" },
  deps?: TextAnalyzerDeps
): TextAnalysisResult {
  const start = performance.now();

  const rules = deps?.rules ?? getDefaultRules();
  const langInput = input.language ?? "auto";
  const language = langInput === "auto"
    ? (deps?.detectLanguage ?? detectLanguage)(input.text) as AnalyzeTextInput["language"]
    : langInput;

  const flaggedPhrases = evaluateRules(input.text, language as TextAnalysisResult["detectedLanguage"], rules);
  const toxicityScore = computeToxicityScore(flaggedPhrases);
  const recommendation = determineRecommendation(toxicityScore, flaggedPhrases);
  const confidence = determineConfidence(flaggedPhrases);

  const processingTimeMs = performance.now() - start;

  return {
    toxicityScore: Math.round(toxicityScore * 1000) / 1000,
    flaggedPhrases,
    recommendation,
    confidence,
    detectedLanguage: language as TextAnalysisResult["detectedLanguage"],
    processingTimeMs: Math.round(processingTimeMs * 100) / 100,
  };
}
