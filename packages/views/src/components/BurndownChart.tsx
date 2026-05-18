"use client";

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { BurndownPoint } from "../types";
import { EmptyState } from "./EmptyState";

interface BurndownChartProps {
  data: BurndownPoint[];
  loading?: boolean;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function BurndownChart({ data, loading }: BurndownChartProps) {
  if (loading) {
    return <div className="dashboard-chart-placeholder">加载中...</div>;
  }

  if (!data.length) {
    return <EmptyState title="暂无燃尽图数据" description="当 issue 状态变更后，燃尽图将显示趋势。" />;
  }

  return (
    <div className="dashboard-chart-container">
      <h3 className="dashboard-chart-title">燃尽图</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="dashboard-grid-line" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 12 }}
            className="dashboard-axis"
          />
          <YAxis tick={{ fontSize: 12 }} className="dashboard-axis" />
          <Tooltip
            labelFormatter={(label) => formatDate(String(label))}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid var(--line)",
              background: "var(--panel)",
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="remaining"
            stroke="var(--accent)"
            strokeWidth={2}
            name="剩余"
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="completed"
            stroke="#22c55e"
            strokeWidth={2}
            name="已完成"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
