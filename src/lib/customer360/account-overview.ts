import { invoiceOverdue } from "./account-status";
type RecordRow = Record<string, any>;
export type AccountServiceRow = { key: string; category: string; title: string; status: string; renewal: string | null; identity: string; record: RecordRow; kind: "Subscription" | "Service" | "Package" | "Asset" };

/** Presentation only: retain every account record, including unclassified services. */
export function accountServiceRows(view: Record<string, any>): AccountServiceRow[] {
  const collections = [
    ["services", "Managed service", "Service"], ["subscriptions", "Subscription", "Subscription"],
    ["packages", "Package", "Package"], ["cloudServers", "Cloud & VPS", "Service"],
    ["webHosting", "Web hosting & domain", "Service"], ["starlink", "Starlink", "Service"],
    ["voip", "VoIP", "Service"], ["cloudStorage", "Cloud storage", "Service"],
    ["managedNas", "Managed NAS", "Service"], ["licenses", "Software licence", "Service"],
    ["assets", "Equipment", "Asset"],
  ] as const;
  return collections.flatMap(([key, category, kind]) => (view[key] ?? []).map((r: RecordRow) => ({
    key: `${key}-${r.id}`, category, kind, record: r,
    title: r.service_name || r.plan_name || r.catalog?.name || r.hostname || r.domain || r.product || r.name || r.kit_serial || r.did_number || category,
    status: r.status || "Recorded",
    renewal: r.next_renewal || r.renewal_date || r.expiry_date || r.expires_at || r.next_billing_date || null,
    identity: [r.vendor || r.provider, r.plan || r.plan_type, r.kit_serial || r.serial_number || r.public_ip || r.sip_username, r.seats != null ? `${r.seats} seats` : null].filter(Boolean).join(" · "),
  })));
}

export function accountTransactions(view: Record<string, any>) {
  return [
    ...(view.invoices ?? []).map((i: RecordRow) => ({ key: `invoice-${i.id}`, invoiceId: i.id as string, kind: "Invoice", date: i.issue_date || i.created_at, reference: i.invoice_number, description: i.notes || "", amount: Number(i.total || 0), currency: i.currency || "USD", status: invoiceOverdue(i) ? "overdue" : i.status || "Recorded", paid: Number(i.amount_paid || 0) })),
    ...(view.payments ?? []).map((p: RecordRow) => ({ key: `payment-${p.id}`, invoiceId: null, kind: "Payment", date: p.paid_at || p.created_at, reference: p.receipt_number || p.reference || "Payment", description: [p.method?.replace(/_/g, " "), p.service_context, p.reference].filter(Boolean).join(" · "), amount: Number(p.amount || 0), currency: p.currency || "USD", status: p.status || p.reconciliation_status || "Recorded", paid: null })),
  ].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}