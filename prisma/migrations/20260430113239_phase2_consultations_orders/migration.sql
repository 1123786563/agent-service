-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('NEW', 'IN_DISCUSSION', 'SCOPED', 'ORDER_CREATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'FAILED');

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "agentPackageId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerUserId" TEXT,
    "requirement" TEXT NOT NULL,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'NEW',
    "scopedSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerUserId" TEXT,
    "providerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentProvider" TEXT NOT NULL,
    "paymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Consultation_agentPackageId_idx" ON "Consultation"("agentPackageId");

-- CreateIndex
CREATE INDEX "Consultation_providerId_createdAt_idx" ON "Consultation"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "Consultation_buyerEmail_createdAt_idx" ON "Consultation"("buyerEmail", "createdAt");

-- CreateIndex
CREATE INDEX "Consultation_buyerUserId_idx" ON "Consultation"("buyerUserId");

-- CreateIndex
CREATE INDEX "ServiceOrder_consultationId_idx" ON "ServiceOrder"("consultationId");

-- CreateIndex
CREATE INDEX "ServiceOrder_providerId_createdAt_idx" ON "ServiceOrder"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceOrder_buyerEmail_createdAt_idx" ON "ServiceOrder"("buyerEmail", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceOrder_buyerUserId_idx" ON "ServiceOrder"("buyerUserId");

-- CreateIndex
CREATE INDEX "ServiceOrder_status_paymentStatus_idx" ON "ServiceOrder"("status", "paymentStatus");

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_agentPackageId_fkey" FOREIGN KEY ("agentPackageId") REFERENCES "AgentPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
