import { z } from "zod";
import matter from "gray-matter";

export const soulMdFrontmatterSchema = z.object({
  name: z.string().min(1).max(80),
  role: z.string().min(1).max(120),
  avatar: z.string().optional(),
  language: z.array(z.string()).min(1).default(["en"]),
});

export type SoulMdFrontmatter = z.infer<typeof soulMdFrontmatterSchema>;

export type ParsedSoulMd = {
  frontmatter: SoulMdFrontmatter;
  identity: string;
  personality: string;
  communicationStyle: string;
  boundaries: {
    mustDo: string[];
    neverDo: string[];
    needsConfirmation: string[];
  };
};

function extractSection(content: string, heading: string): string {
  const lines = content.split("\n");
  const headingPattern = new RegExp(`^#{2,4}\\s+${heading}`, "i");
  const startIdx = lines.findIndex((line) => line.trim().match(headingPattern));
  if (startIdx === -1) return "";

  const startLevel = (lines[startIdx].trim().match(/^(#{2,4})\s/) || ["", ""])[1].length;
  const sectionLines: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const headingMatch = trimmed.match(/^(#{2,4})\s/);
    if (headingMatch && headingMatch[1].length <= startLevel) break;
    sectionLines.push(lines[i]);
  }
  return sectionLines.join("\n").trim();
}

function extractListSection(content: string, subheading: string): string[] {
  const section = extractSection(content, subheading);
  if (!section) return [];
  return section
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter((line) => line.length > 0);
}

export function parseSoulMd(rawContent: string): ParsedSoulMd {
  const parsed = matter(rawContent);

  const frontmatter = soulMdFrontmatterSchema.parse(parsed.data);
  const body = parsed.content as string;

  return {
    frontmatter,
    identity: extractSection(body, "我是谁"),
    personality: extractSection(body, "个性特征"),
    communicationStyle: extractSection(body, "沟通风格"),
    boundaries: {
      mustDo: extractListSection(body, "必须做"),
      neverDo: extractListSection(body, "绝不做"),
      needsConfirmation: extractListSection(body, "需要确认"),
    },
  };
}
