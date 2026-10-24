export type InvoiceLineInput = { description: string; item_code?: string; quantity: unknown; unit_price: unknown; tax_rate?: unknown; billing_period_start?: string | null; billing_period_end?: string | null };
export const roundInvoiceMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function validateInvoiceDates(issue: string, due?: string | null) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(issue)) throw new Error("A valid invoice issue date is required");
  if (!due || !valid(due)) throw new Error("A valid invoice due date is required");
  if (due < issue) throw new Error("Due date cannot be before the invoice issue date");
}

export function priceInvoiceItems(items: InvoiceLineInput[], requireSubscriptionDetails = true) {
  const clean = items.filter(i => i.description?.trim());
  if (!clean.length) throw new Error("Add at least one line item");
  const lines = clean.map((i, position) => {
    const description = i.description.trim(), item_code = String(i.item_code ?? "").trim();
    if (!item_code) throw new Error(`Item Code/SKU is required for ${description}`);
    const quantity = Number(i.quantity), unit_price = Number(i.unit_price);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unit_price) || unit_price < 0) throw new Error("Quantity must be positive and unit price must be zero or higher");
    if (Number(i.tax_rate ?? 0) !== 0) throw new Error("IMT invoices do not charge VAT; review tax with Finance before saving");
    const start = i.billing_period_start || null, end = i.billing_period_end || null;
    if (start || end) validateInvoiceDates(start ?? "", end);
    const microsoftSubscription = /(?:Microsoft\s*365|M365)/i.test(description) && !/setup|migration|training|configuration|administration|backup|support/i.test(description);
    if (requireSubscriptionDetails && microsoftSubscription) {
      if (!/Business\s+(Basic|Standard|Premium)|(?:Office|Microsoft)\s*365\s*(?:E[135]|F[13])|Exchange\s+Online|Apps\s+for\s+(business|enterprise)/i.test(description)) throw new Error("Choose the exact Microsoft 365 subscription product");
      if (!start || !end) throw new Error("Microsoft 365 subscriptions require billing period start and end dates");
    }
    return { description, item_code, quantity, unit_price, tax_rate: 0, billing_period_start: start, billing_period_end: end, line_total: roundInvoiceMoney(quantity * unit_price), position };
  });
  const subtotal = roundInvoiceMoney(lines.reduce((sum, l) => sum + l.line_total, 0));
  return { lines, subtotal, tax: 0, total: subtotal };
}

export function invoiceLineDescription(line: { description: string; billing_period_start?: string | null; billing_period_end?: string | null }) {
  const format = (date: string) => date.slice(0, 10).split("-").reverse().join("/");
  return line.billing_period_start && line.billing_period_end
    ? `${line.description} | ${format(line.billing_period_start)} - ${format(line.billing_period_end)}`
    : line.description;
}