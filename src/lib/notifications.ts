export type NotificationType =
  | "ORDER_STATUS_CHANGED"
  | "DELIVERY_SUBMITTED"
  | "PAYMENT_RECEIVED"
  | "DISPUTE_OPENED"
  | "REVIEW_RECEIVED"
  | "SYSTEM_ANNOUNCEMENT";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  data: Notification[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface UnreadCountResponse {
  data: { unreadCount: number };
}

export interface NotificationPreference {
  notificationType: NotificationType;
  emailEnabled: boolean;
  pushEnabled: boolean;
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  ORDER_STATUS_CHANGED: "订单状态变更",
  DELIVERY_SUBMITTED: "交付提交",
  PAYMENT_RECEIVED: "收款通知",
  DISPUTE_OPENED: "争议通知",
  REVIEW_RECEIVED: "评价通知",
  SYSTEM_ANNOUNCEMENT: "系统公告",
};

export async function fetchUnreadCount(): Promise<number> {
  const res = await fetch("/api/notifications/unread-count");
  if (!res.ok) return 0;
  const json: UnreadCountResponse = await res.json();
  return json.data.unreadCount;
}

export async function fetchNotifications(params?: {
  cursor?: string;
  limit?: number;
  read?: "true" | "false" | "all";
  type?: NotificationType;
}): Promise<NotificationListResponse> {
  const sp = new URLSearchParams();
  if (params?.cursor) sp.set("cursor", params.cursor);
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.read) sp.set("read", params.read);
  if (params?.type) sp.set("type", params.type);
  const res = await fetch(`/api/notifications?${sp.toString()}`);
  if (!res.ok) return { data: [], pagination: { nextCursor: null, hasMore: false } };
  return res.json();
}

export async function markAsRead(id: string): Promise<Notification | null> {
  const res = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

export async function markAllRead(): Promise<number> {
  const res = await fetch("/api/notifications/mark-all-read", { method: "POST" });
  if (!res.ok) return 0;
  const json = await res.json();
  return json.data.updatedCount;
}

export async function fetchPreferences(): Promise<NotificationPreference[]> {
  const res = await fetch("/api/notifications/preferences");
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}

export async function updatePreferences(
  preferences: Array<{
    notificationType: NotificationType;
    emailEnabled?: boolean;
    pushEnabled?: boolean;
  }>
): Promise<boolean> {
  const res = await fetch("/api/notifications/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferences }),
  });
  return res.ok;
}

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  return `${months}个月前`;
}
