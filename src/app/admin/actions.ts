"use server";

import { revalidatePath } from "next/cache";
import { AgentPackageStatus, UserRole, WhitelistStatus } from "@prisma/client";
import { requireAdmin } from "@/server/auth/session";
import { prisma } from "@/server/db";

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
