-- CreateEnum
CREATE TYPE "StorageProviderKind" AS ENUM ('LOCAL', 'S3_COMPATIBLE');

-- AlterTable
ALTER TABLE "AgentPackage" ADD COLUMN     "bucket" TEXT,
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "contentDisposition" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "objectKey" TEXT,
ADD COLUMN     "storageProvider" "StorageProviderKind" DEFAULT 'LOCAL';

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "bucket" TEXT,
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "contentDisposition" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "objectKey" TEXT,
ADD COLUMN     "storageProvider" "StorageProviderKind" DEFAULT 'LOCAL';

-- Backfill
UPDATE "AgentPackage"
SET "objectKey" = regexp_replace("zipFileUrl", '^/api/uploads/', 'agents/'),
    "storageProvider" = 'LOCAL',
    "mimeType" = COALESCE("mimeType", 'application/zip'),
    "contentDisposition" = COALESCE("contentDisposition", 'attachment; filename="' || "zipFileName" || '"')
WHERE "objectKey" IS NULL;

UPDATE "Delivery"
SET "objectKey" = regexp_replace("fileUrl", '^/api/deliveries/', 'deliveries/'),
    "storageProvider" = 'LOCAL',
    "contentDisposition" = COALESCE("contentDisposition", 'attachment; filename="' || "fileName" || '"')
WHERE "objectKey" IS NULL;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_createdAt_idx" ON "AuditLog"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
