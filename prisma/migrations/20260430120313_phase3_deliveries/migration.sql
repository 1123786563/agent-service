-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceOrderStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "ServiceOrderStatus" ADD VALUE 'COMPLETED';

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "note" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Delivery_serviceOrderId_submittedAt_idx" ON "Delivery"("serviceOrderId", "submittedAt");

-- CreateIndex
CREATE INDEX "Delivery_providerId_submittedAt_idx" ON "Delivery"("providerId", "submittedAt");

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
