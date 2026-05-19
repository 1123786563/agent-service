import { NotificationType } from "@prisma/client";
import { Resend } from "resend";
import { prisma } from "@/server/db";

const DIGEST_THRESHOLD_HOURS = 24;

async function sendDigestEmail(
  email: string,
  notifications: {
    title: string;
    body: string;
    type: NotificationType;
    createdAt: Date;
  }[]
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not configured — skipping digest email");
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

  const lines = notifications
    .map(
      (n) =>
        `[${n.type}] ${n.title}\n${n.body}\n${n.createdAt.toISOString()}\n`
    )
    .join("\n");

  const subject =
    notifications.length === 1
      ? "You have 1 unread notification"
      : `You have ${notifications.length} unread notifications`;

  const { error } = await resend.emails.send({
    from,
    to: email,
    subject,
    text: `You have unread notifications from the past 24 hours:\n\n${lines}\nLog in to view details.`
  });

  if (error) {
    throw new Error(`Failed to send digest email: ${error.message}`);
  }
}

export async function sendDigestEmails() {
  const cutoff = new Date(
    Date.now() - DIGEST_THRESHOLD_HOURS * 60 * 60 * 1000
  );

  const usersWithUnread = await prisma.user.findMany({
    where: {
      notifications: {
        some: {
          readAt: null,
          createdAt: { lt: cutoff }
        }
      }
    },
    select: {
      id: true,
      email: true,
      notificationPreferences: true,
      notifications: {
        where: {
          readAt: null,
          createdAt: { lt: cutoff }
        },
        select: {
          id: true,
          title: true,
          body: true,
          type: true,
          createdAt: true
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  let sentCount = 0;

  for (const user of usersWithUnread) {
    const prefsMap = new Map(
      user.notificationPreferences.map((p) => [p.notificationType, p])
    );

    // Filter to notifications where email is enabled (default: enabled)
    const emailEnabled = user.notifications.filter((n) => {
      const pref = prefsMap.get(n.type);
      return pref ? pref.emailEnabled : true;
    });

    if (emailEnabled.length === 0) continue;

    try {
      await sendDigestEmail(user.email, emailEnabled);
      sentCount++;
    } catch (err) {
      console.error(`Failed to send digest to ${user.email}:`, err);
    }
  }

  return { sentCount, totalUsers: usersWithUnread.length };
}
