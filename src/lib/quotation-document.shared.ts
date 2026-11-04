import logo from "@/assets/imt-solutions-logo.png.asset.json";

export const quotationBrand = {
  name: "IMT Solutions", website: "imtsolutions.co.zw", email: "sales@imtsolutions.co.zw",
  phone: "+263 86 12 004321", logoUrl: `https://management.imtsolutions.co.zw${logo.url}`, previewLogoUrl: logo.url,
};
export type QuotationDocument = {
  reference: string; title: string; date: string; validUntil: string; currency: string;
  customer: { name: string; address: string; email: string; phone: string; account: string };
  representative: string; notes: string;
  items: { code: string; description: string; quantity: number; price: number; taxRate: number; total: number }[];
  subtotal: number; tax: number; discount: number; total: number;
};

import { round2 } from "./money.shared";

export { round2 };



/** VAT-exclusive value of one line: quantity x unit price. */
const netOf = (quantity: number, price: number) => round2(quantity * price);

/** VAT charged on one line, rounded to cents the same way the document shows it. */
const vatOf = (net: number, taxRate: number) => round2(net * taxRate / 100);

/**
 * Builds the quotation document from the saved line values.
 *
 * `quote_line_items.line_total` is a generated column that already includes VAT,
 * so totals are derived from quantity, unit price and tax rate instead: the
 * summary then reads subtotal (excl. VAT) + VAT - discount = total.
 */
export function quotationDocument(quote: any, lines: any[], representative = "IMT Solutions"): QuotationDocument {
  const customer = quote.customers ?? {};
  const source = lines.length ? lines : [{ description: quote.title, quantity: 1, unit_price: quote.amount, tax_rate: 0 }];
  const items = source.map((line: any) => {
    const quantity = Number(line.quantity ?? 1);
    const price = Number(line.unit_price ?? 0);
    const taxRate = Number(line.tax_rate ?? 0);
    const net = netOf(quantity, price);
    return {
      code: line.item_code || "—", description: line.description || "Item", quantity,
      price, taxRate, total: round2(net + vatOf(net, taxRate)),
    };
  });
  const subtotal = round2(items.reduce((sum, item) => sum + netOf(item.quantity, item.price), 0));
  const tax = round2(items.reduce((sum, item) => sum + vatOf(netOf(item.quantity, item.price), item.taxRate), 0));
  const saved = Number(quote.amount ?? NaN);
  const discount = Number.isFinite(saved) ? Math.max(0, round2(subtotal + tax - saved)) : 0;
  const total = round2(subtotal + tax - discount);
  return {
    reference: quote.quote_number || "Draft", title: quote.title || "Quotation", date: quote.created_at || "",
    validUntil: quote.valid_until || "", currency: quote.currency || "USD", representative,
    customer: { name: customer.company_name || quote.walkin_name || "Customer", address: customer.billing_address || quote.walkin_address || "",
      email: customer.primary_email || quote.walkin_email || "", phone: customer.primary_phone || quote.walkin_phone || "", account: quote.account_number || "WALK-IN" },
    notes: quote.notes || "", items, subtotal, tax, discount, total,
  };
}
export const quotationDate = (value: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { timeZone: "Africa/Harare" });
};
export const quotationMoney = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
