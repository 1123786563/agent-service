import { describe, expect, it } from "vitest";
import { detectLanguage } from "@/lib/moderation/language-detector";

describe("detectLanguage", () => {
  it("detects English text", () => {
    expect(detectLanguage("Hello, how are you today?")).toBe("en");
  });

  it("detects Chinese text", () => {
    expect(detectLanguage("今天天气很好")).toBe("zh");
  });

  it("detects Japanese text (hiragana)", () => {
    expect(detectLanguage("こんにちは世界")).toBe("ja");
  });

  it("detects Japanese text (katakana)", () => {
    expect(detectLanguage("コンビニでコーヒーを買った")).toBe("ja");
  });

  it("detects Korean text", () => {
    expect(detectLanguage("안녕하세요")).toBe("ko");
  });

  it("returns unknown for empty string", () => {
    expect(detectLanguage("")).toBe("unknown");
  });

  it("returns unknown for whitespace only", () => {
    expect(detectLanguage("   \t\n")).toBe("unknown");
  });

  it("detects mixed text with dominant CJK", () => {
    expect(detectLanguage("이것은 Korean 텍스트입니다")).toBe("ko");
  });

  it("detects mixed English and Chinese", () => {
    // More Chinese chars than English
    expect(detectLanguage("Hello世界和平人人有责")).toBe("zh");
  });
});
