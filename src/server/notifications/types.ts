import { NotificationChannel, NotificationType } from "@prisma/client";

export type { NotificationChannel, NotificationType };

export interface NotificationEvent {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  imageUrl?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  dedupKey?: string;
}

export interface DispatchResult {
  notificationId: string;
  deliveries: { channel: NotificationChannel; status: string }[];
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  ORDER_CREATED: "新订单",
  ORDER_PAID: "订单已付款",
  ORDER_IN_PROGRESS: "订单进行中",
  ORDER_DELIVERED: "订单已交付",
  ORDER_COMPLETED: "订单已完成",
  ORDER_CANCELLED: "订单已取消",
  ORDER_DISPUTED: "订单争议",
  CONSULTATION_NEW: "新咨询",
  CONSULTATION_SCOPED: "咨询已确认",
  REVIEW_RECEIVED: "收到评价",
  PACKAGE_PUBLISHED: "智能体已发布",
  DELIVERY_SUBMITTED: "交付已提交",
  PAYMENT_RECEIVED: "收到付款",
  SETTLEMENT_PAID: "结算已完成",
  SYSTEM_ANNOUNCEMENT: "系统公告",
};

export const DEFAULT_CHANNELS_PER_TYPE: Record<NotificationType, NotificationChannel[]> = {
  ORDER_CREATED: [NotificationChannel.EMAIL, NotificationChannel.PUSH, NotificationChannel.IN_APP],
  ORDER_PAID: [NotificationChannel.EMAIL, NotificationChannel.PUSH, NotificationChannel.IN_APP],
  ORDER_IN_PROGRESS: [NotificationChannel.IN_APP],
  ORDER_DELIVERED: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
  ORDER_COMPLETED: [NotificationChannel.EMAIL, NotificationChannel.PUSH, NotificationChannel.IN_APP],
  ORDER_CANCELLED: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
  ORDER_DISPUTED: [NotificationChannel.EMAIL, NotificationChannel.PUSH, NotificationChannel.IN_APP],
  CONSULTATION_NEW: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
  CONSULTATION_SCOPED: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
  REVIEW_RECEIVED: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
  PACKAGE_PUBLISHED: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
  DELIVERY_SUBMITTED: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
  PAYMENT_RECEIVED: [NotificationChannel.EMAIL, NotificationChannel.PUSH, NotificationChannel.IN_APP],
  SETTLEMENT_PAID: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
  SYSTEM_ANNOUNCEMENT: [NotificationChannel.EMAIL, NotificationChannel.PUSH, NotificationChannel.IN_APP],
};
