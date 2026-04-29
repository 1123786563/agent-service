/*
  Warnings:

  - Made the column `userId` on table `MagicLinkToken` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "MagicLinkToken" DROP CONSTRAINT "MagicLinkToken_userId_fkey";

-- AlterTable
ALTER TABLE "MagicLinkToken" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "AgentPackage_ownerId_createdAt_idx" ON "AgentPackage"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentPackage_status_publishedAt_idx" ON "AgentPackage"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Skill_agentPackageId_idx" ON "Skill"("agentPackageId");

-- CreateIndex
CREATE INDEX "Workflow_agentPackageId_idx" ON "Workflow"("agentPackageId");

-- AddForeignKey
ALTER TABLE "MagicLinkToken" ADD CONSTRAINT "MagicLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
