import React from "react";
import type { SettlementLineStatus } from "@prisma/client";

const SETTLEMENT_STATUS_LABELS: Record<SettlementLineStatus, string> = {
  PENDING: "待结算",
  LOCKED: "结算处理中",
  SETTLED: "已结算"
};

export function SettlementStatusPill({ status }: { status: SettlementLineStatus }) {
  return <span className="status-pill">{SETTLEMENT_STATUS_LABELS[status]}</span>;
}
