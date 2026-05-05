-- CreateEnum
CREATE TYPE "SettlementAdjustmentStatus" AS ENUM ('PENDING', 'APPLIED');

-- AlterTable
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_providerEventId_key" UNIQUE ("providerEventId");

-- CreateTable
CREATE TABLE "AgentPackageFavorite" (
    "id" TEXT NOT NULL,
    "agentPackageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentPackageFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPackageReview" (
    "id" TEXT NOT NULL,
    "agentPackageId" TEXT NOT NULL,
    "userId" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPackageReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPackageImportInstruction" (
    "id" TEXT NOT NULL,
    "agentPackageId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "cliCommand" TEXT NOT NULL,
    "oneClickUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPackageImportInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadTicketUse" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "actorId" TEXT,
    "sessionId" TEXT,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DownloadTicketUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementAdjustment" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sourceSettlementLineId" TEXT,
    "settlementBatchId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SettlementAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "SettlementAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentPackageFavorite_agentPackageId_userId_key" ON "AgentPackageFavorite"("agentPackageId", "userId");
CREATE INDEX "AgentPackageFavorite_userId_createdAt_idx" ON "AgentPackageFavorite"("userId", "createdAt");
CREATE INDEX "AgentPackageReview_agentPackageId_createdAt_idx" ON "AgentPackageReview"("agentPackageId", "createdAt");
CREATE INDEX "AgentPackageReview_userId_createdAt_idx" ON "AgentPackageReview"("userId", "createdAt");
CREATE INDEX "AgentPackageImportInstruction_agentPackageId_idx" ON "AgentPackageImportInstruction"("agentPackageId");
CREATE UNIQUE INDEX "AgentPackageImportInstruction_agentPackageId_key" ON "AgentPackageImportInstruction"("agentPackageId");
CREATE INDEX "AgentPackageImportInstruction_createdByUserId_createdAt_idx" ON "AgentPackageImportInstruction"("createdByUserId", "createdAt");
CREATE UNIQUE INDEX "DownloadTicketUse_jti_key" ON "DownloadTicketUse"("jti");
CREATE INDEX "DownloadTicketUse_resourceType_resourceId_usedAt_idx" ON "DownloadTicketUse"("resourceType", "resourceId", "usedAt");
CREATE INDEX "DownloadTicketUse_actorId_usedAt_idx" ON "DownloadTicketUse"("actorId", "usedAt");
CREATE INDEX "SettlementAdjustment_providerId_status_createdAt_idx" ON "SettlementAdjustment"("providerId", "status", "createdAt");
CREATE INDEX "SettlementAdjustment_orderId_createdAt_idx" ON "SettlementAdjustment"("orderId", "createdAt");
CREATE INDEX "SettlementAdjustment_settlementBatchId_idx" ON "SettlementAdjustment"("settlementBatchId");

-- AddForeignKey
ALTER TABLE "AgentPackageFavorite" ADD CONSTRAINT "AgentPackageFavorite_agentPackageId_fkey" FOREIGN KEY ("agentPackageId") REFERENCES "AgentPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentPackageFavorite" ADD CONSTRAINT "AgentPackageFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentPackageReview" ADD CONSTRAINT "AgentPackageReview_agentPackageId_fkey" FOREIGN KEY ("agentPackageId") REFERENCES "AgentPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentPackageReview" ADD CONSTRAINT "AgentPackageReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentPackageImportInstruction" ADD CONSTRAINT "AgentPackageImportInstruction_agentPackageId_fkey" FOREIGN KEY ("agentPackageId") REFERENCES "AgentPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentPackageImportInstruction" ADD CONSTRAINT "AgentPackageImportInstruction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SettlementAdjustment" ADD CONSTRAINT "SettlementAdjustment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SettlementAdjustment" ADD CONSTRAINT "SettlementAdjustment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SettlementAdjustment" ADD CONSTRAINT "SettlementAdjustment_sourceSettlementLineId_fkey" FOREIGN KEY ("sourceSettlementLineId") REFERENCES "SettlementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SettlementAdjustment" ADD CONSTRAINT "SettlementAdjustment_settlementBatchId_fkey" FOREIGN KEY ("settlementBatchId") REFERENCES "SettlementBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
