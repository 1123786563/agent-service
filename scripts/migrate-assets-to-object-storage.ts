import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { StorageProviderKind } from "@prisma/client";
import { getLocalStorageProvider } from "@/server/storage/local-provider";
import { readStreamToBuffer } from "@/server/storage/provider";
import { getS3CompatibleStorageProvider } from "@/server/storage/s3-provider";

type MigrationScope = "agents" | "deliveries" | "all";

loadEnvConfig(process.cwd());
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:55432/hermes_agent_marketplace?schema=public";
let prisma: typeof import("@/server/db")["prisma"];

function parseArgs(argv: string[]) {
  const options = {
    scope: "all" as MigrationScope,
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith("--scope=")) {
      const value = arg.slice("--scope=".length).trim();
      if (value === "agents" || value === "deliveries" || value === "all") {
        options.scope = value;
        continue;
      }

      throw new Error("Scope must be one of agents, deliveries, or all");
    }
  }

  return options;
}

function resolveAgentObjectKey(record: { objectKey: string | null; zipFileName: string }) {
  return record.objectKey ?? `agents/${path.basename(record.zipFileName)}`;
}

function resolveDeliveryObjectKey(record: { objectKey: string | null; fileName: string }) {
  return record.objectKey ?? `deliveries/${path.basename(record.fileName)}`;
}

async function migrateAgentPackages(dryRun: boolean) {
  const rows = await prisma.agentPackage.findMany({
    where: {
      storageProvider: StorageProviderKind.LOCAL,
      deletedAt: null
    },
    select: {
      id: true,
      objectKey: true,
      zipFileName: true,
      checksum: true
    }
  });

  if (dryRun) {
    console.log(`[dry-run] agent packages eligible: ${rows.length}`);
    return { migrated: 0, skipped: rows.length, failed: 0 };
  }

  const localProvider = getLocalStorageProvider();
  const s3Provider = getS3CompatibleStorageProvider();
  let migrated = 0;
  let failed = 0;

  for (const row of rows) {
    const objectKey = resolveAgentObjectKey(row);

    try {
      const stream = await localProvider.getObjectStream({ objectKey });
      const buffer = await readStreamToBuffer(stream);
      const stored = await s3Provider.putObject({
        scope: "agents",
        buffer,
        originalFileName: row.zipFileName,
        objectKey
      });

      await prisma.agentPackage.update({
        where: { id: row.id },
        data: {
          zipFileUrl: stored.url,
          zipFileName: stored.fileName,
          objectKey: stored.objectKey,
          storageProvider: StorageProviderKind.S3_COMPATIBLE,
          bucket: stored.bucket,
          mimeType: stored.mimeType,
          contentDisposition: stored.contentDisposition,
          checksum: stored.checksum || row.checksum
        }
      });
      migrated += 1;
    } catch (error) {
      failed += 1;
      console.error(`[agents] failed to migrate ${row.id}:`, error);
    }
  }

  return { migrated, skipped: 0, failed };
}

async function migrateDeliveries(dryRun: boolean) {
  const rows = await prisma.delivery.findMany({
    where: {
      storageProvider: StorageProviderKind.LOCAL,
      deletedAt: null
    },
    select: {
      id: true,
      objectKey: true,
      fileName: true,
      checksum: true
    }
  });

  if (dryRun) {
    console.log(`[dry-run] deliveries eligible: ${rows.length}`);
    return { migrated: 0, skipped: rows.length, failed: 0 };
  }

  const localProvider = getLocalStorageProvider();
  const s3Provider = getS3CompatibleStorageProvider();
  let migrated = 0;
  let failed = 0;

  for (const row of rows) {
    const objectKey = resolveDeliveryObjectKey(row);

    try {
      const stream = await localProvider.getObjectStream({ objectKey });
      const buffer = await readStreamToBuffer(stream);
      const stored = await s3Provider.putObject({
        scope: "deliveries",
        buffer,
        originalFileName: row.fileName,
        objectKey
      });

      await prisma.delivery.update({
        where: { id: row.id },
        data: {
          fileUrl: stored.url,
          fileName: stored.fileName,
          objectKey: stored.objectKey,
          storageProvider: StorageProviderKind.S3_COMPATIBLE,
          bucket: stored.bucket,
          mimeType: stored.mimeType,
          contentDisposition: stored.contentDisposition,
          checksum: stored.checksum || row.checksum
        }
      });
      migrated += 1;
    } catch (error) {
      failed += 1;
      console.error(`[deliveries] failed to migrate ${row.id}:`, error);
    }
  }

  return { migrated, skipped: 0, failed };
}

async function main() {
  ({ prisma } = await import("@/server/db"));
  const options = parseArgs(process.argv.slice(2));
  const summary = {
    agents: { migrated: 0, skipped: 0, failed: 0 },
    deliveries: { migrated: 0, skipped: 0, failed: 0 }
  };

  if (options.scope === "agents" || options.scope === "all") {
    summary.agents = await migrateAgentPackages(options.dryRun);
  }

  if (options.scope === "deliveries" || options.scope === "all") {
    summary.deliveries = await migrateDeliveries(options.dryRun);
  }

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    scope: options.scope,
    summary
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
