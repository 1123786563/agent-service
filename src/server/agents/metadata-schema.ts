import { z } from "zod";

const safeRelativePath = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/"), "Path must be relative")
  .refine((value) => !value.includes(".."), "Path cannot include parent traversal")
  .refine((value) => !value.includes("\\"), "Path must use forward slashes");

const skillSchema = z.object({
  name: z.string().min(1).max(80),
  path: safeRelativePath,
  description: z.string().min(1).max(500)
});

const workflowSchema = z.object({
  name: z.string().min(1).max(80),
  path: safeRelativePath,
  description: z.string().min(1).max(500)
});

const envSchema = z.object({
  name: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/, "Environment variable names must be uppercase snake case"),
  required: z.boolean(),
  description: z.string().min(1).max(300)
});

export const agentMetadataSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  summary: z.string().min(10).max(300),
  categories: z.array(z.string().min(1).max(40)).min(1).max(8),
  skills: z.array(skillSchema).min(1).max(30),
  workflows: z.array(workflowSchema).min(1).max(20),
  hermes: z.object({
    minVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    importType: z.literal("zip")
  }),
  permissions: z.array(z.string().min(1).max(80)).default([]),
  env: z.array(envSchema).default([]),
  author: z.object({
    name: z.string().min(1).max(120),
    website: z.string().url().optional()
  }),
  service: z
    .object({
      available: z.boolean(),
      types: z.array(z.enum(["customization", "deployment", "training", "integration"])).default([])
    })
    .default({ available: false, types: [] })
});

export type AgentMetadata = z.infer<typeof agentMetadataSchema>;

export function parseAgentMetadata(input: unknown): AgentMetadata {
  const result = agentMetadataSchema.safeParse(input);

  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid agent metadata: ${message}`);
  }

  return result.data;
}
