import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("storage provider factory", () => {
  it("returns local storage when STORAGE_PROVIDER is unset", async () => {
    vi.stubEnv("STORAGE_PROVIDER", "");

    const { getStorageProvider } = await import("@/server/storage/factory");

    expect(getStorageProvider().kind).toBe("local");
  });

  it("returns s3-compatible storage when configured", async () => {
    vi.stubEnv("STORAGE_PROVIDER", "s3-compatible");
    vi.stubEnv("S3_ENDPOINT", "http://127.0.0.1:9000");
    vi.stubEnv("S3_REGION", "auto");
    vi.stubEnv("S3_BUCKET", "bucket-1");
    vi.stubEnv("S3_ACCESS_KEY_ID", "key");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret");

    const { getStorageProvider } = await import("@/server/storage/factory");

    expect(getStorageProvider().kind).toBe("s3-compatible");
  });

  it("rejects unsupported storage providers", async () => {
    vi.stubEnv("STORAGE_PROVIDER", "ftp");

    const { getStorageProvider } = await import("@/server/storage/factory");

    expect(() => getStorageProvider()).toThrow("Unsupported storage provider");
  });

  it("fails fast when s3-compatible storage is missing required env vars", async () => {
    vi.stubEnv("STORAGE_PROVIDER", "s3-compatible");
    vi.stubEnv("S3_ENDPOINT", "");

    const { getStorageProvider } = await import("@/server/storage/factory");

    expect(() => getStorageProvider()).toThrow("Missing required S3 storage configuration");
  });
});
