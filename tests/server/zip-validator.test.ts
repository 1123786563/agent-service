import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createAgentZip } from "@/test/fixtures";
import { validateAgentZip } from "@/server/agents/zip-validator";

describe("validateAgentZip", () => {
  it("accepts a valid agent package and includes network.permission risk", async () => {
    const result = await validateAgentZip(await createAgentZip());

    expect(result.ok).toBe(true);
    expect(result.metadata?.id).toBe("research-assistant");
    expect(result.risks).toContain("network.permission");
  });

  it("rejects missing README.md", async () => {
    const zip = new JSZip();
    zip.file("agent.json", JSON.stringify({}));

    const result = await validateAgentZip(Buffer.from(await zip.generateAsync({ type: "nodebuffer" })));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing required file: README.md");
  });

  it("rejects metadata paths that do not exist in the archive", async () => {
    const zip = new JSZip();
    zip.file(
      "agent.json",
      JSON.stringify({
        id: "broken-agent",
        name: "Broken Agent",
        version: "1.0.0",
        summary: "这个包引用了不存在的 skill 文件。",
        categories: ["broken"],
        skills: [{ name: "missing", path: "skills/missing/SKILL.md", description: "missing" }],
        workflows: [{ name: "default", path: "workflows/main.json", description: "default" }],
        hermes: { minVersion: "0.1.0", importType: "zip" },
        permissions: [],
        env: [],
        author: { name: "作者" },
        service: { available: false, types: [] }
      })
    );
    zip.file("README.md", "# Broken Agent");
    zip.file("workflows/main.json", "{}");

    const result = await validateAgentZip(Buffer.from(await zip.generateAsync({ type: "nodebuffer" })));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Referenced skill file not found: skills/missing/SKILL.md");
  });
});
