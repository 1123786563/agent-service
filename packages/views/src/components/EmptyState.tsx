"use client";

import React from "react";

interface EmptyStateProps {
  title?: string;
  description?: string;
}

export function EmptyState({
  title = "暂无数据",
  description = "当有数据可用时，图表将在此处显示。",
}: EmptyStateProps) {
  return (
    <div className="dashboard-empty-state">
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="8"
          y="8"
          width="32"
          height="32"
          rx="8"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.3"
        />
        <path
          d="M16 28l6-6 4 4 6-8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.3"
        />
      </svg>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
