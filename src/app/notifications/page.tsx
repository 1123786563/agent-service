"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  fetchNotifications,
  markAsRead,
  markAllRead,
  timeAgo,
  NOTIFICATION_TYPE_LABELS,
  type Notification,
  type NotificationType,
} from "@/lib/notifications";

type ReadFilter = "all" | "true" | "false";

const NOTIFICATION_TYPES: Array<{ value: NotificationType | "all"; label: string }> = [
  { value: "all", label: "全部类型" },
  { value: "ORDER_STATUS_CHANGED", label: "订单状态变更" },
  { value: "DELIVERY_SUBMITTED", label: "交付提交" },
  { value: "PAYMENT_RECEIVED", label: "收款通知" },
  { value: "DISPUTE_OPENED", label: "争议通知" },
  { value: "REVIEW_RECEIVED", label: "评价通知" },
  { value: "SYSTEM_ANNOUNCEMENT", label: "系统公告" },
];

const READ_FILTERS: Array<{ value: ReadFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "false", label: "未读" },
  { value: "true", label: "已读" },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [typeFilter, setTypeFilter] = useState<NotificationType | "all">("all");

  const load = useCallback(
    async (append = false, afterCursor?: string | null) => {
      setLoading(true);
      const res = await fetchNotifications({
        cursor: afterCursor ?? undefined,
        limit: 20,
        read: readFilter,
        type: typeFilter === "all" ? undefined : typeFilter,
      });
      if (append) {
        setNotifications((prev) => [...prev, ...res.data]);
      } else {
        setNotifications(res.data);
      }
      setHasMore(res.pagination.hasMore);
      setCursor(res.pagination.nextCursor);
      setLoading(false);
    },
    [readFilter, typeFilter]
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleMarkRead = async (id: string) => {
    await markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
  };

  const handleMarkAllRead = async () => {
    await markAllRead();
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
    );
  };

  return (
    <section className="stack">
      <div className="section-header">
        <div>
          <h1>通知</h1>
          <p className="muted">查看所有通知消息</p>
        </div>
        <div className="actions action-tight">
          <button className="button secondary pill" onClick={handleMarkAllRead}>
            全部标记已读
          </button>
        </div>
      </div>

      <div className="filters">
        <label>
          通知类型
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as NotificationType | "all")}
          >
            {NOTIFICATION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flow-list">
          {READ_FILTERS.map((f) => (
            <span
              key={f.value}
              className={readFilter === f.value ? "active-filter" : ""}
              style={{
                cursor: "pointer",
                background: readFilter === f.value ? "var(--text)" : "var(--surface-soft)",
                color: readFilter === f.value ? "#fff" : "var(--text)",
              }}
              onClick={() => setReadFilter(f.value)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") setReadFilter(f.value);
              }}
            >
              {f.label}
            </span>
          ))}
        </div>
      </div>

      <div className="list">
        {loading && notifications.length === 0 && (
          <div className="panel empty-panel">
            <p className="muted" style={{ textAlign: "center", padding: "40px 0" }}>
              加载中...
            </p>
          </div>
        )}
        {!loading && notifications.length === 0 && (
          <div className="panel empty-panel">
            <p className="muted" style={{ textAlign: "center", padding: "40px 0" }}>
              暂无通知
            </p>
          </div>
        )}
        {notifications.map((n) => (
          <article
            key={n.id}
            className={`panel notification-page-item ${n.readAt ? "" : "unread"}`}
          >
            <div className="notification-page-item-content">
              <span className="status-pill">{NOTIFICATION_TYPE_LABELS[n.type]}</span>
              <h3>{n.title}</h3>
              <p className="muted">{n.body}</p>
              <div className="notification-page-meta">
                <span className="muted">{timeAgo(n.createdAt)}</span>
              </div>
            </div>
            <div className="notification-page-actions">
              {!n.readAt && (
                <button
                  className="button secondary pill"
                  onClick={() => handleMarkRead(n.id)}
                >
                  标记已读
                </button>
              )}
              {n.link && (
                <Link href={n.link} className="button pill">
                  查看详情
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>

      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
          <button
            className="button secondary pill"
            disabled={loading}
            onClick={() => load(true, cursor)}
          >
            {loading ? "加载中..." : "加载更多"}
          </button>
        </div>
      )}
    </section>
  );
}
