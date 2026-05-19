import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma client
const mockPrisma = {
  notification: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  notificationDelivery: {
    create: vi.fn(),
    update: vi.fn(),
  },
  notificationPreference: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  pushToken: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/server/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/server/mail/notification-mailer", () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/notifications/push-sender", () => ({
  sendPushNotification: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

const FAKE_USER_ID = "user_test_123";

function createMockNotification(overrides = {}) {
  return {
    id: "notif_1",
    userId: FAKE_USER_ID,
    type: "ORDER_CREATED",
    title: "新订单",
    body: "您有一个新订单",
    imageUrl: null,
    actionUrl: "/account/orders",
    metadataJson: null,
    dedupKey: null,
    readAt: null,
    createdAt: new Date(),
    deliveries: [],
    ...overrides,
  };
}

describe("Notification Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.notification.create.mockResolvedValue(createMockNotification());
    mockPrisma.notification.findUnique.mockResolvedValue(null);
    mockPrisma.notificationPreference.findMany.mockResolvedValue([]);
    mockPrisma.notificationDelivery.create.mockResolvedValue({ id: "del_1" });
    mockPrisma.notificationDelivery.update.mockResolvedValue({ id: "del_1" });
  });

  describe("dispatchNotification", () => {
    it("creates a notification and dispatches to default channels", async () => {
      const { dispatchNotification } = await import("@/server/notifications/service");

      const result = await dispatchNotification({
        userId: FAKE_USER_ID,
        type: "ORDER_CREATED",
        title: "新订单",
        body: "您有一个新订单",
        actionUrl: "/account/orders",
      });

      expect(result.notificationId).toBe("notif_1");
      expect(mockPrisma.notification.create).toHaveBeenCalledOnce();
      expect(mockPrisma.notificationDelivery.create).toHaveBeenCalled();
    });

    it("deduplicates notifications by dedupKey", async () => {
      const existing = createMockNotification();
      mockPrisma.notification.findUnique.mockResolvedValue(existing);

      const { dispatchNotification } = await import("@/server/notifications/service");

      const result = await dispatchNotification({
        userId: FAKE_USER_ID,
        type: "ORDER_CREATED",
        title: "新订单",
        body: "您有一个新订单",
        dedupKey: "order:123",
      });

      expect(result.notificationId).toBe("notif_1");
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it("respects notification preferences", async () => {
      mockPrisma.notificationPreference.findMany.mockResolvedValue([
        { notificationType: "ORDER_CREATED", channel: "EMAIL", enabled: false },
        { notificationType: "ORDER_CREATED", channel: "PUSH", enabled: false },
        { notificationType: "ORDER_CREATED", channel: "IN_APP", enabled: true },
      ]);

      const { dispatchNotification } = await import("@/server/notifications/service");

      await dispatchNotification({
        userId: FAKE_USER_ID,
        type: "ORDER_CREATED",
        title: "新订单",
        body: "您有一个新订单",
      });

      // Only IN_APP channel should create a delivery
      expect(mockPrisma.notificationDelivery.create).toHaveBeenCalledOnce();
    });
  });

  describe("getUserNotifications", () => {
    it("returns notifications for a user", async () => {
      const notifs = [createMockNotification(), createMockNotification({ id: "notif_2" })];
      mockPrisma.notification.findMany.mockResolvedValue(notifs);

      const { getUserNotifications } = await import("@/server/notifications/service");
      const result = await getUserNotifications(FAKE_USER_ID);

      expect(result).toHaveLength(2);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: FAKE_USER_ID }),
        })
      );
    });

    it("filters unread only", async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      const { getUserNotifications } = await import("@/server/notifications/service");
      await getUserNotifications(FAKE_USER_ID, { unreadOnly: true });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: FAKE_USER_ID, readAt: null }),
        })
      );
    });
  });

  describe("markAsRead", () => {
    it("marks specified notifications as read", async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 2 });

      const { markAsRead } = await import("@/server/notifications/service");
      const result = await markAsRead(FAKE_USER_ID, ["notif_1", "notif_2"]);

      expect(result.count).toBe(2);
    });
  });

  describe("upsertPreference", () => {
    it("creates or updates a notification preference", async () => {
      const mockPref = { id: "pref_1", userId: FAKE_USER_ID, notificationType: "ORDER_CREATED", channel: "EMAIL", enabled: true };
      mockPrisma.notificationPreference.upsert.mockResolvedValue(mockPref);

      const { upsertPreference } = await import("@/server/notifications/service");
      const result = await upsertPreference(FAKE_USER_ID, "ORDER_CREATED", "EMAIL", true);

      expect(result.enabled).toBe(true);
      expect(mockPrisma.notificationPreference.upsert).toHaveBeenCalled();
    });
  });

  describe("pushToken management", () => {
    it("registers a push token", async () => {
      mockPrisma.pushToken.upsert.mockResolvedValue({ id: "pt_1" });

      const { registerPushToken } = await import("@/server/notifications/service");
      const result = await registerPushToken(FAKE_USER_ID, "token123", "web");

      expect(result.id).toBe("pt_1");
    });

    it("unregisters a push token", async () => {
      mockPrisma.pushToken.deleteMany.mockResolvedValue({ count: 1 });

      const { unregisterPushToken } = await import("@/server/notifications/service");
      await unregisterPushToken(FAKE_USER_ID, "token123");

      expect(mockPrisma.pushToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: FAKE_USER_ID, token: "token123" },
      });
    });
  });
});
