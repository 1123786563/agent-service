"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  actionUrl?: string | null;
  readAt?: string | null;
  createdAt: string;
}

interface UseNotificationsReturn {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (ids: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useNotifications(limit = 20): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      // Silently fail — will retry on next poll
    }
  }, [limit]);

  const markAsRead = useCallback(async (ids: string[]) => {
    const res = await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (res.ok) {
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - ids.length));
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    const res = await fetch("/api/notifications/read-all", { method: "POST" });
    if (res.ok) {
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    }
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // SSE stream for real-time updates
  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    eventSourceRef.current = es;

    es.addEventListener("notification", (e) => {
      try {
        const n = JSON.parse(e.data) as NotificationItem;
        setNotifications((prev) => [n, ...prev].slice(0, limit));
        setUnreadCount((prev) => prev + 1);
      } catch {
        // Ignore malformed data
      }
    });

    es.onerror = () => {
      es.close();
      // Reconnect after 10 seconds
      const timer = setTimeout(() => {
        const newEs = new EventSource("/api/notifications/stream");
        eventSourceRef.current = newEs;
      }, 10000);
      return () => clearTimeout(timer);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [limit]);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, refresh };
}
