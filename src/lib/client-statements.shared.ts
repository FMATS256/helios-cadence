import { z } from "zod";

export const clientStatementRequest = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict();

/** Every account gets a current statement and its past monthly 21st cutoffs. */
export function clientStatementDates(createdAt: string, now = new Date()) {
  const today = new Date(now.getTime() + 2 * 3600000).toISOString().slice(0, 10);
  const created = createdAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(created) || created > today) return [];
  const rows = [{ date: today, current: true }];
  let month = today.slice(0, 7);
  while (`${month}-21` >= created) {
    const date = `${month}-21`;
    if (date < today) rows.push({ date, current: false });
    const [year, n] = month.split("-").map(Number);
    month = new Date(Date.UTC(year, n - 2, 1)).toISOString().slice(0, 7);
  }
  return rows;
}