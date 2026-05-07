import matter from "gray-matter";
import { z } from "zod";
import { agentMetadataSchema, type AgentMetadata } from "./metadata-schema";

export interface ParsedAgentsMd {
  metadata: AgentMetadata;
  content: string;
}

export function parseAgentsMd(markdown: string): ParsedAgentsMd {
  const { data, content } = matter(markdown);

  const metadata = agentMetadataSchema.parse(data);

  return { metadata, content };
}

export function safeParseAgentsMd(markdown: string): {
  success: true;
  data: ParsedAgentsMd;
} | {
  success: false;
  error: z.ZodError;
} {
  const { data, content } = matter(markdown);

  const result = agentMetadataSchema.safeParse(data);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, data: { metadata: result.data, content } };
}
