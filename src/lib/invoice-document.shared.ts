import { invoiceLineDescription } from "./invoice-validation.shared";
/** Only received, accounting-recorded allocations count; proof/gateway success is not approval. */
export function invoiceSettlement(invoice: { total: unknown; status?: string }, allocations: Array<{ amount: unknown; payments?: { status?: string } | null }>) {
  const total = Math.round(Number(invoice.total) * 100) / 100;
  const paid = Math.round(allocations.filter(a => !('payments' in a) || a.payments?.status === 'received').reduce((sum, a) => sum + Number(a.amount), 0) * 100) / 100;
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
  const settled = total > 0 && balance === 0 && !["draft", "void", "cancelled"].includes(invoice.status ?? "");
  return { paid, balance, settled, kind: settled ? "sales_invoice" : "invoice" } as const;
}

/** IMT's registered address as it must appear on every invoice. */
export const IMT_ADDRESS = "2 Margaret Close Hatfield Zimbabwe";

/** Small terms block printed above the bank details. */
export const INVOICE_TERMS = [
  "Payment is due by the due date shown on this invoice.",
  "Please quote the invoice number as your payment reference.",
  "Services remain the property of IMT Solutions until paid in full.",
];

/** "Farai Matare" -> "FM" — used for the Sales Code box. */
export function initialsOf(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .slice(0, 4);
}

export function invoiceStudioPayload(invoice: any, lines: any[], customer: any, representative = "IMT Solutions") {
  const date = (value: string) => value ? value.slice(0, 10).split("-").reverse().join("/") : "";
  const salesCode = initialsOf(representative);
  return {
    type: "invoice" as const, docType: "invoice" as const,
    docNo: invoice.invoice_number, reference: invoice.invoice_number,
    date: date(invoice.issue_date), expiry: date(invoice.due_date),
    currency: invoice.currency || "USD", account: customer?.account_number || invoice.account_number || "",
    customerName: customer?.company_name || "", customerAddress: customer?.billing_address || "",
    customerEmail: customer?.primary_email || "", customerAccount: customer?.account_number || invoice.account_number || "",
    salesRep: representative, sales_rep: representative,
    salesCode, sales_code: salesCode,
    items: lines.length ? lines.map((line) => ({
      code: line.item_code || "", description: invoiceLineDescription(line), name: invoiceLineDescription(line),
      qty: Number(line.quantity), quantity: Number(line.quantity), price: Number(line.unit_price), unitPrice: Number(line.unit_price), vat: 0,
    })) : [{ code: "", name: invoice.description || "Services", description: invoice.description || "Services", qty: 1, quantity: 1, price: Number(invoice.total), unitPrice: Number(invoice.total), vat: 0 }],
  };
}
