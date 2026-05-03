"use server";

import { revalidatePath } from "next/cache";
import {
  AgentPackageStatus,
  DisputeResolutionType,
  PaymentStatus,
  ServiceOrderStatus,
  UserRole,
  WhitelistStatus
} from "@prisma/client";
import { requireAdmin } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { resolveLatestOpenDisputeForOrder } from "@/server/disputes/service";
import { buildSettlementLine, markSettlementBatchPaidOut, submitSettlementBatch } from "@/server/settlements/service";

export async function activateCreatorWhitelist(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    throw new Error("Email is required");
  }

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      role: UserRole.CREATOR,
      whitelistStatus: WhitelistStatus.ACTIVE
    },
    update: {
      role: UserRole.CREATOR,
      whitelistStatus: WhitelistStatus.ACTIVE
    }
  });

  revalidatePath("/admin/whitelist");
}

export async function archiveAgentPackage(formData: FormData) {
  await requireAdmin();

  const packageId = String(formData.get("packageId") ?? "").trim();
  if (!packageId) {
    throw new Error("Package ID is required");
  }

  await prisma.agentPackage.update({
    where: { id: packageId },
    data: { status: AgentPackageStatus.ARCHIVED }
  });

  revalidatePath("/admin");
  revalidatePath("/agents");
}

export async function resetOrderPayment(formData: FormData) {
  await requireAdmin();

  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  await prisma.serviceOrder.update({
    where: { id: orderId },
    data: {
      status: ServiceOrderStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.UNPAID,
      paymentReference: null
    }
  });

  revalidatePath("/admin");
  revalidatePath("/admin/analytics");
  revalidatePath("/account/orders");
  revalidatePath("/creator/orders");
}

export async function resolveDisputedOrder(formData: FormData) {
  await requireAdmin();

  const orderId = String(formData.get("orderId") ?? "").trim();
  const nextStatus = String(formData.get("nextStatus") ?? "").trim();
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  let resolutionType: DisputeResolutionType | null = null;

  if (nextStatus === "IN_PROGRESS") {
    resolutionType = DisputeResolutionType.RETURN_TO_PROGRESS;
  }

  if (nextStatus === "DELIVERED") {
    resolutionType = DisputeResolutionType.RETURN_TO_DELIVERED;
  }

  if (nextStatus === "CANCELLED") {
    resolutionType = DisputeResolutionType.REFUND_FULL;
  }

  if (!resolutionType) {
    throw new Error("Valid dispute resolution status is required");
  }

  await resolveLatestOpenDisputeForOrder({
    orderId,
    resolutionType
  });

  revalidatePath("/admin");
  revalidatePath("/admin/analytics");
  revalidatePath("/account/orders");
  revalidatePath("/creator/orders");
}

export async function markOrderSettled(formData: FormData) {
  await requireAdmin();

  const orderId = String(formData.get("orderId") ?? "").trim();
  const settlementReference = String(formData.get("settlementReference") ?? "").trim();
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const line = await buildSettlementLine(orderId);
  await submitSettlementBatch({
    providerId: line.providerId,
    lineIds: [line.id],
    payoutReference: settlementReference || null
  });

  revalidatePath("/admin");
  revalidatePath("/admin/analytics");
  revalidatePath("/creator/orders");
}

export async function markSettlementBatchPaidOutAction(formData: FormData) {
  await requireAdmin();

  const batchId = String(formData.get("batchId") ?? "").trim();
  const settlementReference = String(formData.get("settlementReference") ?? "").trim();
  if (!batchId) {
    throw new Error("Batch ID is required");
  }

  await markSettlementBatchPaidOut({
    batchId,
    payoutReference: settlementReference || null
  });

  revalidatePath("/admin");
  revalidatePath("/admin/analytics");
  revalidatePath("/creator/orders");
}
