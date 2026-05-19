"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  fetchUnreadCount,
  fetchNotifications,
  markAsRead,
  markAllRead,
  timeAgo,
  NOTIFICATION_TYPE_LABELS,
  type Notification,
} from "@/lib/notifications";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshUnread = useCallback(async () => {
    const count = await fetchUnreadCount();
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    refreshUnread();
    const interval = setInterval(refreshUnread, 30_000);
    return () => clearInterval(interval);
  }, [refreshUnread]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [open]);

  const toggleDropdown = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      const res = await fetchNotifications({ limit: 10, read: "all" });
      setNotifications(res.data);
      setLoading(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    await markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    refreshUnread();
  };

  const handleMarkAllRead = async () => {
    await markAllRead();
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);
  };

  return (
    <div className="notification-bell-container" ref={containerRef}>
      <button
        className="nav-link notification-bell-btn"
        onClick={toggleDropdown}
        aria-label={`通知${unreadCount > 0 ? ` (${unreadCount}条未读)` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="bell-icon" aria-hidden="true">
          🔔
        </span>
        {unreadCount > 0 && (
          <span className="bell-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown" role="menu" aria-label="通知列表">
          <div className="notification-dropdown-header">
            <span className="notification-dropdown-title">通知</span>
            {unreadCount > 0 && (
              <button className="notification-mark-all-btn" onClick={handleMarkAllRead}>
                全部已读
              </button>
            )}
          </div>

          <div className="notification-dropdown-list">
            {loading && (
              <div className="notification-loading">加载中...</div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="notification-empty">暂无通知</div>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`notification-item ${n.readAt ? "" : "unread"}`}
                role="menuitem"
              >
                <div className="notification-item-content">
                  <span className="notification-type-label">
                    {NOTIFICATION_TYPE_LABELS[n.type]}
                  </span>
                  <span className="notification-item-title">{n.title}</span>
                  <p className="notification-item-body">{n.body}</p>
                  <span className="notification-item-time">{timeAgo(n.createdAt)}</span>
                </div>
                <div className="notification-item-actions">
                  {!n.readAt && (
                    <button
                      className="notification-read-btn"
                      onClick={() => handleMarkRead(n.id)}
                      aria-label="标记为已读"
                    >
                      ✓
                    </button>
                  )}
                  {n.link && (
                    <Link
                      href={n.link}
                      className="notification-link-btn"
                      onClick={() => setOpen(false)}
                    >
                      查看
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="notification-dropdown-footer">
            <Link href="/notifications" className="notification-view-all" onClick={() => setOpen(false)}>
              查看全部通知
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
