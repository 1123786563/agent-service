-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN     "settledAt" TIMESTAMP(3),
ADD COLUMN     "settlementReference" TEXT;

-- CreateIndex
CREATE INDEX "ServiceOrder_status_settledAt_idx" ON "ServiceOrder"("status", "settledAt");
