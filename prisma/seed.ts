import { UserRole, WhitelistStatus } from "@prisma/client";
import { prisma } from "../src/server/db";

async function main() {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  for (const email of adminEmails) {
    await prisma.user.upsert({
      where: { email },
      create: {
        email,
        role: UserRole.ADMIN,
        whitelistStatus: WhitelistStatus.ACTIVE
      },
      update: {
        role: UserRole.ADMIN,
        whitelistStatus: WhitelistStatus.ACTIVE
      }
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
