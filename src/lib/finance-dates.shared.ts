/** Business-timezone date helpers. All finance period boundaries use Africa/Harare. */
export const BUSINESS_TZ = "Africa/Harare";

/** YYYY-MM-DD for a date in the business timezone. */
export function businessDay(d: Date | string | number = new Date()): string {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(dt);
}

/** YYYY-MM for a date in the business timezone. */
export const businessMonth = (d: Date | string | number = new Date()) => businessDay(d).slice(0, 7);
export const businessYear = (d: Date | string | number = new Date()) => businessDay(d).slice(0, 4);

/** Page through a Supabase query so results are never silently capped at 1000 rows. */
export async function fetchAllRows<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
  max = 50000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message ?? String(error));
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}
