"use client";

import React from "react";
import { OverviewCards } from "./OverviewCards";
import { BurndownChart } from "./BurndownChart";
import { WorkloadBarChart } from "./WorkloadBarChart";
import { AgentActivityHeatmap } from "./AgentActivityHeatmap";
import { useDashboard } from "../hooks/useDashboard";
import { useDashboardStore } from "../store/dashboardStore";
import type { DateRange } from "../types";

interface DashboardPageProps {
  wsId: string;
  projectId: string;
}

const RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "7", label: "7 天" },
  { value: "14", label: "14 天" },
  { value: "30", label: "30 天" },
];

export function DashboardPage({ wsId, projectId }: DashboardPageProps) {
  const range = useDashboardStore((s) => s.range);
  const setRange = useDashboardStore((s) => s.setRange);
  const { data, isLoading, error } = useDashboard(wsId, projectId);

  if (error) {
    return (
      <div className="dashboard-error">
        <h3>加载仪表盘失败</h3>
        <p>{error.message}</p>
      </div>
    );
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-header">
        <h1>项目仪表盘</h1>
        <div className="dashboard-range-selector">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`dashboard-range-btn ${range === opt.value ? "active" : ""}`}
              onClick={() => setRange(opt.value)}
              disabled={isLoading}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dashboard-overview-section">
        <OverviewCards overview={data?.overview ?? null} loading={isLoading} />
      </div>

      <div className="dashboard-charts-grid">
        <div className="dashboard-chart-panel">
          <BurndownChart data={data?.burndown ?? []} loading={isLoading} />
        </div>
        <div className="dashboard-chart-panel">
          <WorkloadBarChart data={data?.assigneeWorkload ?? []} loading={isLoading} />
        </div>
      </div>

      <div className="dashboard-chart-panel dashboard-heatmap-panel">
        <AgentActivityHeatmap data={data?.agentActivity ?? []} loading={isLoading} />
      </div>

      {data?.generatedAt && (
        <p className="dashboard-timestamp">
          最后更新：{new Date(data.generatedAt).toLocaleString("zh-CN")}
        </p>
      )}
    </section>
  );
}
