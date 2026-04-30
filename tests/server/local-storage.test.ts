import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteStoredZip, readStoredZip, sanitizeStorageFileName, saveUploadedZip } from "@/server/storage/local-storage";

afterEach(async () => {
  vi.unstubAllEnvs();
});

describe("local storage", () => {
  it("sanitizes uploaded file names before persistence", () => {
    expect(sanitizeStorageFileName("../My Agent Package!!.ZIP")).toBe("my-agent-package.zip");
    expect(sanitizeStorageFileName("......")).toBe("agent-package.zip");
  });

  it("saves and reads back uploaded zip files from UPLOAD_DIR", async () => {
    const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "saas-idea-storage-"));
    const buffer = Buffer.from("zip-bytes");

    vi.stubEnv("UPLOAD_DIR", uploadDir);

    const stored = await saveUploadedZip(buffer, "../My Agent Package!!.ZIP");

    expect(stored.fileName).toMatch(/^my-agent-package-[a-f0-9]{16}\.zip$/);
    expect(stored.url).toBe(`/api/uploads/${stored.fileName}`);
    expect(stored.sizeBytes).toBe(buffer.byteLength);

    await expect(readStoredZip(stored.fileName)).resolves.toEqual(buffer);
  });

  it("rejects non-canonical read paths and deletes stored uploads", async () => {
    const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "saas-idea-storage-"));
    const buffer = Buffer.from("zip-bytes");

    vi.stubEnv("UPLOAD_DIR", uploadDir);

    const stored = await saveUploadedZip(buffer, "My Agent Package.zip");

    await expect(readStoredZip("../escape.zip")).rejects.toThrow("Invalid stored ZIP file name");

    await deleteStoredZip(stored.fileName);
    await expect(fs.readFile(path.join(uploadDir, stored.fileName))).rejects.toThrow();
  });
});
