import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_UPLOAD_DIR = ".data/uploads";
const DEFAULT_PUBLIC_PATH = "/api/uploads";

export type StoredZipFile = {
  url: string;
  fileName: string;
  sizeBytes: number;
};

function getUploadDir() {
  return process.env.UPLOAD_DIR ?? DEFAULT_UPLOAD_DIR;
}

function getPublicUploadPath() {
  const publicPath = process.env.UPLOADS_PUBLIC_PATH ?? DEFAULT_PUBLIC_PATH;
  return publicPath.endsWith("/") ? publicPath.slice(0, -1) : publicPath;
}

export function sanitizeStorageFileName(fileName: string) {
  const parsedName = path.parse(path.basename(fileName));
  const rawBaseName = parsedName.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const safeBaseName = rawBaseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  const extension = parsedName.ext.toLowerCase() === ".zip" ? ".zip" : ".zip";

  return `${safeBaseName || "agent-package"}${extension}`;
}

export async function saveUploadedZip(buffer: Buffer, originalFileName: string): Promise<StoredZipFile> {
  const uploadDir = getUploadDir();
  const safeName = sanitizeStorageFileName(originalFileName);
  const uniqueSuffix = crypto.randomBytes(8).toString("hex");
  const fileName = `${safeName.slice(0, -4)}-${uniqueSuffix}.zip`;
  const filePath = path.join(uploadDir, fileName);

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(filePath, buffer);

  return {
    url: `${getPublicUploadPath()}/${encodeURIComponent(fileName)}`,
    fileName,
    sizeBytes: buffer.byteLength
  };
}

export async function readStoredZip(fileName: string) {
  const safeName = sanitizeStorageFileName(fileName);
  const resolvedName = path.basename(fileName);

  if (resolvedName !== fileName || resolvedName !== safeName) {
    throw new Error("Invalid stored ZIP file name");
  }

  return fs.readFile(path.join(getUploadDir(), resolvedName));
}

export async function deleteStoredZip(fileName: string) {
  const safeName = sanitizeStorageFileName(fileName);
  const resolvedName = path.basename(fileName);

  if (resolvedName !== fileName || resolvedName !== safeName) {
    throw new Error("Invalid stored ZIP file name");
  }

  await fs.rm(path.join(getUploadDir(), resolvedName), { force: true });
}
