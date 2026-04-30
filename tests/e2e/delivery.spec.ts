import crypto from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import {
  AgentPackageStatus,
  ConsultationStatus,
  PaymentStatus,
  PrismaClient,
  ServiceOrderStatus,
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

test("creator uploads a delivery and buyer confirms completion", async ({ browser }) => {
  const suffix = crypto.randomUUID();
  const creatorEmail = `creator-${suffix}@example.com`;
  const buyerEmail = `buyer-${suffix}@example.com`;
  const slug = `delivery-agent-${suffix}`;
  const deliveryNote = "Final deployment handoff";

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
        name: "Delivery Agent",
        slug,
        version: "1.0.0",
        summary: "Handles delivery smoke testing.",
        categories: ["delivery"],
        metadataJson: {
          id: "delivery-agent",
          name: "Delivery Agent",
          version: "1.0.0",
          summary: "Handles delivery smoke testing.",
          categories: ["delivery"],
          skills: [],
          workflows: []
        },
        zipFileUrl: "/api/uploads/delivery-agent.zip",
        zipFileName: `delivery-agent-${suffix}.zip`,
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
        requirement: "Deploy this agent",
        status: ConsultationStatus.ORDER_CREATED,
        scopedSummary: "Deploy this agent"
      }
    });
    const order = await prisma.serviceOrder.create({
      data: {
        consultationId: consultation.id,
        buyerEmail,
        buyerUserId: buyer.id,
        providerId: creator.id,
        title: "Delivery smoke order",
        scope: "Deploy this agent",
        priceCents: 50000,
        currency: "USD",
        status: ServiceOrderStatus.IN_PROGRESS,
        paymentStatus: PaymentStatus.PAID,
        paymentProvider: "dev",
        paymentReference: `devpay_${suffix}`
      }
    });

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
    await creatorPage.getByLabel("交付文件").setInputFiles({
      name: "handoff.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("delivery-bytes")
    });
    await creatorPage.getByLabel("交付说明").fill(deliveryNote);
    await creatorPage.getByRole("button", { name: "上传交付物" }).click();
    await expect(creatorPage.getByText("待验收")).toBeVisible();
    await creatorContext.close();

    const deliveredOrder = await prisma.serviceOrder.findUnique({
      where: { id: order.id },
      include: { deliveries: true }
    });
    expect(deliveredOrder?.status).toBe(ServiceOrderStatus.DELIVERED);
    expect(deliveredOrder?.deliveries[0]?.note).toBe(deliveryNote);

    const buyerToken = await createTestSession(buyer.id);
    const buyerContext = await browser.newContext();
    await buyerContext.addCookies([{
      name: sessionCookie,
      value: buyerToken,
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax"
    }]);
    const buyerPage = await buyerContext.newPage();
    await buyerPage.goto("/account/orders");
    await expect(buyerPage.getByText(deliveryNote)).toBeVisible();
    await expect(buyerPage.getByRole("link", { name: "下载交付物" })).toBeVisible();
    await buyerPage.getByRole("button", { name: "确认完成" }).click();
    await expect(buyerPage.getByText("已完成")).toBeVisible();
    await buyerContext.close();

    const completedOrder = await prisma.serviceOrder.findUnique({
      where: { id: order.id },
      include: { deliveries: true }
    });
    expect(completedOrder?.status).toBe(ServiceOrderStatus.COMPLETED);
    expect(completedOrder?.deliveries[0]?.acceptedAt).toBeTruthy();
  } finally {
    await prisma.delivery.deleteMany({
      where: {
        serviceOrder: {
          consultation: {
            agentPackage: {
              slug
            }
          }
        }
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
