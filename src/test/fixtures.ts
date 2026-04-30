import JSZip from "jszip";

export async function createAgentZip(overrides: Record<string, string> = {}) {
  const zip = new JSZip();

  const metadata = {
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
    hermes: { minVersion: "0.1.0", importType: "zip" },
    permissions: ["network.optional"],
    env: [{ name: "OPENAI_API_KEY", required: true, description: "用于调用模型" }],
    author: { name: "作者名", website: "https://example.com" },
    service: { available: true, types: ["customization"] }
  };

  zip.file("agent.json", JSON.stringify(metadata, null, 2));
  zip.file("README.md", "# Research Assistant\n\n导入 Hermes-agent 后运行默认工作流。");
  zip.file("skills/web-research/SKILL.md", "# Web Research\n\n检索并整理资料。");
  zip.file("workflows/main.json", JSON.stringify({ steps: ["web-research"] }));

  for (const [path, content] of Object.entries(overrides)) {
    zip.file(path, content);
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
