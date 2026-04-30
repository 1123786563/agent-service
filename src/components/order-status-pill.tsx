import React from "react";

export type OrderStatusValue =
  | "PENDING_PAYMENT"
  | "PAID"
  | "IN_PROGRESS"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";

const ORDER_STATUS_LABELS: Record<OrderStatusValue, string> = {
  PENDING_PAYMENT: "待支付",
  PAID: "已支付",
  IN_PROGRESS: "进行中",
  DELIVERED: "待验收",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  DISPUTED: "争议中"
};

export function OrderStatusPill({ status }: { status: OrderStatusValue }) {
  return <span className="status-pill">{ORDER_STATUS_LABELS[status]}</span>;
}
