import { z } from "zod";
import matter from "gray-matter";

const agentEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  path: z.string().min(1),
  role: z.string().min(1).max(200),
  triggers: z.array(z.string().min(1)),
});

export const teamMdFrontmatterSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  summary: z.string().min(10).max(300),
  categories: z.array(z.string().min(1).max(40)).min(1).max(8),
  author: z.object({
    name: z.string().min(1).max(120),
    website: z.string().url().optional(),
  }),
  pricing: z
    .object({
      type: z.enum(["free", "paid"]),
      price: z.number().min(0).default(0),
    })
    .default({ type: "free", price: 0 }),
  hermes: z.object({
    minVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  }),
  agents: z.array(agentEntrySchema).min(2).max(20),
  routing: z.object({
    default: z.string(),
    fallback: z.string(),
  }),
  shared: z
    .array(
      z.object({
        path: z.string().min(1),
        description: z.string().min(1).max(300),
      })
    )
    .default([]),
});

export type TeamMdFrontmatter = z.infer<typeof teamMdFrontmatterSchema>;

export type ParsedTeamMd = {
  frontmatter: TeamMdFrontmatter;
  collaborationRules: string;
};

export function parseTeamMd(rawContent: string): ParsedTeamMd {
  const parsed = matter(rawContent);

  const frontmatter = teamMdFrontmatterSchema.parse(parsed.data);

  return {
    frontmatter,
    collaborationRules: (parsed.content as string).trim(),
  };
}
