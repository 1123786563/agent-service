"use client";

import React, { useMemo } from "react";
import type { AgentActivityPoint } from "../types";
import { EmptyState } from "./EmptyState";

interface AgentActivityHeatmapProps {
  data: AgentActivityPoint[];
  days?: number;
  loading?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function getColor(count: number, max: number) {
  if (count === 0) return "var(--surface-strong)";
  const ratio = count / max;
  if (ratio > 0.75) return "var(--accent)";
  if (ratio > 0.5) return "var(--accent-active)";
  if (ratio > 0.25) return "var(--accent-weak)";
  return "var(--line-strong)";
}

export function AgentActivityHeatmap({ data, days = 7, loading }: AgentActivityHeatmapProps) {
  const { cells, dates, maxCount } = useMemo(() => {
    const now = new Date();
    const dateList: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dateList.push(d.toISOString().split("T")[0]);
    }

    const map = new Map<string, number>();
    for (const point of data) {
      const key = `${point.date}-${point.hour}`;
      map.set(key, (map.get(key) ?? 0) + point.completedTasks);
    }

    let max = 0;
    const grid: { date: string; hour: number; count: number }[] = [];
    for (const date of dateList) {
      for (const hour of HOURS) {
        const count = map.get(`${date}-${hour}`) ?? 0;
        if (count > max) max = count;
        grid.push({ date, hour, count });
      }
    }

    return { cells: grid, dates: dateList, maxCount: max };
  }, [data, days]);

  if (loading) {
    return <div className="dashboard-chart-placeholder">加载中...</div>;
  }

  if (!data.length) {
    return (
      <EmptyState title="暂无 Agent 活跃度数据" description="AI Agent 完成任务后，热力图将显示活跃时段。" />
    );
  }

  const cellSize = 14;
  const gap = 2;
  const labelWidth = 28;
  const dateLabelHeight = 32;

  return (
    <div className="dashboard-chart-container">
      <h3 className="dashboard-chart-title">AI Agent 活跃度</h3>
      <div className="dashboard-heatmap-scroll">
        <svg
          width={labelWidth + dates.length * (cellSize + gap) + gap}
          height={dateLabelHeight + HOURS.length * (cellSize + gap) + gap}
          role="img"
          aria-label="Agent 活跃度热力图"
        >
          {/* Hour labels (left) */}
          {HOURS.filter((h) => h % 3 === 0).map((h) => (
            <text
              key={h}
              x={labelWidth - 4}
              y={dateLabelHeight + h * (cellSize + gap) + cellSize / 2 + 1}
              textAnchor="end"
              dominantBaseline="middle"
              className="dashboard-heatmap-label"
              fontSize="10"
            >
              {String(h).padStart(2, "0")}
            </text>
          ))}
          {/* Date labels (top) */}
          {dates.map((dateStr, i) => {
            const d = new Date(dateStr + "T00:00:00");
            const label = `${d.getMonth() + 1}/${d.getDate()} ${WEEKDAYS[d.getDay()]}`;
            return (
              <text
                key={dateStr}
                x={labelWidth + gap + i * (cellSize + gap) + cellSize / 2}
                y={dateLabelHeight - 6}
                textAnchor="middle"
                className="dashboard-heatmap-label"
                fontSize="10"
              >
                {label}
              </text>
            );
          })}
          {/* Cells */}
          {cells.map((cell) => {
            const colIdx = dates.indexOf(cell.date);
            const rowIdx = cell.hour;
            return (
              <rect
                key={`${cell.date}-${cell.hour}`}
                x={labelWidth + gap + colIdx * (cellSize + gap)}
                y={dateLabelHeight + rowIdx * (cellSize + gap)}
                width={cellSize}
                height={cellSize}
                rx={3}
                fill={getColor(cell.count, maxCount)}
              >
                <title>
                  {cell.date} {String(cell.hour).padStart(2, "0")}:00 — {cell.count} 个任务
                </title>
              </rect>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
