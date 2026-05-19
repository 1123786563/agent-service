"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface AlertConfig {
  id: string;
  metric: string;
  threshold: number;
  condition: "above" | "below" | "spike";
  enabled: boolean;
  lastTriggered?: string;
}

const METRIC_LABELS: Record<string, string> = {
  toxicity_spike: "毒性峰值",
  queue_backlog: "队列积压",
  false_positive_rate: "误报率",
  response_time: "响应时间",
};

const CONDITION_LABELS: Record<string, string> = {
  above: "超过",
  below: "低于",
  spike: "突增至",
};

export default function AlertConfigPanel() {
  const [alerts, setAlerts] = useState<AlertConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/moderation/analytics/alerts");
    const data = await res.json();
    setAlerts(data.alerts);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const toggleAlert = async (id: string, enabled: boolean) => {
    await fetch("/api/moderation/analytics/alerts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled } : a)),
    );
  };

  return (
    <section className="stack">
      <div className="market-hero">
        <div>
          <p className="eyebrow">Alerts</p>
          <h1>告警配置</h1>
          <p className="lede">配置审核系统的告警规则和阈值。</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="button secondary" href="/moderation">
            分析面板
          </Link>
          <Link className="button secondary" href="/moderation/monitoring">
            实时监控
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="panel" style={{ textAlign: "center", padding: 40 }}>
          <p className="muted">加载中...</p>
        </div>
      ) : (
        <div className="list">
          {alerts.map((alert) => (
            <article className="panel" key={alert.id}>
              <div className="section-header" style={{ marginBottom: 0 }}>
                <div>
                  <h3>{METRIC_LABELS[alert.metric] ?? alert.metric}</h3>
                  <p className="muted" style={{ fontSize: 13 }}>
                    当 {METRIC_LABELS[alert.metric]} {CONDITION_LABELS[alert.condition]}{" "}
                    {alert.threshold} 时触发告警
                  </p>
                  {alert.lastTriggered && (
                    <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      上次触发：{new Date(alert.lastTriggered).toLocaleString("zh-CN")}
                    </p>
                  )}
                </div>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button
                    className={`button secondary pill${alert.enabled ? " active-range" : ""}`}
                    onClick={() => toggleAlert(alert.id, !alert.enabled)}
                    style={
                      alert.enabled
                        ? { background: "#0f7a4f", color: "#fff", borderColor: "#0f7a4f" }
                        : {}
                    }
                  >
                    {alert.enabled ? "已启用" : "已禁用"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
