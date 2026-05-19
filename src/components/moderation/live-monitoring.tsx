"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

interface HealthService {
  service: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  lastChecked: string;
  details?: string;
}

interface LiveEvent {
  id: string;
  type: "flagged" | "approved" | "rejected" | "escalated";
  contentId: string;
  severity: string;
  timestamp: string;
  preview: string;
}

const STATUS_ICONS: Record<string, string> = {
  healthy: "●",
  degraded: "◐",
  down: "○",
};

const STATUS_COLORS: Record<string, string> = {
  healthy: "#0f7a4f",
  degraded: "#d97706",
  down: "#c13515",
};

const EVENT_COLORS: Record<string, string> = {
  flagged: "#ff385c",
  approved: "#0f7a4f",
  rejected: "#c13515",
  escalated: "#92174d",
};

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const TYPES = ["flagged", "approved", "rejected", "escalated"] as const;

function generateLiveEvent(): LiveEvent {
  const type = TYPES[Math.floor(Math.random() * TYPES.length)];
  const severity = SEVERITIES[Math.floor(Math.random() * SEVERITIES.length)];
  const id = `mod-${String(Math.floor(Math.random() * 9999)).padStart(4, "0")}`;
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    contentId: id,
    severity,
    timestamp: new Date().toISOString(),
    preview:
      type === "flagged"
        ? `内容 #${id} 被标记为 ${severity} 级别`
        : type === "approved"
          ? `内容 #${id} 已通过审核`
          : type === "rejected"
            ? `内容 #${id} 已被拒绝`
            : `内容 #${id} 已升级处理`,
  };
}

export default function LiveMonitoring() {
  const [services, setServices] = useState<HealthService[]>([]);
  const [overall, setOverall] = useState<string>("healthy");
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const fetchHealth = useCallback(async () => {
    const res = await fetch("/api/moderation/health");
    const data = await res.json();
    setServices(data.services);
    setOverall(data.overall);
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  useEffect(() => {
    if (isPaused) return;
    const initial: LiveEvent[] = Array.from({ length: 8 }, () => generateLiveEvent());
    setEvents(initial);

    const interval = setInterval(() => {
      setEvents((prev) => {
        const next = [generateLiveEvent(), ...prev].slice(0, 50);
        return next;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [isPaused]);

  useEffect(() => {
    if (feedRef.current && !isPaused) {
      feedRef.current.scrollTop = 0;
    }
  }, [events, isPaused]);

  return (
    <section className="stack">
      <div className="market-hero">
        <div>
          <p className="eyebrow">Monitoring</p>
          <h1>实时监控</h1>
          <p className="lede">实时查看审核事件流和各服务健康状态。</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="button secondary" href="/moderation">
            分析面板
          </Link>
          <Link className="button secondary" href="/moderation/review">
            内容审查
          </Link>
        </div>
      </div>

      <div className="mod-monitoring-layout">
        <div className="mod-live-feed">
          <div className="section-header">
            <h2>实时活动</h2>
            <button
              className={`button secondary pill${isPaused ? " active-range" : ""}`}
              onClick={() => setIsPaused(!isPaused)}
              style={
                isPaused
                  ? { background: "var(--text)", color: "#fff", borderColor: "var(--text)" }
                  : {}
              }
            >
              {isPaused ? "已暂停" : "暂停"}
            </button>
          </div>

          <div className="mod-feed-list" ref={feedRef}>
            {events.map((event) => (
              <div
                key={event.id}
                className="panel mod-feed-item"
                style={{ borderLeftColor: EVENT_COLORS[event.type], borderLeftWidth: 3 }}
              >
                <div className="mod-feed-item-header">
                  <span
                    style={{
                      color: EVENT_COLORS[event.type],
                      fontWeight: 700,
                      fontSize: 12,
                      textTransform: "uppercase",
                    }}
                  >
                    {event.type}
                  </span>
                  <span className="status-pill">{event.severity}</span>
                  <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>
                    {new Date(event.timestamp).toLocaleTimeString("zh-CN")}
                  </span>
                </div>
                <p style={{ fontSize: 13, margin: "6px 0 0" }}>{event.preview}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mod-health-panel">
          <div className="section-header">
            <h2>服务健康</h2>
            <span
              className="status-pill"
              style={{
                borderColor: STATUS_COLORS[overall],
                color: STATUS_COLORS[overall],
              }}
            >
              {STATUS_ICONS[overall]} {overall}
            </span>
          </div>

          <div className="list">
            {services.map((svc) => (
              <article className="panel mod-health-card" key={svc.service}>
                <div className="mod-health-header">
                  <h3>{svc.service}</h3>
                  <span
                    className="status-pill"
                    style={{
                      borderColor: STATUS_COLORS[svc.status],
                      color: STATUS_COLORS[svc.status],
                    }}
                  >
                    {STATUS_ICONS[svc.status]} {svc.status}
                  </span>
                </div>
                <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
                  延迟：{svc.latencyMs > 0 ? `${svc.latencyMs}ms` : "N/A"}
                </p>
                {svc.details && (
                  <p style={{ color: "#d97706", fontSize: 12, margin: "4px 0 0" }}>
                    {svc.details}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
