import { describe, it, expect } from "vitest";
import { createSingleAgentZip } from "@/test/fixtures";
import { validateSingleAgentZip } from "@/server/agents/single-validator";

describe("validateSingleAgentZip", () => {
  it("passes a valid single agent ZIP", async () => {
    const buffer = await createSingleAgentZip();
    const result = await validateSingleAgentZip(buffer);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.agentsMd).toBeDefined();
    expect(result.agentsMd!.frontmatter.id).toBe("research-assistant");
    expect(result.soulMd).toBeDefined();
    expect(result.soulMd!.frontmatter.name).toBe("ResearchBot");
  });

  it("fails when AGENTS.md is missing", async () => {
    const buffer = await createSingleAgentZip({ "AGENTS.md": null });
    const result = await validateSingleAgentZip(buffer);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing required file: AGENTS.md");
  });

  it("fails when SOUL.md is missing", async () => {
    const buffer = await createSingleAgentZip({ "SOUL.md": null });
    const result = await validateSingleAgentZip(buffer);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing required file: SOUL.md");
  });

  it("fails when a declared skill file is missing", async () => {
    const buffer = await createSingleAgentZip({ "skills/web-research/SKILL.md": null });
    const result = await validateSingleAgentZip(buffer);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Referenced skill file not found"))).toBe(true);
  });

  it("detects script files as risks", async () => {
    const buffer = await createSingleAgentZip({ "scripts/setup.sh": "#!/bin/bash\necho hi" });
    const result = await validateSingleAgentZip(buffer);

    expect(result.risks).toContain("script.file:scripts/setup.sh");
  });
});
