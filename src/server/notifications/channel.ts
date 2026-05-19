import { NotificationChannel } from "@prisma/client";
import { sendNotificationEmail } from "@/server/mail/notification-mailer";
import { sendPushNotification } from "@/server/notifications/push-sender";
import { prisma } from "@/server/db";

export interface ChannelSender {
  send(
    userId: string,
    notificationId: string,
    title: string,
    body: string,
    actionUrl?: string
  ): Promise<{ providerRef?: string; success: boolean; error?: string }>;
}

const emailSender: ChannelSender = {
  async send(userId, notificationId, title, body, actionUrl) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) {
      return { success: false, error: "User not found" };
    }
    try {
      await sendNotificationEmail(user.email, title, body, actionUrl);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  },
};

const pushSender: ChannelSender = {
  async send(userId, _notificationId, title, body, actionUrl) {
    return sendPushNotification(userId, title, body, actionUrl);
  },
};

const inAppSender: ChannelSender = {
  async send(_userId, _notificationId) {
    // In-app notifications are stored in DB via the Notification model itself.
    // Real-time delivery is handled by SSE — no separate send step needed.
    return { success: true };
  },
};

export function getChannelSender(channel: NotificationChannel): ChannelSender {
  switch (channel) {
    case "EMAIL":
      return emailSender;
    case "PUSH":
      return pushSender;
    case "IN_APP":
      return inAppSender;
  }
}
