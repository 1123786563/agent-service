import { AgentPackageStatus, UserRole } from "@prisma/client";
import { prisma } from "@/server/db";

export async function authorizeAgentZipDownload(slug: string) {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) {
    throw new Error("Package slug is required");
  }

  const agentPackage = await prisma.agentPackage.findUnique({
    where: {
      slug: normalizedSlug
    },
    select: {
      id: true,
      slug: true,
      status: true,
      zipFileName: true,
      objectKey: true,
      updatedAt: true
    }
  });

  if (!agentPackage || agentPackage.status !== AgentPackageStatus.PUBLISHED) {
    throw new Error("Agent package not found");
  }

  return {
    actorScope: "anonymous" as const,
    resourceType: "agent_zip" as const,
    resourceId: agentPackage.id,
    objectKey: agentPackage.objectKey ?? `agents/${agentPackage.zipFileName}`,
    resourceVersion: agentPackage.updatedAt.toISOString(),
    fileName: agentPackage.zipFileName,
    slug: agentPackage.slug
  };
}

export async function authorizeDeliveryAssetDownload(input: {
  orderId: string;
  deliveryId: string;
  requester: {
    userId: string;
    email: string;
    role: UserRole;
  };
}) {
  const delivery = await prisma.delivery.findUnique({
    where: {
      id: input.deliveryId
    },
    include: {
      serviceOrder: {
        select: {
          id: true,
          buyerEmail: true,
          status: true
        }
      }
    }
  });

  if (!delivery || delivery.serviceOrderId !== input.orderId) {
    throw new Error("Delivery not found");
  }

  const requesterEmail = input.requester.email.toLowerCase();
  const buyerEmail = delivery.serviceOrder.buyerEmail.toLowerCase();
  const actorScope =
    input.requester.role === UserRole.ADMIN
      ? "admin"
      : input.requester.userId === delivery.providerId
        ? "provider"
        : requesterEmail === buyerEmail
          ? "buyer"
          : null;

  if (!actorScope) {
    throw new Error("Delivery access is required");
  }

  return {
    actorScope,
    resourceType: "delivery_asset" as const,
    resourceId: delivery.id,
    objectKey: delivery.objectKey ?? `deliveries/${delivery.fileName}`,
    resourceVersion: `${delivery.createdAt.toISOString()}:${delivery.acceptedAt?.toISOString() ?? "pending"}`,
    fileName: delivery.fileName
  };
}
