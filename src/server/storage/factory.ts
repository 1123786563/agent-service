import type { StorageProvider } from "./provider";
import { getLocalStorageProvider } from "./local-provider";
import { getS3CompatibleStorageProvider } from "./s3-provider";

type SupportedStorageProvider = "local" | "s3-compatible";

function normalizeStorageProvider(value: string | undefined | null): SupportedStorageProvider {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "local";
  }

  if (normalized === "local" || normalized === "s3-compatible") {
    return normalized;
  }

  throw new Error("Unsupported storage provider");
}

function assertS3CompatibleConfig() {
  const requiredEnvNames = [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY"
  ] as const;

  const missingNames = requiredEnvNames.filter((name) => !process.env[name]?.trim());

  if (missingNames.length > 0) {
    throw new Error("Missing required S3 storage configuration");
  }
}

export function getStorageProvider(): StorageProvider {
  const provider = normalizeStorageProvider(process.env.STORAGE_PROVIDER);

  if (provider === "local") {
    return getLocalStorageProvider();
  }

  assertS3CompatibleConfig();
  return getS3CompatibleStorageProvider();
}
