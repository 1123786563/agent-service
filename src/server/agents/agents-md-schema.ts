import { z } from "zod";
import matter from "gray-matter";

const safeRelativePath = z
  .string()
  .min(1)
  .refine((v) => !v.startsWith("/"), "Path must be relative")
  .refine((v) => !v.includes(".."), "Path cannot include parent traversal");

const skillSchema = z.object({
  name: z.string().min(1).max(80),
  path: safeRelativePath,
  description: z.string().min(1).max(500),
});

const workflowSchema = z.object({
  name: z.string().min(1).max(80),
  path: safeRelativePath,
  description: z.string().min(1).max(500),
});

const envSchema = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  required: z.boolean(),
  description: z.string().min(1).max(300),
});

export const agentsMdFrontmatterSchema = z.object({
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
  permissions: z.array(z.string().min(1).max(80)).default([]),
  env: z.array(envSchema).default([]),
  skills: z.array(skillSchema).min(1).max(30),
  workflows: z.array(workflowSchema).min(0).max(20).default([]),
  service: z
    .object({
      available: z.boolean(),
      types: z.array(z.enum(["customization", "deployment", "training", "integration"])).default([]),
    })
    .default({ available: false, types: [] }),
});

export type AgentsMdFrontmatter = z.infer<typeof agentsMdFrontmatterSchema>;

export type ParsedAgentsMd = {
  frontmatter: AgentsMdFrontmatter;
  behaviorInstructions: string;
};

export function parseAgentsMd(rawContent: string): ParsedAgentsMd {
  const parsed = matter(rawContent);

  const frontmatter = agentsMdFrontmatterSchema.parse(parsed.data);

  return {
    frontmatter,
    behaviorInstructions: (parsed.content as string).trim(),
  };
}
