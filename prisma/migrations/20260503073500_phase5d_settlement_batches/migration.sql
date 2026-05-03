-- CreateEnum
CREATE TYPE "SettlementLineStatus" AS ENUM ('PENDING', 'LOCKED', 'SETTLED');

-- CreateEnum
CREATE TYPE "SettlementBatchStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PAID_OUT', 'FAILED');

-- CreateTable
CREATE TABLE "SettlementLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "grossAmountMinor" INTEGER NOT NULL,
    "feeRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "feePolicySnapshot" JSONB,
    "platformFeeAmountMinor" INTEGER NOT NULL,
    "netAmountMinor" INTEGER NOT NULL,
    "refundDeductionAmount" INTEGER NOT NULL DEFAULT 0,
    "adjustmentAmount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "status" "SettlementLineStatus" NOT NULL DEFAULT 'PENDING',
    "eligibleAt" TIMESTAMP(3) NOT NULL,
    "holdUntil" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "settlementBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementBatch" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "totalAmountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "SettlementBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "payoutReference" TEXT,
    "submittedAt" TIMESTAMP(3),
    "paidOutAt" TIMESTAMP(3),
    "lineSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SettlementLine_orderId_key" ON "SettlementLine"("orderId");

-- CreateIndex
CREATE INDEX "SettlementLine_providerId_status_eligibleAt_idx" ON "SettlementLine"("providerId", "status", "eligibleAt");

-- CreateIndex
CREATE INDEX "SettlementLine_settlementBatchId_idx" ON "SettlementLine"("settlementBatchId");

-- CreateIndex
CREATE INDEX "SettlementBatch_providerId_status_createdAt_idx" ON "SettlementBatch"("providerId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_settlementBatchId_fkey" FOREIGN KEY ("settlementBatchId") REFERENCES "SettlementBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

