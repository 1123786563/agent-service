import JSZip from "jszip";
import type { AgentMetadata } from "./metadata-schema";
import { parseAgentMetadata } from "./metadata-schema";

export const MAX_ZIP_BYTES = 25 * 1024 * 1024;
export const MAX_FILE_COUNT = 250;
export const MAX_AGENT_JSON_BYTES = 256 * 1024;
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

const REQUIRED_FILES = ["agent.json", "README.md"];
const DANGEROUS_EXTENSIONS = [".exe", ".dmg", ".pkg", ".bat", ".cmd", ".ps1"];
const SCRIPT_EXTENSIONS = [".sh", ".js", ".ts", ".py", ".rb"];
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50;
const ZIP64_FIELD_PLACEHOLDER = 0xffffffff;

export type ZipValidationResult = {
  ok: boolean;
  errors: string[];
  risks: string[];
  fileNames: string[];
  metadata?: AgentMetadata;
};

type CentralDirectoryEntry = {
  rawName: string;
  normalizedName: string;
  dir: boolean;
  uncompressedSize: number;
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

  let rawEntries: CentralDirectoryEntry[];
  try {
    rawEntries = readCentralDirectoryEntries(buffer);
  } catch {
    return {
      ok: false,
      errors: ["Uploaded file is not a readable ZIP archive"],
      risks,
      fileNames: []
    };
  }

  validateRawEntries(rawEntries, errors);

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

  for (const [fileName, entry] of Object.entries(zip.files)) {
    const originalName = entry.unsafeOriginalName ?? fileName;

    if (isUnsafeZipPath(fileName)) {
      errors.push(`Unsafe path in ZIP: ${fileName}`);
    }

    if (isUnsafeZipPath(originalName)) {
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
      errors: unique(errors),
      risks: unique(risks),
      fileNames
    };
  }

  let metadata: AgentMetadata | undefined;
  const agentJsonEntries = rawEntries.filter((entry) => !entry.dir && entry.normalizedName === "agent.json");
  const canReadMetadata =
    agentJsonEntries.length === 0 ||
    agentJsonEntries.every((entry) => entry.uncompressedSize <= MAX_AGENT_JSON_BYTES);

  if (!canReadMetadata) {
    errors.push(`agent.json exceeds ${MAX_AGENT_JSON_BYTES} bytes`);
  } else {
    try {
      const rawMetadata = await agentJsonFile.async("nodebuffer");

      if (rawMetadata.byteLength > MAX_AGENT_JSON_BYTES) {
        errors.push(`agent.json exceeds ${MAX_AGENT_JSON_BYTES} bytes`);
      } else {
        metadata = parseAgentMetadata(JSON.parse(rawMetadata.toString("utf8")));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown metadata error";
      errors.push(`Metadata error: ${message}`);
    }
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
    errors: unique(errors),
    risks: unique(risks),
    fileNames,
    metadata
  };
}

function validateRawEntries(rawEntries: CentralDirectoryEntry[], errors: string[]) {
  const normalizedPaths = new Map<string, string>();
  const duplicatePaths = new Set<string>();
  let totalUncompressedBytes = 0;

  if (rawEntries.length > MAX_FILE_COUNT) {
    errors.push(`ZIP contains more than ${MAX_FILE_COUNT} entries`);
  }

  for (const entry of rawEntries) {
    totalUncompressedBytes += entry.uncompressedSize;

    if (isUnsafeZipPath(entry.rawName)) {
      errors.push(`Unsafe path in ZIP: ${entry.rawName}`);
    }

    if (isUnsafeZipPath(entry.normalizedName)) {
      errors.push(`Unsafe path in ZIP: ${entry.normalizedName}`);
    }

    const previousRawName = normalizedPaths.get(entry.normalizedName);
    if (previousRawName !== undefined) {
      duplicatePaths.add(entry.normalizedName);
    } else {
      normalizedPaths.set(entry.normalizedName, entry.rawName);
    }
  }

  if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
    errors.push(`ZIP uncompressed size exceeds ${MAX_TOTAL_UNCOMPRESSED_BYTES} bytes`);
  }

  for (const duplicatePath of duplicatePaths) {
    errors.push(`Duplicate path in ZIP after normalization: ${duplicatePath}`);
  }
}

function readCentralDirectoryEntries(buffer: Buffer): CentralDirectoryEntry[] {
  const directoryEndOffset = findEndOfCentralDirectory(buffer);

  if (directoryEndOffset === -1) {
    throw new Error("Missing end of central directory");
  }

  const diskNumber = buffer.readUInt16LE(directoryEndOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(directoryEndOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(directoryEndOffset + 8);
  const entryCount = buffer.readUInt16LE(directoryEndOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(directoryEndOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(directoryEndOffset + 16);

  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error("Multi-disk ZIP archives are not supported");
  }

  if (
    entryCount === 0xffff ||
    centralDirectorySize === ZIP64_FIELD_PLACEHOLDER ||
    centralDirectoryOffset === ZIP64_FIELD_PLACEHOLDER
  ) {
    throw new Error("ZIP64 archives are not supported");
  }

  if (centralDirectoryOffset + centralDirectorySize > buffer.byteLength) {
    throw new Error("Invalid central directory bounds");
  }

  const entries: CentralDirectoryEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.byteLength) {
      throw new Error("Truncated central directory entry");
    }

    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) {
      throw new Error("Invalid central directory entry signature");
    }

    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const fileNameOffset = offset + 46;
    const nextOffset = fileNameOffset + fileNameLength + extraFieldLength + fileCommentLength;

    if (uncompressedSize === ZIP64_FIELD_PLACEHOLDER) {
      throw new Error("ZIP64 archives are not supported");
    }

    if (nextOffset > buffer.byteLength) {
      throw new Error("Invalid central directory entry bounds");
    }

    const rawName = buffer.subarray(fileNameOffset, fileNameOffset + fileNameLength).toString("utf8");
    entries.push({
      rawName,
      normalizedName: normalizeZipPath(rawName),
      dir: rawName.endsWith("/"),
      uncompressedSize
    });

    offset = nextOffset;
  }

  if (offset > centralDirectoryOffset + centralDirectorySize) {
    throw new Error("Central directory entry overflow");
  }

  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minimumOffset = Math.max(0, buffer.byteLength - 22 - 0xffff);

  for (let offset = buffer.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  return -1;
}

function isUnsafeZipPath(fileName: string) {
  return (
    fileName.length === 0 ||
    fileName.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(fileName) ||
    fileName.includes("\\") ||
    fileName.split("/").some((segment) => segment === "..")
  );
}

function normalizeZipPath(fileName: string) {
  const parts = fileName.split("/");
  const normalizedParts: string[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (part === "." || (part === "" && index !== 0 && index !== parts.length - 1)) {
      continue;
    }

    if (part === "..") {
      normalizedParts.pop();
      continue;
    }

    normalizedParts.push(part);
  }

  return normalizedParts.join("/");
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
