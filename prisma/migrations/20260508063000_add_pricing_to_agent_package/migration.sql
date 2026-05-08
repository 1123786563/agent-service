-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('FREE', 'PAID');

-- AlterTable
ALTER TABLE "AgentPackage" ADD COLUMN "pricingType" "PricingType" NOT NULL DEFAULT 'FREE';
ALTER TABLE "AgentPackage" ADD COLUMN "priceCents" INTEGER NOT NULL DEFAULT 0;
