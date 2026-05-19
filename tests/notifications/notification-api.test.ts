import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
const mockPrisma = {
  notification: {
    findMany: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
  },
  notificationPreference: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock("@/server/db", () => ({
  prisma: mockPrisma,
}));

const mockUser = { id: "user_1", email: "test@example.com" };

vi.mock("@/server/auth/session", () => ({
  getCurrentUser: vi.fn().mockResolvedValue(mockUser),
}));

const FAKE_USER_ID = "user_1";

describe("Notification API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/notifications", () => {
    it("returns notifications and unread count", async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        { id: "n1", userId: FAKE_USER_ID, type: "ORDER_CREATED", title: "新订单", body: "test", readAt: null, createdAt: new Date(), deliveries: [] },
      ]);
      mockPrisma.notification.count.mockResolvedValue(1);

      const { GET } = await import("@/app/api/notifications/route");
      const req = new Request("http://localhost:3000/api/notifications?limit=10");
      const res = await GET(req as unknown as Request);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.notifications).toHaveLength(1);
      expect(data.unreadCount).toBe(1);
    });

    it("returns 401 for unauthenticated requests", async () => {
      const { getCurrentUser } = await import("@/server/auth/session");
      (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const { GET } = await import("@/app/api/notifications/route");
      const req = new Request("http://localhost:3000/api/notifications");
      const res = await GET(req as unknown as Request);

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/notifications/read", () => {
    it("marks notifications as read", async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 2 });

      const { POST } = await import("@/app/api/notifications/read/route");
      const req = new Request("http://localhost:3000/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ["n1", "n2"] }),
      });
      const res = await POST(req as unknown as Request);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.updated).toBe(2);
    });

    it("rejects empty ids array", async () => {
      const { POST } = await import("@/app/api/notifications/read/route");
      const req = new Request("http://localhost:3000/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }),
      });
      const res = await POST(req as unknown as Request);

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/notifications/read-all", () => {
    it("marks all notifications as read", async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const { POST } = await import("@/app/api/notifications/read-all/route");
      const res = await POST();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.updated).toBe(5);
    });
  });

  describe("GET /api/notifications/count", () => {
    it("returns unread count", async () => {
      mockPrisma.notification.count.mockResolvedValue(3);

      const { GET } = await import("@/app/api/notifications/count/route");
      const res = await GET();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.unreadCount).toBe(3);
    });
  });

  describe("PUT /api/notifications/preferences", () => {
    it("validates notification type", async () => {
      const { PUT } = await import("@/app/api/notifications/preferences/route");
      const req = new Request("http://localhost:3000/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationType: "INVALID", channel: "EMAIL", enabled: true }),
      });
      const res = await PUT(req as unknown as Request);

      expect(res.status).toBe(400);
    });

    it("creates a preference", async () => {
      const mockPref = { id: "p1", userId: FAKE_USER_ID, notificationType: "ORDER_CREATED", channel: "EMAIL", enabled: false };
      mockPrisma.notificationPreference.upsert.mockResolvedValue(mockPref);

      const { PUT } = await import("@/app/api/notifications/preferences/route");
      const req = new Request("http://localhost:3000/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationType: "ORDER_CREATED", channel: "EMAIL", enabled: false }),
      });
      const res = await PUT(req as unknown as Request);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.preference.enabled).toBe(false);
    });
  });
});
