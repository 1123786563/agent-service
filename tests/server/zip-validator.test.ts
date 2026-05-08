import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createSingleAgentZip, createTeamZip } from "@/test/fixtures";
import { validateAgentZip } from "@/server/agents/zip-validator";

async function generateBuffer(zip: JSZip) {
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("validateAgentZip", () => {
  it("accepts a valid single agent package and detects packageType", async () => {
    const result = await validateAgentZip(await createSingleAgentZip());

    expect(result.ok).toBe(true);
    expect(result.packageType).toBe("single");
    if (result.packageType === "single") {
      expect(result.agentsMd?.frontmatter.id).toBe("research-assistant");
      expect(result.soulMd?.frontmatter.name).toBe("ResearchBot");
    }
    expect(result.risks).toContain("network.permission");
  });

  it("accepts a valid team package and detects packageType", async () => {
    const result = await validateAgentZip(await createTeamZip());

    expect(result.ok).toBe(true);
    expect(result.packageType).toBe("team");
    if (result.packageType === "team") {
      expect(result.teamMd?.frontmatter.id).toBe("ecommerce-team");
      expect(result.agentResults).toHaveLength(2);
    }
  });

  it("rejects an invalid ZIP archive", async () => {
    const result = await validateAgentZip(Buffer.from("not a zip archive"));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Uploaded file is not a readable ZIP archive");
  });

  it("rejects missing README.md for single agent", async () => {
    const buffer = await createSingleAgentZip({ "README.md": null });
    const result = await validateAgentZip(buffer);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing required file: README.md");
  });

  it("rejects missing AGENTS.md for single agent", async () => {
    const buffer = await createSingleAgentZip({ "AGENTS.md": null });
    const result = await validateAgentZip(buffer);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing required file: AGENTS.md");
  });

  it("rejects dangerous file extensions", async () => {
    const buffer = await createSingleAgentZip({ "bin/install.exe": "binary" });
    const result = await validateAgentZip(buffer);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Dangerous file type"))).toBe(true);
  });

  it("rejects metadata paths that do not exist in the archive", async () => {
    const buffer = await createSingleAgentZip({ "skills/web-research/SKILL.md": null });
    const result = await validateAgentZip(buffer);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Referenced skill file not found"))).toBe(true);
  });

  it("rejects workflow paths that do not exist in the archive", async () => {
    const buffer = await createSingleAgentZip({ "workflows/main.json": null });
    const result = await validateAgentZip(buffer);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Referenced workflow file not found"))).toBe(true);
  });

  it("marks script, filesystem write, and multiple env var risks", async () => {
    const buffer = await createSingleAgentZip({ "scripts/setup.sh": "#!/bin/bash\necho setup" });
    const result = await validateAgentZip(buffer);

    expect(result.risks).toContain("script.file:scripts/setup.sh");
    expect(result.risks).toContain("network.permission");
  });

  it("rejects team zip with missing child agent SOUL.md", async () => {
    const buffer = await createTeamZip();
    const zip = await JSZip.loadAsync(buffer);
    zip.remove("agents/shopper/SOUL.md");
    const newBuffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const result = await validateAgentZip(newBuffer);

    expect(result.packageType).toBe("team");
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("agents/shopper/SOUL.md not found"))).toBe(true);
  });
});
