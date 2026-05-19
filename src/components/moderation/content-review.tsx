"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface ModerationEvent {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  note?: string;
}

interface QueueItem {
  id: string;
  contentType: "text" | "image";
  contentPreview: string;
  submittedAt: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "pending" | "in_review" | "resolved" | "escalated";
  assignedModerator?: string;
  language: "en" | "zh" | "ja" | "ko";
  toxicityScore: number;
  flaggedPhrases: string[];
  moderationHistory: ModerationEvent[];
}

interface QueueResponse {
  items: QueueItem[];
  total: number;
  hasMore: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ff385c",
  high: "#e00b41",
  medium: "#92174d",
  low: "#ffd1da",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  in_review: "审核中",
  resolved: "已解决",
  escalated: "已升级",
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
};

export default function ContentReview() {
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    severity: "",
    status: "",
    language: "",
    contentType: "",
  });

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.status) params.set("status", filters.status);
    if (filters.language) params.set("language", filters.language);
    if (filters.contentType) params.set("contentType", filters.contentType);
    const res = await fetch(`/api/moderation/queue?${params}`);
    const data: QueueResponse = await res.json();
    setQueue(data);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleAction = async (itemId: string, action: "approve" | "reject" | "escalate") => {
    setActionLoading(itemId);
    await fetch(`/api/moderation/queue/${itemId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setActionLoading(null);
    setSelected(null);
    fetchQueue();
  };

  const exportCSV = () => {
    if (!queue) return;
    const header = "ID,Type,Severity,Status,Language,Toxicity Score,Submitted At,Flagged Phrases\n";
    const rows = queue.items
      .map(
        (item) =>
          `${item.id},${item.contentType},${item.severity},${item.status},${item.language},${item.toxicityScore},${item.submittedAt},"${item.flaggedPhrases.join("; ")}"`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `moderation-report-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="stack">
      <div className="market-hero">
        <div>
          <p className="eyebrow">Review</p>
          <h1>内容审查</h1>
          <p className="lede">查看、批准、拒绝或升级标记的内容项。</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="button secondary" href="/moderation">
            分析面板
          </Link>
          <button className="button secondary" onClick={exportCSV}>
            导出 CSV
          </button>
        </div>
      </div>

      <div className="mod-filter-bar">
        <label>
          严重程度
          <select
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
          >
            <option value="">全部</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          状态
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">全部</option>
            <option value="pending">待处理</option>
            <option value="in_review">审核中</option>
            <option value="resolved">已解决</option>
            <option value="escalated">已升级</option>
          </select>
        </label>
        <label>
          语言
          <select
            value={filters.language}
            onChange={(e) => setFilters({ ...filters, language: e.target.value })}
          >
            <option value="">全部</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </select>
        </label>
        <label>
          类型
          <select
            value={filters.contentType}
            onChange={(e) => setFilters({ ...filters, contentType: e.target.value })}
          >
            <option value="">全部</option>
            <option value="text">文本</option>
            <option value="image">图片</option>
          </select>
        </label>
      </div>

      <div className="mod-review-layout">
        <div className="mod-queue-list">
          {loading ? (
            <div className="panel" style={{ textAlign: "center", padding: 40 }}>
              <p className="muted">加载中...</p>
            </div>
          ) : !queue?.items.length ? (
            <div className="panel empty-panel" style={{ textAlign: "center", padding: 40 }}>
              <p className="muted">没有匹配的内容项。</p>
            </div>
          ) : (
            queue.items.map((item) => (
              <article
                key={item.id}
                className={`panel mod-queue-item${selected?.id === item.id ? " selected" : ""}`}
                onClick={() => setSelected(item)}
              >
                <div className="mod-queue-item-header">
                  <span className="status-pill" style={{ borderColor: SEVERITY_COLORS[item.severity] }}>
                    {item.severity}
                  </span>
                  <span className="status-pill">{STATUS_LABELS[item.status]}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {LANGUAGE_LABELS[item.language]}
                  </span>
                </div>
                <h3 style={{ fontSize: 14, margin: "8px 0 4px" }}>{item.id}</h3>
                <p className="muted" style={{ fontSize: 13, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.contentPreview}
                </p>
                <div className="mod-queue-item-footer">
                  <span className="muted" style={{ fontSize: 11 }}>
                    {new Date(item.submittedAt).toLocaleDateString("zh-CN")}
                  </span>
                  <span className="muted" style={{ fontSize: 11 }}>
                    毒性: {(item.toxicityScore * 100).toFixed(0)}%
                  </span>
                </div>
              </article>
            ))
          )}
        </div>

        {selected && (
          <div className="mod-detail-panel">
            <div className="mod-detail-header">
              <h2>{selected.id}</h2>
              <span className="status-pill" style={{ borderColor: SEVERITY_COLORS[selected.severity] }}>
                {selected.severity}
              </span>
            </div>

            <div className="mod-detail-meta">
              <div>
                <strong>状态：</strong>
                {STATUS_LABELS[selected.status]}
              </div>
              <div>
                <strong>类型：</strong>
                {selected.contentType === "text" ? "文本" : "图片"}
              </div>
              <div>
                <strong>语言：</strong>
                {LANGUAGE_LABELS[selected.language]}
              </div>
              <div>
                <strong>毒性评分：</strong>
                {(selected.toxicityScore * 100).toFixed(0)}%
              </div>
              <div>
                <strong>提交时间：</strong>
                {new Date(selected.submittedAt).toLocaleString("zh-CN")}
              </div>
              {selected.assignedModerator && (
                <div>
                  <strong>审核员：</strong>
                  {selected.assignedModerator}
                </div>
              )}
            </div>

            <div className="mod-detail-section">
              <h3>内容预览</h3>
              <div className="mod-content-preview">
                {selected.contentPreview}
              </div>
            </div>

            <div className="mod-detail-section">
              <h3>标记短语</h3>
              <div className="flow-list">
                {selected.flaggedPhrases.map((phrase) => (
                  <span key={phrase}>
                    <b>!</b> {phrase}
                  </span>
                ))}
              </div>
            </div>

            {selected.moderationHistory.length > 0 && (
              <div className="mod-detail-section">
                <h3>审核历史</h3>
                <div className="mod-timeline">
                  {selected.moderationHistory.map((event) => (
                    <div key={event.id} className="mod-timeline-item">
                      <div className="mod-timeline-dot" />
                      <div>
                        <strong>{event.action}</strong> — {event.actor}
                        <br />
                        <span className="muted" style={{ fontSize: 12 }}>
                          {new Date(event.timestamp).toLocaleString("zh-CN")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mod-actions">
              <button
                className="button"
                disabled={actionLoading === selected.id}
                onClick={() => handleAction(selected.id, "approve")}
              >
                批准
              </button>
              <button
                className="button secondary"
                style={{ borderColor: "#ff385c", color: "#ff385c" }}
                disabled={actionLoading === selected.id}
                onClick={() => handleAction(selected.id, "reject")}
              >
                拒绝
              </button>
              <button
                className="button secondary"
                style={{ borderColor: "#e00b41", color: "#e00b41" }}
                disabled={actionLoading === selected.id}
                onClick={() => handleAction(selected.id, "escalate")}
              >
                升级
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
