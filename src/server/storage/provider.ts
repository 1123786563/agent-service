import { Readable } from "node:stream";

export type StorageScope = "agents" | "deliveries";

export type StoredObject = {
  url: string;
  fileName: string;
  sizeBytes: number;
  objectKey: string;
  storageProvider: "local" | "s3-compatible";
  bucket: string | null;
  mimeType: string;
  contentDisposition: string;
  checksum: string;
};

export type PutObjectInput = {
  scope: StorageScope;
  buffer: Buffer;
  originalFileName: string;
  objectKey?: string;
};

export interface StorageProvider {
  kind: StoredObject["storageProvider"];
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObjectStream(input: { objectKey: string }): Promise<Readable>;
  deleteObject(input: { objectKey: string }): Promise<void>;
  buildObjectKey(input: { scope: StorageScope; fileName: string }): string;
}

export function toStorageProviderKind(value: StoredObject["storageProvider"]) {
  return value === "local" ? "LOCAL" : "S3_COMPATIBLE";
}

export async function readStreamToBuffer(stream: Readable) {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}
