export type ConsultationStatusValue =
  | "NEW"
  | "IN_DISCUSSION"
  | "SCOPED"
  | "ORDER_CREATED"
  | "CLOSED";

const CONSULTATION_STATUS_LABELS: Record<ConsultationStatusValue, string> = {
  NEW: "新咨询",
  IN_DISCUSSION: "沟通中",
  SCOPED: "已定范围",
  ORDER_CREATED: "已生成订单",
  CLOSED: "已关闭"
};

export function ConsultationStatusPill({ status }: { status: ConsultationStatusValue }) {
  return <span className="status-pill">{CONSULTATION_STATUS_LABELS[status]}</span>;
}
