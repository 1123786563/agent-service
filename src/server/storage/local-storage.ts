import { getLocalStorageProvider, sanitizeAgentStorageFileName } from "./local-provider";
import { readStreamToBuffer, type StoredObject } from "./provider";

export type StoredZipFile = StoredObject;

export function sanitizeStorageFileName(fileName: string) {
  return sanitizeAgentStorageFileName(fileName);
}

export async function saveUploadedZip(buffer: Buffer, originalFileName: string): Promise<StoredZipFile> {
  return getLocalStorageProvider().putObject({
    scope: "agents",
    buffer,
    originalFileName
  });
}

export async function readStoredZip(fileName: string) {
  const safeName = sanitizeStorageFileName(fileName);
  const resolvedName = safeName === fileName ? fileName : null;

  if (!resolvedName) {
    throw new Error("Invalid stored ZIP file name");
  }

  const stream = await getLocalStorageProvider().getObjectStream({
    objectKey: `agents/${resolvedName}`
  });

  return readStreamToBuffer(stream);
}

export async function deleteStoredZip(fileName: string) {
  const safeName = sanitizeStorageFileName(fileName);
  const resolvedName = safeName === fileName ? fileName : null;

  if (!resolvedName) {
    throw new Error("Invalid stored ZIP file name");
  }

  await getLocalStorageProvider().deleteObject({
    objectKey: `agents/${resolvedName}`
  });
}
