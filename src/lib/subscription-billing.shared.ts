export function subscriptionCycleMonths(cycle: string): number {
  return ({ monthly: 1, quarterly: 3, semiannual: 6, semiannually: 6, half_yearly: 6, annual: 12, annually: 12, yearly: 12 } as Record<string, number>)[cycle.toLowerCase()] ?? 0;
}

export function anchoredSubscriptionDate(anchor: string, months: number): string {
  const date = new Date(`${anchor}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}