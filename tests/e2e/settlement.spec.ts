import crypto from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import {
  AgentPackageStatus,
  ConsultationStatus,
  PaymentStatus,
  PrismaClient,
  ServiceOrderStatus,
  SettlementBatchStatus,
  SettlementLineStatus,
  UserRole,
  WhitelistStatus
} from "@prisma/client";

loadEnvConfig(process.cwd());
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:55432/hermes_agent_marketplace?schema=public";

const prisma = new PrismaClient();
const sessionDays = 30;
const sessionCookie = "hermes_market_session";
const baseUrl = "http://localhost:3000";

function createSessionTokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createTestSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId,
      tokenHash: createSessionTokenHash(token),
      expiresAt: new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000)
    }
  });
  return token;
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("admin can submit and pay out a settlement batch after a completed paid order", async ({ browser }) => {
  const suffix = crypto.randomUUID();
  const adminEmail = (process.env.ADMIN_EMAILS ?? "admin@example.com")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .find(Boolean) ?? "admin@example.com";
  const creatorEmail = `creator-${suffix}@example.com`;
  const buyerEmail = `buyer-${suffix}@example.com`;
  const slug = `settlement-agent-${suffix}`;
  const batchReference = `batch-${suffix}`;
  const payoutReference = `bank-transfer-${suffix}`;

  const admin = await prisma.user.upsert({
    where: {
      email: adminEmail
    },
    create: {
      email: adminEmail,
      role: UserRole.ADMIN,
      whitelistStatus: WhitelistStatus.ACTIVE
    },
    update: {
      role: UserRole.ADMIN,
      whitelistStatus: WhitelistStatus.ACTIVE
    }
  });
  const creator = await prisma.user.create({
    data: {
      email: creatorEmail,
      role: UserRole.CREATOR,
      whitelistStatus: WhitelistStatus.ACTIVE
    }
  });
  const buyer = await prisma.user.create({
    data: {
      email: buyerEmail,
      role: UserRole.USER,
      whitelistStatus: WhitelistStatus.NONE
    }
  });

  try {
    const agentPackage = await prisma.agentPackage.create({
      data: {
        ownerId: creator.id,
        name: "Settlement Agent",
        slug,
        version: "1.0.0",
        summary: "Supports settlement smoke testing.",
        categories: ["ops"],
        metadataJson: {
          id: "settlement-agent",
          name: "Settlement Agent",
          version: "1.0.0",
          summary: "Supports settlement smoke testing.",
          categories: ["ops"],
          skills: [],
          workflows: []
        },
        zipFileUrl: "/api/uploads/settlement-agent.zip",
        zipFileName: `settlement-agent-${suffix}.zip`,
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
    const consultation = await prisma.consultation.create({
      data: {
        agentPackageId: agentPackage.id,
        providerId: creator.id,
        buyerEmail,
        buyerUserId: buyer.id,
        requirement: "Need settlement-ready delivery",
        status: ConsultationStatus.ORDER_CREATED,
        scopedSummary: "Need settlement-ready delivery"
      }
    });
    const order = await prisma.serviceOrder.create({
      data: {
        consultationId: consultation.id,
        buyerEmail,
        buyerUserId: buyer.id,
        providerId: creator.id,
        title: "Settlement smoke order",
        scope: "Need settlement-ready delivery",
        priceCents: 64000,
        currency: "USD",
        status: ServiceOrderStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID,
        paymentProvider: "dev",
        paymentReference: `devpay_${suffix}`
      }
    });

    const adminToken = await createTestSession(admin.id);
    const adminContext = await browser.newContext();
    await adminContext.addCookies([{
      name: sessionCookie,
      value: adminToken,
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax"
    }]);

    const adminPage = await adminContext.newPage();
    await adminPage.goto("/admin");
    const pendingOrderPanel = adminPage.locator("article.panel")
      .filter({
        has: adminPage.getByLabel("结算备注")
      })
      .filter({
        hasText: "Settlement smoke order"
      })
      .first();
    await expect(pendingOrderPanel).toBeVisible();
    await pendingOrderPanel.getByLabel("结算备注").fill(batchReference);
    await pendingOrderPanel.getByRole("button", { name: "提交结算批次" }).click();

    await expect(adminPage.getByRole("heading", { name: "待出款结算批次" })).toBeVisible();
    const pendingBatchPanel = adminPage.locator("article.panel")
      .filter({
        has: adminPage.getByLabel("出款参考号")
      })
      .filter({
        hasText: "Settlement smoke order"
      })
      .first();
    await expect(pendingBatchPanel).toBeVisible();
    await pendingBatchPanel.getByLabel("出款参考号").fill(payoutReference);
    await pendingBatchPanel.getByRole("button", { name: "标记已出款" }).click();

    await expect(adminPage.getByText("暂无待出款结算批次。")).toBeVisible();
    await adminContext.close();

    const settlementLine = await prisma.settlementLine.findUnique({
      where: { orderId: order.id }
    });
    expect(settlementLine?.status).toBe(SettlementLineStatus.SETTLED);
    expect(settlementLine?.settledAt).toBeTruthy();

    const settlementBatch = await prisma.settlementBatch.findFirst({
      where: {
        providerId: creator.id
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    expect(settlementBatch?.status).toBe(SettlementBatchStatus.PAID_OUT);
    expect(settlementBatch?.payoutReference).toBe(payoutReference);

    const creatorToken = await createTestSession(creator.id);
    const creatorContext = await browser.newContext();
    await creatorContext.addCookies([{
      name: sessionCookie,
      value: creatorToken,
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax"
    }]);
    const creatorPage = await creatorContext.newPage();
    await creatorPage.goto("/creator/orders");
    await expect(creatorPage.getByText("结算状态：已结算")).toBeVisible();
    await creatorContext.close();
  } finally {
    await prisma.settlementLine.deleteMany({
      where: {
        order: {
          consultation: {
            agentPackage: {
              slug
            }
          }
        }
      }
    });
    await prisma.settlementBatch.deleteMany({
      where: {
        providerId: creator.id
      }
    });
    await prisma.serviceOrder.deleteMany({
      where: {
        consultation: {
          agentPackage: {
            slug
          }
        }
      }
    });
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
        id: {
          in: [creator.id, buyer.id]
        }
      }
    });
  }
});
