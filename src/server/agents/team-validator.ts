import JSZip from "jszip";
import { parseTeamMd } from "./team-md-schema";
import { parseAgentsMd } from "./agents-md-schema";
import { parseSoulMd } from "./soul-md-schema";
import type { ParsedTeamMd } from "./team-md-schema";
import type { ParsedAgentsMd } from "./agents-md-schema";
import type { ParsedSoulMd } from "./soul-md-schema";

export type TeamValidationResult = {
  ok: boolean;
  errors: string[];
  risks: string[];
  fileNames: string[];
  teamMd?: ParsedTeamMd;
  agentResults: Array<{
    path: string;
    agentsMd?: ParsedAgentsMd;
    soulMd?: ParsedSoulMd;
    errors: string[];
  }>;
};

const REQUIRED_FILES = ["TEAM.md", "README.md"];

export async function validateTeamZip(buffer: Buffer): Promise<TeamValidationResult> {
  const errors: string[] = [];
  const risks: string[] = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return { ok: false, errors: ["Invalid ZIP archive"], risks, fileNames: [], agentResults: [] };
  }

  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

  for (const requiredFile of REQUIRED_FILES) {
    if (!zip.file(requiredFile)) {
      errors.push(`Missing required file: ${requiredFile}`);
    }
  }

  let teamMd: ParsedTeamMd | undefined;
  const teamMdFile = zip.file("TEAM.md");
  if (teamMdFile) {
    try {
      const rawContent = await teamMdFile.async("string");
      teamMd = parseTeamMd(rawContent);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown TEAM.md error";
      errors.push(`TEAM.md error: ${message}`);
    }
  }

  if (teamMd) {
    const agentIds = teamMd.frontmatter.agents.map((a) => a.id);
    if (!agentIds.includes(teamMd.frontmatter.routing.default)) {
      errors.push(`routing.default "${teamMd.frontmatter.routing.default}" not found in agents list`);
    }
    if (!agentIds.includes(teamMd.frontmatter.routing.fallback)) {
      errors.push(`routing.fallback "${teamMd.frontmatter.routing.fallback}" not found in agents list`);
    }
  }

  const agentResults: TeamValidationResult["agentResults"] = [];
  if (teamMd) {
    for (const agentEntry of teamMd.frontmatter.agents) {
      const agentPath = agentEntry.path.replace(/\/$/, "");
      const result: TeamValidationResult["agentResults"][0] = { path: agentPath, errors: [] };

      const agentsMdFile = zip.file(`${agentPath}/AGENTS.md`);
      const soulMdFile = zip.file(`${agentPath}/SOUL.md`);

      if (!agentsMdFile) {
        result.errors.push(`${agentPath}/AGENTS.md not found`);
      } else {
        try {
          const raw = await agentsMdFile.async("string");
          result.agentsMd = parseAgentsMd(raw);
          for (const skill of result.agentsMd.frontmatter.skills) {
            if (!zip.file(`${agentPath}/${skill.path}`)) {
              result.errors.push(
                `Agent ${agentEntry.id}: skill file not found: ${agentPath}/${skill.path}`
              );
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          result.errors.push(`${agentPath}/AGENTS.md error: ${message}`);
        }
      }

      if (!soulMdFile) {
        result.errors.push(`${agentPath}/SOUL.md not found`);
      } else {
        try {
          const raw = await soulMdFile.async("string");
          result.soulMd = parseSoulMd(raw);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          result.errors.push(`${agentPath}/SOUL.md error: ${message}`);
        }
      }

      agentResults.push(result);
      for (const err of result.errors) errors.push(err);
    }
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    risks: [...new Set(risks)],
    fileNames,
    teamMd,
    agentResults,
  };
}
