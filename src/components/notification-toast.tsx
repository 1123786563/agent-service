"use client";

import React, { useEffect, useState, useCallback } from "react";
import type { Notification } from "@/lib/notifications";

interface ToastItem {
  id: string;
  notification: Notification;
}

export function NotificationToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((notification: Notification) => {
    const id = notification.id;
    setToasts((prev) => [...prev, { id, notification }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/notifications/ws`;
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.event === "notification" && parsed.data) {
            addToast(parsed.data);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      ws?.close();
      clearTimeout(reconnectTimer);
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-label="通知">
      {toasts.map(({ id, notification }) => (
        <div key={id} className="toast-item" role="alert">
          <div className="toast-content">
            <strong className="toast-title">{notification.title}</strong>
            <p className="toast-body">{notification.body}</p>
          </div>
          <button className="toast-dismiss" onClick={() => dismiss(id)} aria-label="关闭">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
