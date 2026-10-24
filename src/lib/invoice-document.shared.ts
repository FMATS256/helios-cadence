/** Only posted allocations count as payment; proof and gateway success are not approval. */
export function invoiceSettlement(invoice: { total: unknown; status?: string }, allocations: Array<{ amount: unknown }>) {
  const total = Math.round(Number(invoice.total) * 100) / 100;
  const paid = Math.round(allocations.reduce((sum, a) => sum + Number(a.amount), 0) * 100) / 100;
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
  const settled = total > 0 && balance === 0 && !["draft", "void", "cancelled"].includes(invoice.status ?? "");
  return { paid, balance, settled, kind: settled ? "sales_invoice" : "invoice" } as const;
}

export function invoiceStudioPayload(invoice: any, lines: any[], customer: any, representative = "IMT Solutions") {
  const date = (value: string) => value ? value.slice(0, 10).split("-").reverse().join("/") : "";
  return {
    type: "invoice" as const, docType: "invoice" as const,
    docNo: invoice.invoice_number, reference: invoice.invoice_number,
    date: date(invoice.issue_date), expiry: date(invoice.due_date),
    currency: invoice.currency || "USD", account: customer?.account_number || invoice.account_number || "",
    customerName: customer?.company_name || "", customerAddress: customer?.billing_address || "",
    customerEmail: customer?.primary_email || "", customerAccount: customer?.account_number || invoice.account_number || "",
    salesRep: representative, sales_rep: representative,
    items: lines.length ? lines.map((line) => ({
      code: line.item_code || "", description: line.description, name: line.description,
      qty: Number(line.quantity), quantity: Number(line.quantity), price: Number(line.unit_price), unitPrice: Number(line.unit_price), vat: Number(line.tax_rate || 0),
    })) : [{ code: "", name: invoice.description || "Services", description: invoice.description || "Services", qty: 1, quantity: 1, price: Number(invoice.total), unitPrice: Number(invoice.total), vat: 0 }],
  };
}