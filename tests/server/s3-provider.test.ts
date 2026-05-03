import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readStreamToBuffer } from "@/server/storage/provider";
import { S3CompatibleStorageProvider } from "@/server/storage/s3-provider";

describe("s3-compatible storage provider", () => {
  const send = vi.fn();

  beforeEach(() => {
    send.mockReset();
  });

  it("uploads objects with the expected key and metadata", async () => {
    send.mockResolvedValue({});
    const provider = new S3CompatibleStorageProvider({
      client: { send } as never,
      endpoint: "http://127.0.0.1:9000",
      region: "auto",
      bucket: "bucket-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
      forcePathStyle: true
    });

    const stored = await provider.putObject({
      scope: "agents",
      buffer: Buffer.from("zip"),
      originalFileName: "Demo Agent.zip"
    });

    expect(stored.objectKey).toMatch(/^agents\/demo-agent-[a-f0-9]{16}\.zip$/);
    expect(stored.bucket).toBe("bucket-1");
    expect(stored.storageProvider).toBe("s3-compatible");
    expect(stored.contentDisposition).toBe(`attachment; filename="${stored.fileName}"`);
    expect(stored.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("reads object streams back from the bucket", async () => {
    send.mockResolvedValue({
      Body: Readable.from(Buffer.from("delivery-bytes"))
    });
    const provider = new S3CompatibleStorageProvider({
      client: { send } as never,
      endpoint: "http://127.0.0.1:9000",
      region: "auto",
      bucket: "bucket-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
      forcePathStyle: true
    });

    const stream = await provider.getObjectStream({
      objectKey: "deliveries/handoff.txt"
    });

    await expect(readStreamToBuffer(stream)).resolves.toEqual(Buffer.from("delivery-bytes"));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("deletes object keys from the bucket", async () => {
    send.mockResolvedValue({});
    const provider = new S3CompatibleStorageProvider({
      client: { send } as never,
      endpoint: "http://127.0.0.1:9000",
      region: "auto",
      bucket: "bucket-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
      forcePathStyle: true
    });

    await provider.deleteObject({
      objectKey: "agents/demo-agent.zip"
    });

    expect(send).toHaveBeenCalledTimes(1);
  });
});
