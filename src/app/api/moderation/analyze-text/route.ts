import { NextResponse } from "next/server";

const TOXICITY_KEYWORDS: Record<string, string[]> = {
  en: ["hate", "kill", "stupid", "idiot", "die", "loser", "trash"],
  zh: ["仇恨", "杀", "蠢", "死", "垃圾"],
  ja: ["死ね", "殺す", "バカ"],
  ko: ["죽어", "바보", "쓰레기"],
};

function detectLanguage(text: string): "en" | "zh" | "ja" | "ko" {
  if (/[一-鿿]/.test(text)) return "zh";
  if (/[぀-ゟ゠-ヿ]/.test(text)) return "ja";
  if (/[가-힯]/.test(text)) return "ko";
  return "en";
}

export async function POST(request: Request) {
  const body = await request.json();
  const text: string = body.text ?? "";

  if (!text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const language = detectLanguage(text);
  const keywords = TOXICITY_KEYWORDS[language] ?? TOXICITY_KEYWORDS.en;
  const lower = text.toLowerCase();
  const flaggedPhrases = keywords.filter((kw) => lower.includes(kw));

  const baseToxicity = Math.min(flaggedPhrases.length * 0.25, 1.0);
  const toxicityScore = Math.round((baseToxicity + Math.random() * 0.15) * 100) / 100;

  let severity: "low" | "medium" | "high" | "critical";
  if (toxicityScore >= 0.8) severity = "critical";
  else if (toxicityScore >= 0.6) severity = "high";
  else if (toxicityScore >= 0.35) severity = "medium";
  else severity = "low";

  const recommendedAction =
    severity === "critical" || severity === "high"
      ? "reject"
      : severity === "medium"
        ? "flag"
        : "approve";

  return NextResponse.json({
    toxicityScore,
    flaggedPhrases,
    recommendedAction,
    confidence: Math.round((0.7 + Math.random() * 0.25) * 100) / 100,
    severity,
    language,
  });
}
