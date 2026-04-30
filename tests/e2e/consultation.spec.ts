import crypto from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { AgentPackageStatus, PrismaClient, UserRole, WhitelistStatus } from "@prisma/client";

loadEnvConfig(process.cwd());
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:55432/hermes_agent_marketplace?schema=public";

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("anonymous visitor can submit a consultation from an agent detail page", async ({ page }) => {
  const suffix = crypto.randomUUID();
  const creatorEmail = `creator-${suffix}@example.com`;
  const slug = `research-assistant-${suffix}`;
  const buyerEmail = `buyer-${suffix}@example.com`;
  const requirement = "Need deployment support for an internal research team";

  const creator = await prisma.user.create({
    data: {
      email: creatorEmail,
      role: UserRole.CREATOR,
      whitelistStatus: WhitelistStatus.ACTIVE
    }
  });

  try {
    await prisma.agentPackage.create({
      data: {
        ownerId: creator.id,
        name: "Research Assistant",
        slug,
        version: "1.0.0",
        summary: "Summarizes research findings.",
        categories: ["research"],
        metadataJson: {
          id: "research-assistant",
          name: "Research Assistant",
          version: "1.0.0",
          summary: "Summarizes research findings.",
          categories: ["research"],
          skills: [],
          workflows: []
        },
        zipFileUrl: "/api/uploads/research-assistant.zip",
        zipFileName: `research-assistant-${suffix}.zip`,
        zipSizeBytes: 128,
        validationResult: {
          errors: [],
          risks: [],
          fileNames: ["agent.json", "README.md"]
        },
        status: AgentPackageStatus.PUBLISHED,
        publishedAt: new Date()
      }
    });

    await page.goto(`/agents/${slug}`);
    await page.getByLabel("联系邮箱").fill(buyerEmail);
    await page.getByLabel("需求说明").fill(requirement);
    await page.getByRole("button", { name: "咨询服务" }).click();

    await expect(page.getByText("咨询已创建，后续可据此生成服务订单。")).toBeVisible();
    await expect(page.getByText("新咨询")).toBeVisible();

    const consultation = await prisma.consultation.findFirst({
      where: {
        agentPackage: {
          slug
        },
        buyerEmail
      }
    });

    expect(consultation?.requirement).toBe(requirement);
  } finally {
    await prisma.consultation.deleteMany({
      where: {
        agentPackage: {
          slug
        }
      }
    });
    await prisma.agentPackage.deleteMany({
      where: {
        slug
      }
    });
    await prisma.user.deleteMany({
      where: {
        id: creator.id
      }
    });
  }
});
