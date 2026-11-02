/**
 * Splits an account's invoices and payments by package (invoice line item).
 * Payments are allocated to invoices; each invoice's paid amount is shared
 * across its lines in proportion to each line's total.
 */
export type PkgLine = { invoice_id: string; description: string; item_code: string | null; line_total: number | null };
export type PkgInvoice = { id: string; total: number; amount_paid: number; currency: string };
export type PkgAllocation = { invoice_id: string; amount: number; paid_at?: string | null };
export type PackageRow = { key: string; name: string; currency: string; billed: number; paid: number; outstanding: number; invoices: number; lastPaidAt: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function splitByPackage(invoices: PkgInvoice[], lines: PkgLine[], allocations: PkgAllocation[] = [], names: Record<string, string> = {}): PackageRow[] {
  const inv = new Map(invoices.map((i) => [i.id, i]));
  const lineSum = new Map<string, number>();
  for (const l of lines) lineSum.set(l.invoice_id, (lineSum.get(l.invoice_id) ?? 0) + Number(l.line_total ?? 0));
  const lastPaid = new Map<string, string>();
  for (const a of allocations) if (a.paid_at && (!lastPaid.get(a.invoice_id) || a.paid_at > lastPaid.get(a.invoice_id)!)) lastPaid.set(a.invoice_id, a.paid_at);
  const out = new Map<string, PackageRow & { _inv: Set<string> }>();
  for (const l of lines) {
    const i = inv.get(l.invoice_id);
    if (!i) continue;
    const key = `${(l.item_code || l.description).trim().toUpperCase()}|${i.currency}`;
    const name = (l.item_code && names[l.item_code]) || l.description;
    const row = out.get(key) ?? { key, name, currency: i.currency, billed: 0, paid: 0, outstanding: 0, invoices: 0, lastPaidAt: null, _inv: new Set<string>() };
    const total = Number(l.line_total ?? 0);
    const denom = lineSum.get(i.id) || 0;
    const share = denom > 0 ? total / denom : 0;
    const paid = Math.min(Number(i.amount_paid ?? 0), denom) * share;
    row.billed += total; row.paid += paid; row._inv.add(i.id);
    const lp = lastPaid.get(i.id);
    if (lp && (!row.lastPaidAt || lp > row.lastPaidAt)) row.lastPaidAt = lp;
    out.set(key, row);
  }
  return [...out.values()].map(({ _inv, ...r }) => ({ ...r, billed: r2(r.billed), paid: r2(r.paid), outstanding: r2(Math.max(0, r.billed - r.paid)), invoices: _inv.size }))
    .sort((a, b) => b.billed - a.billed);
}
