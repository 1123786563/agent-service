import { describe, expect, it } from "vitest";
import { parseAgentMetadata } from "@/server/agents/metadata-schema";

const validMetadata = {
  id: "research-assistant",
  name: "Research Assistant",
  version: "1.0.0",
  summary: "帮助用户完成资料调研、摘要和报告初稿。",
  categories: ["research", "writing"],
  skills: [
    {
      name: "web-research",
      path: "skills/web-research/SKILL.md",
      description: "检索、筛选和整理资料"
    }
  ],
  workflows: [
    {
      name: "default",
      path: "workflows/main.json",
      description: "从用户问题到研究报告的默认流程"
    }
  ],
  hermes: {
    minVersion: "0.1.0",
    importType: "zip"
  },
  permissions: ["network.optional", "filesystem.read"],
  env: [
    {
      name: "OPENAI_API_KEY",
      required: true,
      description: "用于调用模型"
    }
  ],
  author: {
    name: "作者名",
    website: "https://example.com"
  },
  service: {
    available: true,
    types: ["customization", "deployment", "training"]
  }
};

describe("parseAgentMetadata", () => {
  it("accepts complete agent metadata", () => {
    const parsed = parseAgentMetadata(validMetadata);

    expect(parsed.name).toBe("Research Assistant");
    expect(parsed.skills[0].path).toBe("skills/web-research/SKILL.md");
  });

  it("rejects unsafe file paths", () => {
    expect(() =>
      parseAgentMetadata({
        ...validMetadata,
        skills: [{ name: "bad", path: "../secret.txt", description: "bad path" }]
      })
    ).toThrow("Invalid agent metadata");
  });

  it("rejects a non-zip import type", () => {
    expect(() =>
      parseAgentMetadata({
        ...validMetadata,
        hermes: { minVersion: "0.1.0", importType: "git" }
      })
    ).toThrow("Invalid agent metadata");
  });
});
