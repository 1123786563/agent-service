"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

interface Preference {
  id: string;
  notificationType: string;
  channel: string;
  enabled: boolean;
}

const NOTIFICATION_TYPES = [
  "ORDER_CREATED",
  "ORDER_PAID",
  "ORDER_COMPLETED",
  "ORDER_CANCELLED",
  "ORDER_DISPUTED",
  "CONSULTATION_NEW",
  "REVIEW_RECEIVED",
  "PACKAGE_PUBLISHED",
  "PAYMENT_RECEIVED",
  "SYSTEM_ANNOUNCEMENT",
] as const;

const CHANNELS = [
  { key: "EMAIL", label: "邮件" },
  { key: "PUSH", label: "推送" },
  { key: "IN_APP", label: "站内" },
] as const;

const TYPE_LABELS: Record<string, string> = {
  ORDER_CREATED: "新订单",
  ORDER_PAID: "订单已付款",
  ORDER_COMPLETED: "订单已完成",
  ORDER_CANCELLED: "订单已取消",
  ORDER_DISPUTED: "订单争议",
  CONSULTATION_NEW: "新咨询",
  REVIEW_RECEIVED: "收到评价",
  PACKAGE_PUBLISHED: "智能体已发布",
  PAYMENT_RECEIVED: "收到付款",
  SYSTEM_ANNOUNCEMENT: "系统公告",
};

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then((r) => r.json())
      .then((data) => {
        setPrefs(data.preferences ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const isEnabled = (type: string, channel: string) => {
    const p = prefs.find((x) => x.notificationType === type && x.channel === channel);
    return p ? p.enabled : true;
  };

  const toggle = async (type: string, channel: string) => {
    const key = `${type}-${channel}`;
    setSaving(key);
    const newValue = !isEnabled(type, channel);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationType: type, channel, enabled: newValue }),
      });
      if (res.ok) {
        const data = await res.json();
        setPrefs((prev) => {
          const exists = prev.findIndex(
            (p) => p.notificationType === type && p.channel === channel
          );
          if (exists >= 0) {
            const copy = [...prev];
            copy[exists] = data.preference;
            return copy;
          }
          return [...prev, data.preference];
        });
      }
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="stack">
      <div className="section-header">
        <div>
          <h1>通知设置</h1>
          <p className="muted">管理您接收通知的方式</p>
        </div>
        <Link href="/account/notifications" className="button secondary pill">
          返回通知
        </Link>
      </div>

      {loading ? (
        <div className="panel empty-panel" style={{ padding: "40px", textAlign: "center" }}>
          加载中...
        </div>
      ) : (
        <div className="panel">
          <table className="pref-table">
            <thead>
              <tr>
                <th>通知类型</th>
                {CHANNELS.map((ch) => (
                  <th key={ch.key}>{ch.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_TYPES.map((type) => (
                <tr key={type}>
                  <td>{TYPE_LABELS[type]}</td>
                  {CHANNELS.map((ch) => {
                    const key = `${type}-${ch.key}`;
                    const checked = isEnabled(type, ch.key);
                    return (
                      <td key={ch.key}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={saving === key}
                          onChange={() => toggle(type, ch.key)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
