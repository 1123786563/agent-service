import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_DELIVERY_UPLOAD_DIR = ".data/deliveries";
const DEFAULT_DELIVERY_PUBLIC_PATH = "/api/deliveries";

export type StoredDeliveryFile = {
  url: string;
  fileName: string;
  sizeBytes: number;
};

function getDeliveryUploadDir() {
  return process.env.DELIVERY_UPLOAD_DIR ?? DEFAULT_DELIVERY_UPLOAD_DIR;
}

function getDeliveryPublicPath() {
  const publicPath = process.env.DELIVERIES_PUBLIC_PATH ?? DEFAULT_DELIVERY_PUBLIC_PATH;
  return publicPath.endsWith("/") ? publicPath.slice(0, -1) : publicPath;
}

export function sanitizeDeliveryFileName(fileName: string) {
  const parsedName = path.parse(path.basename(fileName));
  const rawBaseName = parsedName.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const safeBaseName = rawBaseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  const safeExtension = parsedName.ext.toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 12);
  const extension = safeExtension && safeExtension !== "." ? safeExtension : ".bin";

  return `${safeBaseName || "delivery"}${extension}`;
}

export async function saveDeliveryFile(buffer: Buffer, originalFileName: string): Promise<StoredDeliveryFile> {
  const uploadDir = getDeliveryUploadDir();
  const safeName = sanitizeDeliveryFileName(originalFileName);
  const parsedName = path.parse(safeName);
  const uniqueSuffix = crypto.randomBytes(8).toString("hex");
  const fileName = `${parsedName.name}-${uniqueSuffix}${parsedName.ext}`;
  const filePath = path.join(uploadDir, fileName);

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(filePath, buffer);

  return {
    url: `${getDeliveryPublicPath()}/${encodeURIComponent(fileName)}`,
    fileName,
    sizeBytes: buffer.byteLength
  };
}

export async function readDeliveryFile(fileName: string) {
  const resolvedName = path.basename(fileName);

  if (resolvedName !== fileName || resolvedName !== sanitizeDeliveryFileName(fileName)) {
    throw new Error("Invalid stored delivery file name");
  }

  return fs.readFile(path.join(getDeliveryUploadDir(), resolvedName));
}

export async function deleteDeliveryFile(fileName: string) {
  const resolvedName = path.basename(fileName);

  if (resolvedName !== fileName || resolvedName !== sanitizeDeliveryFileName(fileName)) {
    throw new Error("Invalid stored delivery file name");
  }

  await fs.rm(path.join(getDeliveryUploadDir(), resolvedName), { force: true });
}
