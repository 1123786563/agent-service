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

test("buyer can cancel an unpaid order", async ({ browser }) => {
  const suffix = crypto.randomUUID();
  const creatorEmail = `creator-${suffix}@example.com`;
  const buyerEmail = `buyer-${suffix}@example.com`;
  const slug = `cancel-agent-${suffix}`;

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
        name: "Cancel Agent",
        slug,
        version: "1.0.0",
        summary: "Supports cancel flow smoke testing.",
        categories: ["ops"],
        metadataJson: {
          id: "cancel-agent",
          name: "Cancel Agent",
          version: "1.0.0",
          summary: "Supports cancel flow smoke testing.",
          categories: ["ops"],
          skills: [],
          workflows: []
        },
        zipFileUrl: "/api/uploads/cancel-agent.zip",
        zipFileName: `cancel-agent-${suffix}.zip`,
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
        requirement: "Need setup help",
        status: ConsultationStatus.ORDER_CREATED,
        scopedSummary: "Need setup help"
      }
    });
    const order = await prisma.serviceOrder.create({
      data: {
        consultationId: consultation.id,
        buyerEmail,
        buyerUserId: buyer.id,
        providerId: creator.id,
        title: "Cancel smoke order",
        scope: "Need setup help",
        priceCents: 12000,
        currency: "USD",
        status: ServiceOrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.UNPAID,
        paymentProvider: "dev"
      }
    });

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
    await expect(buyerPage.getByText("Cancel smoke order")).toBeVisible();
    await buyerPage.getByRole("button", { name: "取消订单" }).click();
    await expect(buyerPage.getByText("已取消")).toBeVisible();
    await buyerContext.close();

    const cancelledOrder = await prisma.serviceOrder.findUnique({
      where: { id: order.id }
    });
    expect(cancelledOrder?.status).toBe(ServiceOrderStatus.CANCELLED);
  } finally {
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

test("buyer can dispute a delivered order", async ({ browser }) => {
  const suffix = crypto.randomUUID();
  const creatorEmail = `creator-${suffix}@example.com`;
  const buyerEmail = `buyer-${suffix}@example.com`;
  const slug = `dispute-agent-${suffix}`;

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
        name: "Dispute Agent",
        slug,
        version: "1.0.0",
        summary: "Supports dispute flow smoke testing.",
        categories: ["ops"],
        metadataJson: {
          id: "dispute-agent",
          name: "Dispute Agent",
          version: "1.0.0",
          summary: "Supports dispute flow smoke testing.",
          categories: ["ops"],
          skills: [],
          workflows: []
        },
        zipFileUrl: "/api/uploads/dispute-agent.zip",
        zipFileName: `dispute-agent-${suffix}.zip`,
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
        requirement: "Need deployment help",
        status: ConsultationStatus.ORDER_CREATED,
        scopedSummary: "Need deployment help"
      }
    });
    const order = await prisma.serviceOrder.create({
      data: {
        consultationId: consultation.id,
        buyerEmail,
        buyerUserId: buyer.id,
        providerId: creator.id,
        title: "Dispute smoke order",
        scope: "Need deployment help",
        priceCents: 25000,
        currency: "USD",
        status: ServiceOrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID,
        paymentProvider: "dev",
        paymentReference: `devpay_${suffix}`
      }
    });
    await prisma.delivery.create({
      data: {
        serviceOrderId: order.id,
        providerId: creator.id,
        fileUrl: "/api/deliveries/dispute.txt",
        fileName: `dispute-${suffix}.txt`,
        fileSizeBytes: 32,
        note: "Please review"
      }
    });

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
    await expect(buyerPage.getByText("Dispute smoke order")).toBeVisible();
    await buyerPage.getByRole("button", { name: "发起争议" }).click();
    await expect(buyerPage.getByText("争议中")).toBeVisible();
    await buyerContext.close();

    const disputedOrder = await prisma.serviceOrder.findUnique({
      where: { id: order.id }
    });
    expect(disputedOrder?.status).toBe(ServiceOrderStatus.DISPUTED);
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
