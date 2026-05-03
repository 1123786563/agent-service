import crypto from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { sanitizeAgentStorageFileName, sanitizeDeliveryStorageFileName } from "./local-provider";
import type { PutObjectInput, StorageProvider, StoredObject } from "./provider";

type S3CompatibleStorageProviderInput = {
  client?: {
    send(command: unknown): Promise<unknown>;
  };
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  publicBaseUrl?: string | null;
};

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeAsciiFileName(scope: PutObjectInput["scope"], originalFileName: string) {
  return scope === "agents"
    ? sanitizeAgentStorageFileName(originalFileName)
    : sanitizeDeliveryStorageFileName(originalFileName);
}

function buildStoredFileName(scope: PutObjectInput["scope"], originalFileName: string) {
  const safeName = normalizeAsciiFileName(scope, originalFileName);
  const parsedName = path.parse(safeName);
  const uniqueSuffix = crypto.randomBytes(8).toString("hex");

  return `${parsedName.name}-${uniqueSuffix}${parsedName.ext}`;
}

function inferMimeType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case ".zip":
      return "application/zip";
    case ".pdf":
      return "application/pdf";
    case ".json":
      return "application/json";
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

function buildObjectUrl(input: {
  endpoint: string;
  bucket: string;
  objectKey: string;
  forcePathStyle: boolean;
  publicBaseUrl?: string | null;
}) {
  if (input.publicBaseUrl?.trim()) {
    return `${trimTrailingSlash(input.publicBaseUrl.trim())}/${input.objectKey}`;
  }

  const endpoint = trimTrailingSlash(input.endpoint);
  if (input.forcePathStyle) {
    return `${endpoint}/${input.bucket}/${input.objectKey}`;
  }

  const { protocol, host, pathname } = new URL(endpoint);
  const normalizedPath = pathname === "/" ? "" : trimTrailingSlash(pathname);

  return `${protocol}//${input.bucket}.${host}${normalizedPath}/${input.objectKey}`;
}

function toReadable(body: unknown) {
  if (body instanceof Readable) {
    return body;
  }

  if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
    return Readable.from(body);
  }

  if (body && typeof body === "object" && Symbol.asyncIterator in body) {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }

  throw new Error("S3 object body is not readable");
}

export class S3CompatibleStorageProvider implements StorageProvider {
  kind = "s3-compatible" as const;

  private readonly client: { send(command: unknown): Promise<unknown> };
  private readonly endpoint: string;
  private readonly region: string;
  private readonly bucket: string;
  private readonly forcePathStyle: boolean;
  private readonly publicBaseUrl: string | null;

  constructor(input: S3CompatibleStorageProviderInput = {}) {
    this.endpoint = input.endpoint?.trim() || process.env.S3_ENDPOINT?.trim() || "";
    this.region = input.region?.trim() || process.env.S3_REGION?.trim() || "";
    this.bucket = input.bucket?.trim() || process.env.S3_BUCKET?.trim() || "";
    const accessKeyId = input.accessKeyId?.trim() || process.env.S3_ACCESS_KEY_ID?.trim() || "";
    const secretAccessKey = input.secretAccessKey?.trim() || process.env.S3_SECRET_ACCESS_KEY?.trim() || "";
    this.forcePathStyle =
      input.forcePathStyle ??
      ((process.env.S3_FORCE_PATH_STYLE?.trim().toLowerCase() || "true") === "true");
    this.publicBaseUrl = input.publicBaseUrl?.trim() || process.env.S3_PUBLIC_BASE_URL?.trim() || null;

    this.client =
      input.client ??
      new S3Client({
        endpoint: this.endpoint,
        region: this.region,
        forcePathStyle: this.forcePathStyle,
        credentials: {
          accessKeyId,
          secretAccessKey
        }
      });
  }

  buildObjectKey(input: { scope: PutObjectInput["scope"]; fileName: string }) {
    return `${input.scope}/${input.fileName}`;
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const fileName = input.objectKey ? path.basename(input.objectKey) : buildStoredFileName(input.scope, input.originalFileName);
    const objectKey = input.objectKey ?? this.buildObjectKey({
      scope: input.scope,
      fileName
    });
    const mimeType = inferMimeType(fileName);
    const contentDisposition = `attachment; filename="${fileName}"`;
    const checksum = crypto.createHash("sha256").update(input.buffer).digest("hex");

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: input.buffer,
        ContentType: mimeType,
        ContentDisposition: contentDisposition,
        ChecksumSHA256: Buffer.from(checksum, "hex").toString("base64")
      })
    );

    return {
      url: buildObjectUrl({
        endpoint: this.endpoint,
        bucket: this.bucket,
        objectKey,
        forcePathStyle: this.forcePathStyle,
        publicBaseUrl: this.publicBaseUrl
      }),
      fileName,
      sizeBytes: input.buffer.byteLength,
      objectKey,
      storageProvider: this.kind,
      bucket: this.bucket,
      mimeType,
      contentDisposition,
      checksum
    };
  }

  async getObjectStream(input: { objectKey: string }): Promise<Readable> {
    const output = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.objectKey
      })
    ) as { Body?: unknown };

    if (!output.Body) {
      throw new Error("S3 object body is missing");
    }

    return toReadable(output.Body);
  }

  async deleteObject(input: { objectKey: string }): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: input.objectKey
      })
    );
  }
}

export function getS3CompatibleStorageProvider(input: S3CompatibleStorageProviderInput = {}) {
  return new S3CompatibleStorageProvider(input);
}
