import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { createTeamZip } from "@/test/fixtures";
import { validateTeamZip } from "@/server/agents/team-validator";

describe("validateTeamZip", () => {
  it("passes a valid team ZIP", async () => {
    const buffer = await createTeamZip();
    const result = await validateTeamZip(buffer);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.teamMd).toBeDefined();
    expect(result.teamMd!.frontmatter.agents).toHaveLength(2);
    expect(result.agentResults).toHaveLength(2);
  });

  it("fails when TEAM.md is missing", async () => {
    const buffer = await createTeamZip();
    const zip = await JSZip.loadAsync(buffer);
    zip.remove("TEAM.md");
    const newBuffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const result = await validateTeamZip(newBuffer);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing required file: TEAM.md");
  });

  it("fails when a child agent SOUL.md is missing", async () => {
    const buffer = await createTeamZip();
    const zip = await JSZip.loadAsync(buffer);
    zip.remove("agents/shopper/SOUL.md");
    const newBuffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const result = await validateTeamZip(newBuffer);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("agents/shopper/SOUL.md not found"))).toBe(true);
  });

  it("fails when routing.default references non-existent agent", async () => {
    const buffer = await createTeamZip();
    const zip = await JSZip.loadAsync(buffer);
    const teamMd = await zip.file("TEAM.md")!.async("string");
    zip.file("TEAM.md", teamMd.replace("default: shopper", "default: non-existent"));
    const newBuffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const result = await validateTeamZip(newBuffer);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("routing.default"))).toBe(true);
  });
});
