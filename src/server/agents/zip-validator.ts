import JSZip from "jszip";
import type { AgentMetadata } from "./metadata-schema";
import { parseAgentMetadata } from "./metadata-schema";

export const MAX_ZIP_BYTES = 25 * 1024 * 1024;
export const MAX_FILE_COUNT = 250;

const REQUIRED_FILES = ["agent.json", "README.md"];
const DANGEROUS_EXTENSIONS = [".exe", ".dmg", ".pkg", ".bat", ".cmd", ".ps1"];
const SCRIPT_EXTENSIONS = [".sh", ".js", ".ts", ".py", ".rb"];

export type ZipValidationResult = {
  ok: boolean;
  errors: string[];
  risks: string[];
  fileNames: string[];
  metadata?: AgentMetadata;
};

export async function validateAgentZip(buffer: Buffer): Promise<ZipValidationResult> {
  const errors: string[] = [];
  const risks: string[] = [];

  if (buffer.byteLength > MAX_ZIP_BYTES) {
    return {
      ok: false,
      errors: [`ZIP exceeds ${MAX_ZIP_BYTES} bytes`],
      risks,
      fileNames: []
    };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return {
      ok: false,
      errors: ["Uploaded file is not a readable ZIP archive"],
      risks,
      fileNames: []
    };
  }

  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

  if (fileNames.length > MAX_FILE_COUNT) {
    errors.push(`ZIP contains more than ${MAX_FILE_COUNT} files`);
  }

  for (const fileName of fileNames) {
    const entry = zip.files[fileName];
    const originalName = entry.unsafeOriginalName ?? fileName;

    if (!isSafeRelativePath(fileName) || !isSafeRelativePath(originalName)) {
      errors.push(`Unsafe path in ZIP: ${originalName}`);
    }

    const lowerName = fileName.toLowerCase();
    if (DANGEROUS_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
      errors.push(`Dangerous file type in ZIP: ${fileName}`);
    }

    if (SCRIPT_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
      risks.push(`script.file:${fileName}`);
    }
  }

  for (const requiredFile of REQUIRED_FILES) {
    if (!zip.file(requiredFile)) {
      errors.push(`Missing required file: ${requiredFile}`);
    }
  }

  const agentJsonFile = zip.file("agent.json");
  if (!agentJsonFile) {
    return {
      ok: false,
      errors,
      risks: unique(risks),
      fileNames
    };
  }

  let metadata: AgentMetadata | undefined;
  try {
    const rawMetadata = await agentJsonFile.async("string");
    metadata = parseAgentMetadata(JSON.parse(rawMetadata));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown metadata error";
    errors.push(message);
  }

  if (metadata) {
    for (const skill of metadata.skills) {
      if (!zip.file(skill.path)) {
        errors.push(`Referenced skill file not found: ${skill.path}`);
      }
    }

    for (const workflow of metadata.workflows) {
      if (!zip.file(workflow.path)) {
        errors.push(`Referenced workflow file not found: ${workflow.path}`);
      }
    }

    for (const permission of metadata.permissions) {
      if (permission.includes("network")) {
        risks.push("network.permission");
      }

      if (permission.includes("filesystem.write")) {
        risks.push("filesystem.write.permission");
      }
    }

    if (metadata.env.length >= 3) {
      risks.push("multiple.env.vars");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    risks: unique(risks),
    fileNames,
    metadata
  };
}

function isSafeRelativePath(fileName: string) {
  return (
    fileName.length > 0 &&
    !fileName.startsWith("/") &&
    !/^[A-Za-z]:\//.test(fileName) &&
    !fileName.includes("..") &&
    !fileName.includes("\\")
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
