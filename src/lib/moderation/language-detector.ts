import type { DetectedLanguage } from "./types";

const CJK_RANGES = {
  chinese: /[一-鿿㐀-䶿]/g,
  japanese_hiragana: /[぀-ゟ]/g,
  japanese_katakana: /[゠-ヿ]/g,
  korean: /[가-힯ᄀ-ᇿ]/g,
};

export function detectLanguage(text: string): DetectedLanguage {
  const stripped = text.replace(/\s/g, "");
  if (stripped.length === 0) return "unknown";

  const koreanCount = (text.match(CJK_RANGES.korean) ?? []).length;
  const hiraganaCount = (text.match(CJK_RANGES.japanese_hiragana) ?? []).length;
  const katakanaCount = (text.match(CJK_RANGES.japanese_katakana) ?? []).length;
  const japaneseCount = hiraganaCount + katakanaCount;
  const chineseCount = (text.match(CJK_RANGES.chinese) ?? []).length - japaneseCount;

  const totalCJK = koreanCount + japaneseCount + Math.max(chineseCount, 0);
  const latinCount = (text.match(/[a-zA-Z]/g) ?? []).length;

  if (totalCJK === 0 && latinCount > 0) return "en";
  if (totalCJK === 0) return "unknown";

  if (koreanCount > japaneseCount && koreanCount > Math.max(chineseCount, 0)) return "ko";
  if (japaneseCount > 0) return "ja";
  if (chineseCount > 0) return "zh";

  return "en";
}
