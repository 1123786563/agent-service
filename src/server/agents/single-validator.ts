import JSZip from "jszip";
import { parseAgentsMd } from "./agents-md-schema";
import { parseSoulMd } from "./soul-md-schema";
import type { ParsedAgentsMd } from "./agents-md-schema";
import type { ParsedSoulMd } from "./soul-md-schema";

export type SingleValidationResult = {
  ok: boolean;
  errors: string[];
  risks: string[];
  fileNames: string[];
  agentsMd?: ParsedAgentsMd;
  soulMd?: ParsedSoulMd;
};

const REQUIRED_FILES = ["AGENTS.md", "SOUL.md", "README.md"];
const DANGEROUS_EXTENSIONS = [".exe", ".dmg", ".pkg", ".bat", ".cmd", ".ps1"];
const SCRIPT_EXTENSIONS = [".sh", ".js", ".ts", ".py", ".rb"];

export async function validateSingleAgentZip(buffer: Buffer): Promise<SingleValidationResult> {
  const errors: string[] = [];
  const risks: string[] = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return {
      ok: false,
      errors: ["Invalid ZIP archive"],
      risks,
      fileNames: [],
      agentsMd: undefined,
      soulMd: undefined,
    };
  }

  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

  for (const [fileName, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const lowerName = fileName.toLowerCase();
    if (DANGEROUS_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      errors.push(`Dangerous file type: ${fileName}`);
    }
    if (SCRIPT_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      risks.push(`script.file:${fileName}`);
    }
  }

  for (const requiredFile of REQUIRED_FILES) {
    if (!zip.file(requiredFile)) {
      errors.push(`Missing required file: ${requiredFile}`);
    }
  }

  let agentsMd: ParsedAgentsMd | undefined;
  const agentsMdFile = zip.file("AGENTS.md");
  if (agentsMdFile) {
    try {
      const rawContent = await agentsMdFile.async("string");
      agentsMd = parseAgentsMd(rawContent);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AGENTS.md error";
      errors.push(`AGENTS.md error: ${message}`);
    }
  }

  let soulMd: ParsedSoulMd | undefined;
  const soulMdFile = zip.file("SOUL.md");
  if (soulMdFile) {
    try {
      const rawContent = await soulMdFile.async("string");
      soulMd = parseSoulMd(rawContent);
      if (!soulMd.identity) {
        errors.push('SOUL.md must contain a "## 我是谁" section');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown SOUL.md error";
      errors.push(`SOUL.md error: ${message}`);
    }
  }

  if (agentsMd) {
    for (const skill of agentsMd.frontmatter.skills) {
      if (!zip.file(skill.path)) {
        errors.push(`Referenced skill file not found: ${skill.path}`);
      }
    }
    for (const workflow of agentsMd.frontmatter.workflows) {
      if (!zip.file(workflow.path)) {
        errors.push(`Referenced workflow file not found: ${workflow.path}`);
      }
    }
    for (const permission of agentsMd.frontmatter.permissions) {
      if (permission.includes("network")) risks.push("network.permission");
      if (permission.includes("filesystem.write")) risks.push("filesystem.write.permission");
    }
    if (agentsMd.frontmatter.env.length >= 3) risks.push("multiple.env.vars");
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    risks: [...new Set(risks)],
    fileNames,
    agentsMd,
    soulMd,
  };
}
