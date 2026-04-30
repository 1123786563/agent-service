import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { AgentMetadata } from "@/server/agents/metadata-schema";
import { createAgentZip } from "@/test/fixtures";
import {
  MAX_AGENT_JSON_BYTES,
  MAX_FILE_COUNT,
  MAX_TOTAL_UNCOMPRESSED_BYTES,
  validateAgentZip
} from "@/server/agents/zip-validator";

const validMetadata = {
  id: "research-assistant",
  name: "Research Assistant",
  version: "1.0.0",
  summary: "Helps users research sources and draft concise reports.",
  categories: ["research", "writing"],
  skills: [
    {
      name: "web-research",
      path: "skills/web-research/SKILL.md",
      description: "Collect and summarize source material"
    }
  ],
  workflows: [
    {
      name: "default",
      path: "workflows/main.json",
      description: "Default research workflow"
    }
  ],
  hermes: { minVersion: "0.1.0", importType: "zip" },
  permissions: [],
  env: [],
  author: { name: "Author" },
  service: { available: false, types: [] }
} satisfies AgentMetadata;

function agentMetadata(overrides: Partial<AgentMetadata> = {}): AgentMetadata {
  return { ...validMetadata, ...overrides };
}

function addValidPackage(zip: JSZip, overrides: Partial<AgentMetadata> = {}) {
  zip.file("agent.json", JSON.stringify(agentMetadata(overrides), null, 2));
  zip.file("README.md", "# Research Assistant");
  zip.file("skills/web-research/SKILL.md", "# Web Research");
  zip.file("workflows/main.json", JSON.stringify({ steps: ["web-research"] }));
}

async function generateBuffer(zip: JSZip) {
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

function setCentralDirectoryUncompressedSize(buffer: Buffer, fileName: string, size: number) {
  const centralDirectorySignature = 0x02014b50;

  for (let offset = 0; offset <= buffer.byteLength - 46; offset += 1) {
    if (buffer.readUInt32LE(offset) !== centralDirectorySignature) {
      continue;
    }

    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const entryName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    if (entryName === fileName) {
      buffer.writeUInt32LE(size, offset + 24);
      return buffer;
    }
  }

  throw new Error(`Central directory entry not found: ${fileName}`);
}

describe("validateAgentZip", () => {
  it("accepts a valid agent package and includes network.permission risk", async () => {
    const result = await validateAgentZip(await createAgentZip());

    expect(result.ok).toBe(true);
    expect(result.metadata?.id).toBe("research-assistant");
    expect(result.risks).toContain("network.permission");
  });

  it("rejects an invalid ZIP archive", async () => {
    const result = await validateAgentZip(Buffer.from("not a zip archive"));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Uploaded file is not a readable ZIP archive");
  });

  it("rejects missing README.md", async () => {
    const zip = new JSZip();
    zip.file("agent.json", JSON.stringify({}));

    const result = await validateAgentZip(await generateBuffer(zip));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing required file: README.md");
  });

  it("rejects unsafe raw traversal directory entries", async () => {
    const zip = new JSZip();
    addValidPackage(zip);
    zip.file("../payload/", "", { dir: true, createFolders: false });

    const result = await validateAgentZip(await generateBuffer(zip));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Unsafe path in ZIP: ../payload/");
  });

  it("rejects duplicate normalized entries from raw traversal", async () => {
    const zip = new JSZip();
    zip.file("../agent.json", JSON.stringify(agentMetadata()), { createFolders: false });
    addValidPackage(zip);

    const result = await validateAgentZip(await generateBuffer(zip));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Unsafe path in ZIP: ../agent.json");
    expect(result.errors).toContain("Duplicate path in ZIP after normalization: agent.json");
  });

  it("rejects excessive total ZIP entries", async () => {
    const zip = new JSZip();
    addValidPackage(zip);

    for (let index = 0; index <= MAX_FILE_COUNT; index += 1) {
      zip.file(`extra-${index}.txt`, "x", { createFolders: false });
    }

    const result = await validateAgentZip(await generateBuffer(zip));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(`ZIP contains more than ${MAX_FILE_COUNT} entries`);
  });

  it("rejects dangerous file extensions", async () => {
    const result = await validateAgentZip(await createAgentZip({ "bin/install.exe": "binary" }));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Dangerous file type in ZIP: bin/install.exe");
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

    const result = await validateAgentZip(await generateBuffer(zip));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Referenced skill file not found: skills/missing/SKILL.md");
  });

  it("rejects workflow paths that do not exist in the archive", async () => {
    const zip = new JSZip();
    addValidPackage(zip, {
      workflows: [
        {
          name: "missing",
          path: "workflows/missing.json",
          description: "Missing workflow"
        }
      ]
    });

    const result = await validateAgentZip(await generateBuffer(zip));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Referenced workflow file not found: workflows/missing.json");
  });

  it("prefixes malformed agent metadata errors", async () => {
    const zip = new JSZip();
    zip.file("agent.json", "{not-json");
    zip.file("README.md", "# Broken Agent");

    const result = await validateAgentZip(await generateBuffer(zip));

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.startsWith("Metadata error:"))).toBe(true);
  });

  it("rejects oversized agent metadata before parsing", async () => {
    const zip = new JSZip();
    zip.file("agent.json", "x".repeat(MAX_AGENT_JSON_BYTES + 1));
    zip.file("README.md", "# Oversized Agent");

    const result = await validateAgentZip(await generateBuffer(zip));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(`agent.json exceeds ${MAX_AGENT_JSON_BYTES} bytes`);
  });

  it("rejects excessive total uncompressed size metadata", async () => {
    const zip = new JSZip();
    addValidPackage(zip);
    zip.file("large.bin", "x", { createFolders: false });

    const buffer = setCentralDirectoryUncompressedSize(
      await generateBuffer(zip),
      "large.bin",
      MAX_TOTAL_UNCOMPRESSED_BYTES + 1
    );
    const result = await validateAgentZip(buffer);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      `ZIP uncompressed size exceeds ${MAX_TOTAL_UNCOMPRESSED_BYTES} bytes`
    );
  });

  it("marks script, filesystem write, and multiple env var risks", async () => {
    const zip = new JSZip();
    addValidPackage(zip, {
      permissions: ["filesystem.write"],
      env: [
        { name: "OPENAI_API_KEY", required: true, description: "Model access" },
        { name: "SEARCH_API_KEY", required: false, description: "Search access" },
        { name: "REPORT_BUCKET", required: false, description: "Report output" }
      ]
    });
    zip.file("scripts/setup.sh", "echo setup");

    const result = await validateAgentZip(await generateBuffer(zip));

    expect(result.ok).toBe(true);
    expect(result.risks).toContain("script.file:scripts/setup.sh");
    expect(result.risks).toContain("filesystem.write.permission");
    expect(result.risks).toContain("multiple.env.vars");
    expect(result.risks).not.toContain("network.permission");
  });
});
