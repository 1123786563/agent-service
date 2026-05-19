"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
} from "recharts";
import Link from "next/link";

interface DailyAggregation {
  date: string;
  totalFlagged: number;
  falsePositiveRate: number;
  avgResponseTimeMs: number;
  moderatorThroughput: number;
}

interface CategoryBreakdown {
  category: string;
  count: number;
  percentage: number;
  color: string;
}

interface AnalyticsData {
  summary: {
    totalFlagged: number;
    avgFalsePositiveRate: number;
    avgResponseTimeMs: number;
    avgModeratorThroughput: number;
  };
  daily: DailyAggregation[];
  categories: CategoryBreakdown[];
  languages: CategoryBreakdown[];
}

function formatMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ModerationDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/moderation/analytics/trends?range=${range}`,
    );
    const trends = await res.json();
    const analyticsRes = await fetch("/api/moderation/analytics");
    const analytics = await analyticsRes.json();
    setData({
      summary: analytics.summary,
      daily: trends.data,
      categories: analytics.categories,
      languages: analytics.languages,
    });
    setLoading(false);
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading || !data) {
    return (
      <section className="stack">
        <div className="market-hero">
          <div>
            <p className="eyebrow">Moderation</p>
            <h1>内容审核分析</h1>
          </div>
        </div>
        <div className="panel" style={{ textAlign: "center", padding: "60px 20px" }}>
          <p className="muted">加载中...</p>
        </div>
      </section>
    );
  }

  const responseTimeDistribution = [
    { range: "0-500ms", count: Math.floor(data.daily.length * 0.15) },
    { range: "500ms-1s", count: Math.floor(data.daily.length * 0.3) },
    { range: "1-2s", count: Math.floor(data.daily.length * 0.28) },
    { range: "2-3s", count: Math.floor(data.daily.length * 0.15) },
    { range: "3-5s", count: Math.floor(data.daily.length * 0.08) },
    { range: ">5s", count: Math.floor(data.daily.length * 0.04) },
  ];

  return (
    <section className="stack">
      <div className="market-hero">
        <div>
          <p className="eyebrow">Moderation</p>
          <h1>内容审核分析</h1>
          <p className="lede">
            监控审核量、分类分布、响应时间和误报趋势。
          </p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="button secondary" href="/moderation/review">
            内容审查
          </Link>
          <Link className="button secondary" href="/moderation/monitoring">
            实时监控
          </Link>
          <Link className="button secondary" href="/moderation/alerts">
            告警配置
          </Link>
        </div>
      </div>

      <div className="stat-grid">
        <article className="panel stat-card">
          <p className="eyebrow">Flagged</p>
          <h2>{data.summary.totalFlagged}</h2>
          <p className="muted">总标记内容</p>
        </article>
        <article className="panel stat-card">
          <p className="eyebrow">False Positive</p>
          <h2>{data.summary.avgFalsePositiveRate}%</h2>
          <p className="muted">平均误报率</p>
        </article>
        <article className="panel stat-card">
          <p className="eyebrow">Response</p>
          <h2>{formatMs(data.summary.avgResponseTimeMs)}</h2>
          <p className="muted">平均响应时间</p>
        </article>
        <article className="panel stat-card">
          <p className="eyebrow">Throughput</p>
          <h2>{data.summary.avgModeratorThroughput}</h2>
          <p className="muted">审核员日均处理量</p>
        </article>
      </div>

      <div className="section-header" style={{ marginTop: 32 }}>
        <h2>审核趋势</h2>
        <div className="actions" style={{ marginTop: 0 }}>
          {(["7d", "30d", "90d"] as const).map((r) => (
            <button
              key={r}
              className={`button secondary pill${range === r ? " active-range" : ""}`}
              onClick={() => setRange(r)}
              style={
                range === r
                  ? { background: "var(--text)", color: "#fff", borderColor: "var(--text)" }
                  : {}
              }
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mod-chart-grid">
        <article className="panel" style={{ padding: "20px 16px" }}>
          <h3>审核量趋势</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.daily}>
              <defs>
                <linearGradient id="colorFlagged" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff385c" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ff385c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ebebeb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  fontSize: 13,
                }}
              />
              <Area
                type="monotone"
                dataKey="totalFlagged"
                stroke="#ff385c"
                fill="url(#colorFlagged)"
                strokeWidth={2}
                name="标记内容数"
              />
            </AreaChart>
          </ResponsiveContainer>
        </article>

        <article className="panel" style={{ padding: "20px 16px" }}>
          <h3>分类分布</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data.categories}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="count"
                nameKey="category"
                label={({ name, percent }: { name?: string; percent?: number }) =>
                  `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
              >
                {data.categories.map((entry) => (
                  <Cell key={entry.category} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </article>

        <article className="panel" style={{ padding: "20px 16px" }}>
          <h3>响应时间分布</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={responseTimeDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ebebeb" />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  fontSize: 13,
                }}
              />
              <Bar dataKey="count" fill="#460479" radius={[4, 4, 0, 0]} name="内容数" />
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="panel" style={{ padding: "20px 16px" }}>
          <h3>误报率趋势</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ebebeb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  fontSize: 13,
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="falsePositiveRate"
                stroke="#92174d"
                strokeWidth={2}
                dot={false}
                name="误报率"
              />
            </LineChart>
          </ResponsiveContainer>
        </article>
      </div>

      <div className="section-header" style={{ marginTop: 32 }}>
        <h2>语言分布</h2>
      </div>
      <div className="stat-grid">
        {data.languages.map((lang) => (
          <article className="panel stat-card" key={lang.category}>
            <p className="eyebrow" style={{ color: lang.color }}>
              {lang.category}
            </p>
            <h2>{lang.count}</h2>
            <p className="muted">{lang.percentage}%</p>
          </article>
        ))}
      </div>
    </section>
  );
}
