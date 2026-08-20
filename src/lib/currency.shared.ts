/** Multi-currency helpers shared by client and server. Rates are units of currency per 1 USD. */

export type RateRow = { currency: string; rate: number | string; effective_date: string };

export function latestRateMap(rows: RateRow[] | any[]): Record<string, number> {
  const seen: Record<string, { rate: number; date: string }> = {};
  for (const r of rows || []) {
    const cur = String(r.currency || "").toUpperCase();
    if (!cur) continue;
    const date = String(r.effective_date ?? "");
    if (!seen[cur] || date > seen[cur]!.date) seen[cur] = { rate: Number(r.rate) || 1, date };
  }
  const out: Record<string, number> = { USD: 1 };
  for (const [k, v] of Object.entries(seen)) out[k] = v.rate;
  return out;
}

/** Convert an amount in `currency` to the USD base. */
export function toBase(amount: number | string | null | undefined, currency: string | null | undefined, rates: Record<string, number>): number {
  const r = rates[String(currency || "USD").toUpperCase()] ?? 1;
  const n = Number(amount || 0);
  return r > 0 ? n / r : n;
}

/** Convert a USD base amount into `currency`. */
export function fromBase(base: number, currency: string, rates: Record<string, number>): number {
  return Number(base || 0) * (rates[String(currency || "USD").toUpperCase()] ?? 1);
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", ZWG: "ZWG ", ZAR: "R", GBP: "£", EUR: "€", BWP: "P", ZMW: "K",
};

export function fmtCurrency(amount: number | string | null | undefined, currency = "USD"): string {
  const code = String(currency || "USD").toUpperCase();
  const sym = CURRENCY_SYMBOLS[code] ?? `${code} `;
  return `${sym}${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
