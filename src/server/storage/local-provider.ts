import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { PutObjectInput, StorageProvider } from "./provider";

const DEFAULT_AGENT_UPLOAD_DIR = ".data/uploads";
const DEFAULT_AGENT_PUBLIC_PATH = "/api/uploads";
const DEFAULT_DELIVERY_UPLOAD_DIR = ".data/deliveries";
const DEFAULT_DELIVERY_PUBLIC_PATH = "/api/deliveries";

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function getScopeConfig(scope: PutObjectInput["scope"]) {
  if (scope === "agents") {
    return {
      dir: process.env.UPLOAD_DIR ?? DEFAULT_AGENT_UPLOAD_DIR,
      publicPath: trimTrailingSlash(process.env.UPLOADS_PUBLIC_PATH ?? DEFAULT_AGENT_PUBLIC_PATH)
    };
  }

  return {
    dir: process.env.DELIVERY_UPLOAD_DIR ?? DEFAULT_DELIVERY_UPLOAD_DIR,
    publicPath: trimTrailingSlash(process.env.DELIVERIES_PUBLIC_PATH ?? DEFAULT_DELIVERY_PUBLIC_PATH)
  };
}

function normalizeAsciiFileName(fileName: string, fallbackBase: string, forcedExtension?: string) {
  const parsedName = path.parse(path.basename(fileName));
  const rawBaseName = parsedName.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const safeBaseName = rawBaseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  const extension = forcedExtension
    ? forcedExtension
    : (() => {
        const safeExtension = parsedName.ext.toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 12);
        return safeExtension && safeExtension !== "." ? safeExtension : ".bin";
      })();

  return `${safeBaseName || fallbackBase}${extension}`;
}

function buildStoredFileName(scope: PutObjectInput["scope"], originalFileName: string) {
  const safeName =
    scope === "agents"
      ? normalizeAsciiFileName(originalFileName, "agent-package", ".zip")
      : normalizeAsciiFileName(originalFileName, "delivery");
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

function parseObjectKey(objectKey: string) {
  const normalized = objectKey.replace(/^\/+/, "");
  const [scope, ...rest] = normalized.split("/");

  if ((scope !== "agents" && scope !== "deliveries") || rest.length === 0) {
    throw new Error("Invalid storage object key");
  }

  const fileName = rest.join("/");
  if (path.basename(fileName) !== fileName) {
    throw new Error("Invalid storage object key");
  }

  return {
    scope,
    fileName
  } as const;
}

export function sanitizeAgentStorageFileName(fileName: string) {
  return normalizeAsciiFileName(fileName, "agent-package", ".zip");
}

export function sanitizeDeliveryStorageFileName(fileName: string) {
  return normalizeAsciiFileName(fileName, "delivery");
}

export class LocalStorageProvider implements StorageProvider {
  kind = "local" as const;

  buildObjectKey(input: { scope: PutObjectInput["scope"]; fileName: string }) {
    return `${input.scope}/${input.fileName}`;
  }

  async putObject(input: PutObjectInput) {
    const { dir, publicPath } = getScopeConfig(input.scope);
    const fileName = buildStoredFileName(input.scope, input.originalFileName);
    const filePath = path.join(dir, fileName);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, input.buffer);

    return {
      url: `${publicPath}/${encodeURIComponent(fileName)}`,
      fileName,
      sizeBytes: input.buffer.byteLength,
      objectKey: this.buildObjectKey({ scope: input.scope, fileName }),
      storageProvider: this.kind,
      bucket: null,
      mimeType: inferMimeType(fileName),
      contentDisposition: `attachment; filename="${fileName}"`,
      checksum: crypto.createHash("sha256").update(input.buffer).digest("hex")
    };
  }

  async getObjectStream(input: { objectKey: string }) {
    const { scope, fileName } = parseObjectKey(input.objectKey);
    const { dir } = getScopeConfig(scope);
    const buffer = await fs.readFile(path.join(dir, fileName));

    return Readable.from(buffer);
  }

  async deleteObject(input: { objectKey: string }) {
    const { scope, fileName } = parseObjectKey(input.objectKey);
    const { dir } = getScopeConfig(scope);

    await fs.rm(path.join(dir, fileName), { force: true });
  }
}

const localStorageProvider = new LocalStorageProvider();

export function getLocalStorageProvider() {
  return localStorageProvider;
}
