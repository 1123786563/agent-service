import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteDeliveryFile,
  readDeliveryFile,
  sanitizeDeliveryFileName,
  saveDeliveryFile
} from "@/server/storage/local-delivery-storage";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("local delivery storage", () => {
  it("sanitizes delivery file names while preserving safe extensions", () => {
    expect(sanitizeDeliveryFileName("../Final Delivery!!.PDF")).toBe("final-delivery.pdf");
    expect(sanitizeDeliveryFileName("......")).toBe("delivery.bin");
  });

  it("saves and reads delivery files from DELIVERY_UPLOAD_DIR", async () => {
    const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "saas-idea-deliveries-"));
    const buffer = Buffer.from("delivery-bytes");

    vi.stubEnv("DELIVERY_UPLOAD_DIR", uploadDir);

    const stored = await saveDeliveryFile(buffer, "../Final Delivery!!.PDF");

    expect(stored.fileName).toMatch(/^final-delivery-[a-f0-9]{16}\.pdf$/);
    expect(stored.url).toBe(`/api/deliveries/${stored.fileName}`);
    expect(stored.sizeBytes).toBe(buffer.byteLength);
    await expect(readDeliveryFile(stored.fileName)).resolves.toEqual(buffer);
  });

  it("rejects non-canonical read paths and deletes stored deliveries", async () => {
    const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "saas-idea-deliveries-"));
    const buffer = Buffer.from("delivery-bytes");

    vi.stubEnv("DELIVERY_UPLOAD_DIR", uploadDir);

    const stored = await saveDeliveryFile(buffer, "handoff.txt");

    await expect(readDeliveryFile("../handoff.txt")).rejects.toThrow("Invalid stored delivery file name");

    await deleteDeliveryFile(stored.fileName);
    await expect(fs.readFile(path.join(uploadDir, stored.fileName))).rejects.toThrow();
  });
});
