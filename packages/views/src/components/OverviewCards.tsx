"use client";

import React from "react";
import type { DashboardOverview } from "../types";
import { EmptyState } from "./EmptyState";

interface OverviewCardsProps {
  overview: DashboardOverview | null;
  loading?: boolean;
}

const CARDS = [
  { key: "total" as const, label: "总 Issue 数", icon: "📊" },
  { key: "completed" as const, label: "已完成", icon: "✅" },
  { key: "inProgress" as const, label: "进行中", icon: "🔄" },
  { key: "todo" as const, label: "待办", icon: "📋" },
] as const;

export function OverviewCards({ overview, loading }: OverviewCardsProps) {
  if (loading) {
    return (
      <div className="dashboard-overview-grid">
        {CARDS.map((card) => (
          <div key={card.key} className="dashboard-card dashboard-card--skeleton">
            <span className="dashboard-card-icon" aria-hidden="true">{card.icon}</span>
            <span className="dashboard-card-label">{card.label}</span>
            <span className="dashboard-card-value">—</span>
          </div>
        ))}
      </div>
    );
  }

  if (!overview) {
    return <EmptyState title="暂无概览数据" />;
  }

  return (
    <div className="dashboard-overview-grid">
      {CARDS.map((card) => (
        <div key={card.key} className="dashboard-card">
          <span className="dashboard-card-icon" aria-hidden="true">{card.icon}</span>
          <span className="dashboard-card-label">{card.label}</span>
          <strong className="dashboard-card-value">
            {overview[card.key].toLocaleString()}
          </strong>
        </div>
      ))}
    </div>
  );
}
