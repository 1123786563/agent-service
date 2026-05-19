"use client";

import React, { useEffect, useRef, useState } from "react";
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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead } = useNotifications(5);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      const unreadIds = notifications.filter((n) => !n.readAt).map((n) => n.id);
      if (unreadIds.length > 0) await markAsRead(unreadIds);
    }
  };

  return (
    <div className="notification-bell-wrapper" ref={ref}>
      <button
        className="nav-link notification-bell-btn"
        onClick={handleToggle}
        aria-label={`通知 ${unreadCount > 0 ? `(${unreadCount} 条未读)` : ""}`}
      >
        <span className="bell-icon" aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <strong>通知</strong>
            <Link href="/account/notifications" onClick={() => setOpen(false)}>
              查看全部
            </Link>
          </div>
          {notifications.length === 0 ? (
            <div className="notification-dropdown-empty">暂无通知</div>
          ) : (
            <ul className="notification-dropdown-list">
              {notifications.map((n) => (
                <li key={n.id} className={n.readAt ? "read" : "unread"}>
                  <span className="notification-type-label">
                    {NOTIFICATION_TYPE_LABELS[n.type] ?? n.type}
                  </span>
                  <p className="notification-item-title">{n.title}</p>
                  <p className="notification-item-body">{n.body}</p>
                  <span className="notification-item-time">{timeAgo(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
