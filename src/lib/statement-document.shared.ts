export const STATEMENT_MAILBOX = "finance@imtsolutions.co.zw";
export const STATEMENT_DAY = 21;
export function statementWindow(now = new Date()) {
  const date = new Date(now.getTime() + 2 * 3600000).toISOString().slice(0, 10);
  const period = date.slice(0, 7);
  return { period, from: `${period}-01`, to: `${period}-21`, due: date === `${period}-21` };
}
export function statementModel(customer: any, invoices: any[], payments: any[], refunds: any[], from: string, to: string, currency: string) {
  const money = (v: unknown) => Math.round(Number(v || 0) * 100);
  const validInvoices = invoices.filter(i => i.currency === currency && !["void", "cancelled", "draft"].includes(i.status));
  const received = payments.filter(p => p.currency === currency && p.status === "received");
  const all = [
    ...validInvoices.map(i => ({ date: i.issue_date, kind: "Invoice", ref: i.invoice_number, description: `Invoice ${i.invoice_number}`, debit: money(i.total), credit: 0 })),
    ...received.map(p => ({ date: String(p.paid_at).slice(0, 10), kind: "Receipt", ref: p.receipt_number || p.reference || "", description: `Payment received${p.method ? ` / ${p.method}` : ""}`, debit: 0, credit: money(p.amount) })),
    ...refunds.filter(r => r.currency === currency && ["completed", "recorded"].includes(r.status)).map(r => ({ date: String(r.refunded_at).slice(0, 10), kind: "Refund", ref: r.id.slice(0, 8), description: r.reason || "Refund", debit: money(r.amount), credit: 0 })),
  ].filter(l => l.date && l.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
  const opening = all.filter(l => l.date < from).reduce((s, l) => s + l.debit - l.credit, 0);
  let running = opening;
  const lines = all.filter(l => l.date >= from).map(l => { running += l.debit - l.credit; return { ...l, debit: l.debit / 100, credit: l.credit / 100, balance: running / 100 }; });
  const outstanding = validInvoices.filter(i => i.issue_date <= to && money(i.total) > money(i.amount_paid));
  const ageing = [0, 0, 0, 0, 0];
  for (const i of outstanding) {
    const days = Math.floor((Date.parse(to) - Date.parse(i.due_date)) / 86400000);
    ageing[days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4] += (money(i.total) - money(i.amount_paid)) / 100;
  }
  return { customer, from, to, currency, opening: opening / 100, closing: running / 100, lines, totalDebit: lines.reduce((s, l) => s + l.debit, 0), totalCredit: lines.reduce((s, l) => s + l.credit, 0), outstanding, ageing };
}