import { UserRole, WhitelistStatus, NotificationType } from "@prisma/client";
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

  // Seed notification data for dev testing
  const firstUser = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" }
  });

  if (firstUser) {
    await prisma.notification.createMany({
      data: [
        {
          userId: firstUser.id,
          type: NotificationType.SYSTEM_ANNOUNCEMENT,
          title: "Welcome to the platform!",
          body: "Your account has been set up. Explore the marketplace to get started.",
          link: "/agents"
        },
        {
          userId: firstUser.id,
          type: NotificationType.ORDER_STATUS_CHANGED,
          title: "Order status updated",
          body: "Your order #ORD-001 has been moved to 'In Progress'.",
          link: "/account/orders"
        },
        {
          userId: firstUser.id,
          type: NotificationType.PAYMENT_RECEIVED,
          title: "Payment confirmed",
          body: "Payment of $49.99 for order #ORD-001 has been received.",
          link: "/account/orders"
        },
        {
          userId: firstUser.id,
          type: NotificationType.DELIVERY_SUBMITTED,
          title: "Delivery submitted",
          body: "A delivery has been submitted for order #ORD-001.",
          link: "/account/orders",
          readAt: new Date()
        },
        {
          userId: firstUser.id,
          type: NotificationType.REVIEW_RECEIVED,
          title: "New review",
          body: "Someone left a 5-star review on your agent package.",
          link: "/creator/agents"
        }
      ],
      skipDuplicates: true
    });

    // Seed default notification preferences
    const allTypes = Object.values(NotificationType);
    for (const notificationType of allTypes) {
      await prisma.notificationPreference.upsert({
        where: {
          userId_notificationType: {
            userId: firstUser.id,
            notificationType
          }
        },
        create: {
          userId: firstUser.id,
          notificationType,
          emailEnabled: true,
          pushEnabled: true
        },
        update: {}
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
