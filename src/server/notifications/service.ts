import { NotificationChannel, NotificationType } from "@prisma/client";
import { prisma } from "@/server/db";
import { getChannelSender } from "./channel";
import type { NotificationEvent, DispatchResult } from "./types";
import { DEFAULT_CHANNELS_PER_TYPE } from "./types";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const userRateCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  let bucket = userRateCounts.get(userId);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    userRateCounts.set(userId, bucket);
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count++;
  return true;
}

async function getEnabledChannels(userId: string, type: NotificationType): Promise<NotificationChannel[]> {
  const defaultChannels = DEFAULT_CHANNELS_PER_TYPE[type] ?? [NotificationChannel.IN_APP];
  const prefs = await prisma.notificationPreference.findMany({
    where: { userId, notificationType: type },
  });
  if (prefs.length === 0) return defaultChannels;
  return prefs.filter((p) => p.enabled).map((p) => p.channel);
}

export async function dispatchNotification(event: NotificationEvent): Promise<DispatchResult> {
  if (!checkRateLimit(event.userId)) {
    return { notificationId: "", deliveries: [] };
  }

  const dedupKey = event.dedupKey;
  if (dedupKey) {
    const existing = await prisma.notification.findUnique({
      where: { userId_dedupKey: event.userId + "_" + dedupKey },
    });
    if (existing) {
      return { notificationId: existing.id, deliveries: [] };
    }
  }

  const notification = await prisma.notification.create({
    data: {
      userId: event.userId,
      type: event.type,
      title: event.title,
      body: event.body,
      imageUrl: event.imageUrl,
      actionUrl: event.actionUrl,
      metadataJson: event.metadata ?? undefined,
      dedupKey,
    },
  });

  const channels = await getEnabledChannels(event.userId, event.type);
  const deliveries: DispatchResult["deliveries"] = [];

  for (const channel of channels) {
    const delivery = await prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel,
      },
    });

    const sender = getChannelSender(channel);
    const result = await sender.send(
      event.userId,
      notification.id,
      event.title,
      event.body,
      event.actionUrl
    );

    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: result.success ? "SENT" : "FAILED",
        providerRef: result.providerRef,
        sentAt: result.success ? new Date() : undefined,
        failedAt: result.success ? undefined : new Date(),
        failureReason: result.error,
      },
    });

    deliveries.push({ channel, status: result.success ? "SENT" : "FAILED" });
  }

  return { notificationId: notification.id, deliveries };
}

export async function getUserNotifications(
  userId: string,
  options: { limit?: number; offset?: number; unreadOnly?: boolean } = {}
) {
  const { limit = 20, offset = 0, unreadOnly = false } = options;
  return prisma.notification.findMany({
    where: {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    include: { deliveries: true },
  });
}

export async function getUnreadCount(userId: string) {
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}

export async function markAsRead(userId: string, notificationIds: string[]) {
  return prisma.notification.updateMany({
    where: {
      id: { in: notificationIds },
      userId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}

export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function getUserPreferences(userId: string) {
  return prisma.notificationPreference.findMany({
    where: { userId },
  });
}

export async function upsertPreference(
  userId: string,
  notificationType: NotificationType,
  channel: NotificationChannel,
  enabled: boolean
) {
  return prisma.notificationPreference.upsert({
    where: {
      userId_notificationType_channel: {
        userId,
        notificationType,
        channel,
      },
    },
    create: {
      userId,
      notificationType,
      channel,
      enabled,
    },
    update: { enabled },
  });
}

export async function registerPushToken(userId: string, token: string, platform: string = "web") {
  return prisma.pushToken.upsert({
    where: { userId_token: { userId, token } },
    create: { userId, token, platform },
    update: { platform, updatedAt: new Date() },
  });
}

export async function unregisterPushToken(userId: string, token: string) {
  return prisma.pushToken.deleteMany({
    where: { userId, token },
  });
}
