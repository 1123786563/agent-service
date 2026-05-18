"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { AssigneeWorkload } from "../types";
import { EmptyState } from "./EmptyState";

interface WorkloadBarChartProps {
  data: AssigneeWorkload[];
  loading?: boolean;
}

export function WorkloadBarChart({ data, loading }: WorkloadBarChartProps) {
  if (loading) {
    return <div className="dashboard-chart-placeholder">加载中...</div>;
  }

  if (!data.length) {
    return <EmptyState title="暂无工作量数据" description="分配 issue 后，将显示团队成员工作量分布。" />;
  }

  const chartData = data.map((d) => ({
    name: d.assigneeName.length > 8 ? d.assigneeName.slice(0, 8) + "…" : d.assigneeName,
    type: d.assigneeType,
    未完成: d.taskCount - d.completedCount,
    已完成: d.completedCount,
  }));

  return (
    <div className="dashboard-chart-container">
      <h3 className="dashboard-chart-title">团队工作量分布</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="dashboard-grid-line" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} className="dashboard-axis" />
          <YAxis tick={{ fontSize: 12 }} className="dashboard-axis" />
          <Tooltip
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid var(--line)",
              background: "var(--panel)",
            }}
          />
          <Legend />
          <Bar dataKey="已完成" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
          <Bar dataKey="未完成" stackId="a" fill="var(--accent)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
