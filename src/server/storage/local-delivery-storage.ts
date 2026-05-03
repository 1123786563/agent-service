import { getStorageProvider } from "./factory";
import { sanitizeDeliveryStorageFileName } from "./local-provider";
import { readStreamToBuffer, type StoredObject } from "./provider";

export type StoredDeliveryFile = StoredObject;

export function sanitizeDeliveryFileName(fileName: string) {
  return sanitizeDeliveryStorageFileName(fileName);
}

export async function saveDeliveryFile(buffer: Buffer, originalFileName: string): Promise<StoredDeliveryFile> {
  return getStorageProvider().putObject({
    scope: "deliveries",
    buffer,
    originalFileName
  });
}

export async function readDeliveryFile(fileName: string) {
  const resolvedName = sanitizeDeliveryFileName(fileName) === fileName ? fileName : null;

  if (!resolvedName) {
    throw new Error("Invalid stored delivery file name");
  }

  const stream = await getStorageProvider().getObjectStream({
    objectKey: `deliveries/${resolvedName}`
  });

  return readStreamToBuffer(stream);
}

export async function deleteDeliveryFile(fileName: string) {
  const resolvedName = sanitizeDeliveryFileName(fileName) === fileName ? fileName : null;

  if (!resolvedName) {
    throw new Error("Invalid stored delivery file name");
  }

  await getStorageProvider().deleteObject({
    objectKey: `deliveries/${resolvedName}`
  });
}
