"use client";

import React, { useState, useEffect } from "react";
import {
  fetchPreferences,
  updatePreferences,
  NOTIFICATION_TYPE_LABELS,
  type NotificationPreference,
  type NotificationType,
} from "@/lib/notifications";

const ALL_TYPES = Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[];

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchPreferences().then((data) => {
      setPrefs(data);
      setLoading(false);
    });
  }, []);

  const toggle = (type: NotificationType, field: "emailEnabled" | "pushEnabled") => {
    setPrefs((prev) =>
      prev.map((p) =>
        p.notificationType === type ? { ...p, [field]: !p[field] } : p
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const ok = await updatePreferences(prefs);
    setSaving(false);
    setMessage(ok ? "偏好设置已保存" : "保存失败，请重试");
    if (ok) {
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (loading) {
    return (
      <section className="stack">
        <h1>通知偏好设置</h1>
        <p className="muted">加载中...</p>
      </section>
    );
  }

  return (
    <section className="stack">
      <div className="section-header">
        <div>
          <h1>通知偏好设置</h1>
          <p className="muted">自定义各类通知的接收方式</p>
        </div>
      </div>

      {message && (
        <p className={message.includes("失败") ? "feedback-error" : "feedback-success"}>
          {message}
        </p>
      )}

      <div className="list">
        {ALL_TYPES.map((type) => {
          const pref = prefs.find((p) => p.notificationType === type) ?? {
            notificationType: type,
            emailEnabled: true,
            pushEnabled: true,
          };
          return (
            <div key={type} className="panel pref-row">
              <div className="pref-info">
                <h3>{NOTIFICATION_TYPE_LABELS[type]}</h3>
              </div>
              <div className="pref-toggles">
                <label className="pref-toggle">
                  <input
                    type="checkbox"
                    checked={pref.emailEnabled}
                    onChange={() => toggle(type, "emailEnabled")}
                  />
                  <span>邮件通知</span>
                </label>
                <label className="pref-toggle">
                  <input
                    type="checkbox"
                    checked={pref.pushEnabled}
                    onChange={() => toggle(type, "pushEnabled")}
                  />
                  <span>推送通知</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="actions">
        <button className="button" disabled={saving} onClick={handleSave}>
          {saving ? "保存中..." : "保存设置"}
        </button>
      </div>
    </section>
  );
}
