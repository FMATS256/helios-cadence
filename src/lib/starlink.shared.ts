export const STARLINK_PLANS = {
  residential: { label: "Residential", monthlyPrice: 89 },
  business: { label: "Business", monthlyPrice: 187 },
} as const;

export const STARLINK_EXTERNAL_PAYOUT_USD = 77;

export type StarlinkPlanType = keyof typeof STARLINK_PLANS;

export function normalizeStarlinkPlan(planType?: string): StarlinkPlanType {
  return planType === "business" ? "business" : "residential";
}

export function starlinkPlanPrice(planType?: string) {
  return STARLINK_PLANS[normalizeStarlinkPlan(planType)].monthlyPrice;
}
// Block 6 — recharge workflow status machine (client-safe constants).
export const RECHARGE_STATUSES = [
  "pending_finance",
  "paid",
  "message_sent",
  "awaiting_supplier",
  "completed",
  "failed",
  "cancelled",
] as const;
export type RechargeStatus = (typeof RECHARGE_STATUSES)[number];

export const RECHARGE_STATUS_LABELS: Record<RechargeStatus, string> = {
  pending_finance: "Pending finance",
  paid: "Paid",
  message_sent: "Message sent",
  awaiting_supplier: "Awaiting supplier",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const RECHARGE_STATUS_TONE: Record<RechargeStatus, "success" | "danger" | "warning" | "info" | "neutral"> = {
  pending_finance: "warning",
  paid: "info",
  message_sent: "info",
  awaiting_supplier: "warning",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
};

export const ALLOWED_TRANSITIONS: Record<RechargeStatus, RechargeStatus[]> = {
  pending_finance: ["paid", "cancelled", "failed"],
  paid: ["message_sent", "cancelled", "failed"],
  message_sent: ["awaiting_supplier", "completed", "failed", "cancelled"],
  awaiting_supplier: ["completed", "failed", "cancelled"],
  completed: [],
  failed: ["message_sent", "cancelled"],
  cancelled: [],
};
