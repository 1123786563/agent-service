import { Readable } from "node:stream";
import type { PutObjectInput, StorageProvider } from "./provider";

export class S3CompatibleStorageProvider implements StorageProvider {
  kind = "s3-compatible" as const;

  buildObjectKey(input: { scope: PutObjectInput["scope"]; fileName: string }) {
    return `${input.scope}/${input.fileName}`;
  }

  async putObject() {
    throw new Error("S3-compatible storage is not configured");
  }

  async getObjectStream() {
    throw new Error("S3-compatible storage is not configured");
  }

  async deleteObject() {
    throw new Error("S3-compatible storage is not configured");
  }
}

export function getS3CompatibleStorageProvider() {
  return new S3CompatibleStorageProvider();
}

export async function getUnsupportedS3Stream() {
  return Readable.from([]);
}
