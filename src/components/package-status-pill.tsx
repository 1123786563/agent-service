import React from "react";
import type { AgentPackageStatus } from "@prisma/client";

const STATUS_LABELS: Record<AgentPackageStatus, string> = {
  DRAFT: "草稿",
  VALIDATING: "校验中",
  PUBLISHED: "已发布",
  REJECTED: "已拒绝",
  ARCHIVED: "已归档"
};

export function PackageStatusPill({ status }: { status: AgentPackageStatus }) {
  return <span className="status-pill">{STATUS_LABELS[status]}</span>;
}
