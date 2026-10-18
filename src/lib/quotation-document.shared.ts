import logo from "@/assets/imt-solutions-logo.png.asset.json";

export const quotationBrand = {
  name: "IMT Solutions", website: "imtsolutions.co.zw", email: "sales@imtsolutions.co.zw",
  phone: "+263 86 12 004321", logoUrl: `https://management.imtsolutions.co.zw${logo.url}`,
};
export type QuotationDocument = {
  reference: string; title: string; date: string; validUntil: string; currency: string;
  customer: { name: string; address: string; email: string; phone: string; account: string };
  representative: string; notes: string;
  items: { code: string; description: string; quantity: number; price: number; taxRate: number; total: number }[];
  subtotal: number; tax: number; discount: number; total: number;
};
export function quotationDocument(quote: any, lines: any[], representative = "IMT Solutions"): QuotationDocument {
  const customer = quote.customers ?? {};
  const items = (lines.length ? lines : [{ description: quote.title, quantity: 1, unit_price: quote.amount, tax_rate: 0 }]).map((line: any) => ({
    code: line.item_code || "—", description: line.description || "Item", quantity: Number(line.quantity ?? 1),
    price: Number(line.unit_price ?? 0), taxRate: Number(line.tax_rate ?? 0),
    total: Number(line.line_total ?? Number(line.quantity ?? 1) * Number(line.unit_price ?? 0)),
  }));
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const tax = items.reduce((sum, item) => sum + item.total * item.taxRate / 100, 0);
  const total = Number(quote.amount ?? subtotal + tax);
  return {
    reference: quote.quote_number || "Draft", title: quote.title || "Quotation", date: quote.created_at || "",
    validUntil: quote.valid_until || "", currency: quote.currency || "USD", representative,
    customer: { name: customer.company_name || quote.walkin_name || "Customer", address: customer.billing_address || quote.walkin_address || "",
      email: customer.primary_email || quote.walkin_email || "", phone: customer.primary_phone || quote.walkin_phone || "", account: quote.account_number || "WALK-IN" },
    notes: quote.notes || "", items, subtotal, tax, discount: Number((subtotal + tax - total).toFixed(2)), total,
  };
}
export const quotationDate = (value: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { timeZone: "Africa/Harare" });
};
export const quotationMoney = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });