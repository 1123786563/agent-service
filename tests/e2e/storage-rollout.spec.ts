import crypto from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import {
  AgentPackageStatus,
  PaymentStatus,
  PrismaClient,
  ServiceOrderStatus,
  StorageProviderKind,
  UserRole,
  WhitelistStatus
} from "@prisma/client";
import { getS3CompatibleStorageProvider } from "@/server/storage/s3-provider";
import { createAgentZip } from "@/test/fixtures";

loadEnvConfig(process.cwd());
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:55432/hermes_agent_marketplace?schema=public";

const prisma = new PrismaClient();
const sessionDays = 30;
const sessionCookie = "hermes_market_session";
const baseUrl = "http://localhost:3000";

const s3Configured = Boolean(
  process.env.STORAGE_PROVIDER === "s3-compatible" &&
  process.env.S3_ENDPOINT &&
  process.env.S3_REGION &&
  process.env.S3_BUCKET &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY
);

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

test.skip(!s3Configured, "S3-compatible runtime storage is not configured for this environment");

test("s3-compatible runtime keeps ZIP and delivery downloads working", async ({ browser, page }) => {
  const suffix = crypto.randomUUID();
  const creatorEmail = `creator-${suffix}@example.com`;
  const buyerEmail = `buyer-${suffix}@example.com`;
  const slug = `s3-agent-${suffix}`;
  const zipFileName = `s3-agent-${suffix}.zip`;
  const deliveryFileName = `handoff-${suffix}.txt`;

  const provider = getS3CompatibleStorageProvider();
  const zipBuffer = await createAgentZip();
  const zipStored = await provider.putObject({
    scope: "agents",
    buffer: zipBuffer,
    originalFileName: zipFileName,
    objectKey: `agents/${zipFileName}`
  });
  const deliveryBuffer = Buffer.from("delivery bytes from s3-compatible provider");
  const deliveryStored = await provider.putObject({
    scope: "deliveries",
    buffer: deliveryBuffer,
    originalFileName: deliveryFileName,
    objectKey: `deliveries/${deliveryFileName}`
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
        name: "S3 Rollout Agent",
        slug,
        version: "1.0.0",
        summary: "Verifies s3-compatible rollout smoke coverage.",
        categories: ["ops"],
        metadataJson: {
          id: "s3-rollout-agent",
          name: "S3 Rollout Agent",
          version: "1.0.0",
          summary: "Verifies s3-compatible rollout smoke coverage.",
          categories: ["ops"],
          skills: [],
          workflows: []
        },
        zipFileUrl: zipStored.url,
        zipFileName: zipStored.fileName,
        zipSizeBytes: zipStored.sizeBytes,
        objectKey: zipStored.objectKey,
        storageProvider: StorageProviderKind.S3_COMPATIBLE,
        bucket: zipStored.bucket,
        mimeType: zipStored.mimeType,
        contentDisposition: zipStored.contentDisposition,
        checksum: zipStored.checksum,
        validationResult: {
          errors: [],
          risks: [],
          fileNames: ["agent.json", "README.md"]
        },
        status: AgentPackageStatus.PUBLISHED,
        publishedAt: new Date()
      }
    });

    const order = await prisma.serviceOrder.create({
      data: {
        consultation: {
          create: {
            agentPackageId: agentPackage.id,
            providerId: creator.id,
            buyerEmail,
            buyerUserId: buyer.id,
            requirement: "Need rollout validation",
            status: "ORDER_CREATED",
            scopedSummary: "Need rollout validation"
          }
        },
        buyerEmail,
        buyerUserId: buyer.id,
        providerId: creator.id,
        title: "S3 rollout order",
        scope: "Need rollout validation",
        priceCents: 32000,
        currency: "USD",
        status: ServiceOrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID,
        paymentProvider: "dev",
        paymentReference: `devpay_${suffix}`,
        deliveries: {
          create: {
            providerId: creator.id,
            fileUrl: deliveryStored.url,
            fileName: deliveryStored.fileName,
            fileSizeBytes: deliveryStored.sizeBytes,
            objectKey: deliveryStored.objectKey,
            storageProvider: StorageProviderKind.S3_COMPATIBLE,
            bucket: deliveryStored.bucket,
            mimeType: deliveryStored.mimeType,
            contentDisposition: deliveryStored.contentDisposition,
            checksum: deliveryStored.checksum,
            note: "S3 delivery handoff"
          }
        }
      },
      include: {
        deliveries: true
      }
    });

    await page.goto(`/agents/${slug}`);
    const [zipDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "下载 ZIP" }).click()
    ]);
    expect(await zipDownload.path()).toBeTruthy();

    const anonymousContext = await browser.newContext();
    const anonymousPage = await anonymousContext.newPage();
    await anonymousPage.goto(`/api/orders/${order.id}/deliveries/${order.deliveries[0].id}/download`);
    await expect(anonymousPage).toHaveURL(/\/login$/);
    await anonymousContext.close();

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
    await expect(buyerPage.getByText("S3 rollout order")).toBeVisible();
    const [deliveryDownload] = await Promise.all([
      buyerPage.waitForEvent("download"),
      buyerPage.getByRole("link", { name: "下载交付物" }).click()
    ]);
    expect(await deliveryDownload.path()).toBeTruthy();
    await buyerContext.close();
  } finally {
    await prisma.delivery.deleteMany({
      where: {
        serviceOrder: {
          title: "S3 rollout order"
        }
      }
    });
    await prisma.serviceOrder.deleteMany({
      where: {
        title: "S3 rollout order"
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

    await provider.deleteObject({ objectKey: zipStored.objectKey });
    await provider.deleteObject({ objectKey: deliveryStored.objectKey });
  }
});
