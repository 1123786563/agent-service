"use client";

import React from "react";
import Link from "next/link";
import { useNotifications } from "@/hooks/use-notifications";

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
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

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const { notifications, unreadCount, loading, markAllAsRead } = useNotifications(50);

  return (
    <section className="stack">
      <div className="section-header">
        <div>
          <h1>通知中心</h1>
          <p className="muted">{unreadCount > 0 ? `${unreadCount} 条未读通知` : "没有未读通知"}</p>
        </div>
        <div className="actions">
          {unreadCount > 0 && (
            <button className="button secondary pill" onClick={markAllAsRead}>
              全部标记已读
            </button>
          )}
          <Link href="/account/notifications/preferences" className="button secondary pill">
            通知设置
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="panel empty-panel" style={{ padding: "40px", textAlign: "center" }}>
          加载中...
        </div>
      ) : notifications.length === 0 ? (
        <div className="panel empty-panel" style={{ padding: "40px", textAlign: "center" }}>
          <p>暂无通知</p>
        </div>
      ) : (
        <ul className="notification-list">
          {notifications.map((n) => (
            <li key={n.id} className={`panel notification-card ${n.readAt ? "" : "unread"}`}>
              <div className="notification-card-header">
                <span className="status-pill">
                  {NOTIFICATION_TYPE_LABELS[n.type] ?? n.type}
                </span>
                <span className="muted" style={{ fontSize: "13px" }}>
                  {formatTime(n.createdAt)}
                </span>
              </div>
              <h3 style={{ marginBottom: "4px" }}>{n.title}</h3>
              <p className="muted" style={{ marginBottom: "8px" }}>
                {n.body}
              </p>
              {n.actionUrl && (
                <a href={n.actionUrl} className="surface-link" style={{ fontSize: "14px" }}>
                  查看详情
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
