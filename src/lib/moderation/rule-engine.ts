import type { Severity, FlaggedPhrase, DetectedLanguage } from "./types";

export interface Rule {
  pattern: RegExp;
  category: string;
  severity: Severity;
  languages: DetectedLanguage[];
}

const SEVERITY_SCORE_MAP: Record<Severity, number> = {
  low: 0.15,
  medium: 0.35,
  high: 0.6,
  critical: 0.85,
};

export function evaluateRules(
  text: string,
  language: DetectedLanguage,
  rules: Rule[]
): FlaggedPhrase[] {
  const matches: FlaggedPhrase[] = [];
  const lowerText = text.toLowerCase();

  for (const rule of rules) {
    if (rule.languages.length > 0 && !rule.languages.includes(language) && language !== "unknown") {
      continue;
    }

    const regex = rule.pattern;
    let match: RegExpExecArray | null;

    // Reset lastIndex for regex with global flag
    regex.lastIndex = 0;

    while ((match = regex.exec(lowerText)) !== null) {
      const matchedPhrase = match[0];
      const startIndex = match.index;

      matches.push({
        phrase: text.substring(startIndex, startIndex + matchedPhrase.length),
        category: rule.category,
        severity: rule.severity,
        startIndex,
        endIndex: startIndex + matchedPhrase.length,
      });

      // Prevent infinite loops on zero-length matches
      if (matchedPhrase.length === 0) {
        regex.lastIndex++;
      }

      // Safety limit to prevent excessive matching
      if (matches.length >= 100) break;
    }
    if (matches.length >= 100) break;
  }

  return matches;
}

export function computeToxicityScore(flaggedPhrases: FlaggedPhrase[]): number {
  if (flaggedPhrases.length === 0) return 0;

  let totalScore = 0;
  for (const phrase of flaggedPhrases) {
    totalScore += SEVERITY_SCORE_MAP[phrase.severity];
  }

  // Normalize: average severity with a multiplier based on count
  const avgSeverity = totalScore / flaggedPhrases.length;
  const countMultiplier = Math.min(1 + flaggedPhrases.length * 0.05, 2.0);

  return Math.min(avgSeverity * countMultiplier, 1.0);
}

export function getDefaultRules(): Rule[] {
  return [
    // English profanity patterns
    {
      pattern: /\b(fuck|shit|damn|bitch|asshole|bastard|crap|dick|piss|whore)\b/gi,
      category: "profanity",
      severity: "medium",
      languages: ["en"],
    },
    // English hate speech indicators
    {
      pattern: /\b(kill\s+(all|every)\s+\w+|exterminate|ethnic\s+cleansing|genocide)\b/gi,
      category: "hate_speech",
      severity: "critical",
      languages: ["en"],
    },
    // English threat patterns
    {
      pattern: /\b(I\s+will\s+kill|I'm\s+going\s+to\s+hurt|threaten|bomb\s+(you|your|the))\b/gi,
      category: "threat",
      severity: "critical",
      languages: ["en"],
    },
    // English harassment
    {
      pattern: /\b(you\s+(are|re)\s+(stupid|ugly|worthless|idiot|retard|trash|loser|moron|dumb))\b/gi,
      category: "harassment",
      severity: "high",
      languages: ["en"],
    },
    // English spam patterns
    {
      pattern: /\b(click\s+here|free\s+money|you\s+won|act\s+now|limited\s+time\s+offer)\b/gi,
      category: "spam",
      severity: "low",
      languages: ["en"],
    },
    // Chinese profanity
    {
      pattern: /[操艹草泥马妈的妈逼傻逼废物滚蛋去死]/g,
      category: "profanity",
      severity: "medium",
      languages: ["zh"],
    },
    // Chinese hate speech
    {
      pattern: /(屠杀|种族灭绝|清洗|消灭)/g,
      category: "hate_speech",
      severity: "critical",
      languages: ["zh"],
    },
    // Chinese threats
    {
      pattern: /(我要杀|杀了你|弄死|打死你|砍死)/g,
      category: "threat",
      severity: "critical",
      languages: ["zh"],
    },
    // Chinese harassment
    {
      pattern: /(你是笨蛋|你是白痴|废物东西|垃圾人)/g,
      category: "harassment",
      severity: "high",
      languages: ["zh"],
    },
    // Japanese profanity
    {
      pattern: /(くそ|クソ|死ね|ふざけるな|ばか|バカ|あほ|アホ)/g,
      category: "profanity",
      severity: "medium",
      languages: ["ja"],
    },
    // Japanese threats
    {
      pattern: /(殺してやる|殺す|首を絞める|爆弾)/g,
      category: "threat",
      severity: "critical",
      languages: ["ja"],
    },
    // Korean profanity
    {
      pattern: /(씨발|시발|병신|개새끼|좆|좇|염병|옘병)/g,
      category: "profanity",
      severity: "medium",
      languages: ["ko"],
    },
    // Korean threats
    {
      pattern: /(죽여|죽이|폭탄|학살|멸종)/g,
      category: "threat",
      severity: "critical",
      languages: ["ko"],
    },
  ];
}
