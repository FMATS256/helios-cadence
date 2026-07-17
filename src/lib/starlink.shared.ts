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