import { serviceStatusTone, dateOverdue } from "@/lib/customer360/account-status";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, FileCheck, Receipt, Server } from "lucide-react";
import { accountServiceRows, accountTransactions } from "@/lib/customer360/account-overview";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/page";
import { ClientLicensesPanel } from "@/components/license-desk";
import { CustomerPendingPayments } from "@/components/customer-sales-desk";
import { ServiceDetailDialog, type ServiceDetail } from "@/components/customer360-service-detail";

const date = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Not recorded";
const money = (value: number, currency: string) => `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function AccountTransactions({ view }: { view: Record<string, any> }) {
  const rows = accountTransactions(view);
  return <section className="space-y-3" aria-label="Account transactions">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3"><h2 className="font-display text-lg font-semibold flex items-center gap-2"><Receipt className="h-4 w-4 text-success" />All transactions</h2><span className="text-xs text-muted-foreground">{rows.length} recorded</span></div>
    <CustomerPendingPayments customerId={view.customer.id} />
    {!rows.length && <p className="py-4 text-sm text-muted-foreground">No invoices or payments recorded.</p>}
    <div className="divide-y divide-border">{rows.map(row => <article key={row.key} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
      <div className="min-w-0 flex-1"><div className="font-semibold break-words">{row.invoiceId ? <Link to="/invoices/$id" params={{ id: row.invoiceId }} className="text-primary hover:underline">{row.reference}</Link> : row.reference}</div><p className="text-xs text-muted-foreground break-words">{row.kind} · {date(row.date)}{row.description ? ` · ${row.description}` : ""}</p></div>
      <div className="flex flex-wrap items-center gap-3"><span className={`font-mono ${row.kind === "Payment" ? "text-success" : ""}`}>{money(row.amount, row.currency)}</span><StatusPill tone={["paid", "received", "matched"].includes(row.status) ? "success" : row.status === "overdue" ? "danger" : "info"}>{row.status}</StatusPill></div>
      {row.paid !== null && <p className="w-full text-xs text-muted-foreground">Paid {money(row.paid, row.currency)} · Outstanding {money(Math.max(0, row.amount - row.paid), row.currency)}</p>}
    </article>)}</div>
  </section>;
}

export function CustomerAccountOverview({ view }: { view: Record<string, any> }) {
  const rows = accountServiceRows(view);
  const [detail, setDetail] = useState<ServiceDetail | null>(null);
  return <div className="space-y-6" aria-label="Account services and transactions">
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3"><h2 className="font-display text-lg font-semibold flex items-center gap-2"><Server className="h-4 w-4 text-info" />Services & equipment</h2><span className="text-xs text-muted-foreground">{rows.length} records</span></div>
      {!rows.length && <p className="text-sm text-muted-foreground py-4">No services or equipment recorded.</p>}
      <div className="divide-y divide-border">{rows.map(row => <details key={row.key} className="group py-3">
        <summary className="flex cursor-pointer list-none flex-wrap items-start gap-3"><ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" /><div className="min-w-0 flex-1"><p className="font-semibold text-sm break-words">{row.title}</p><p className="text-xs text-muted-foreground break-words">{row.category}{row.identity ? ` · ${row.identity}` : ""}</p><p className={`mt-1 text-xs ${dateOverdue(row.renewal) ? "text-destructive font-semibold" : "text-muted-foreground"}`}>{dateOverdue(row.renewal) ? "Overdue renewal / expiry" : "Renewal / expiry"}: {date(row.renewal)}</p></div><StatusPill tone={serviceStatusTone(row.status)}>{row.status}</StatusPill></summary>
        <div className="ml-7 mt-3 space-y-2 text-sm"><p className="break-words text-muted-foreground">{row.record.description || row.record.notes || row.record.plan || row.identity || "No additional description recorded."}</p><Button size="sm" variant="outline" onClick={() => setDetail({ kind: row.kind, title: row.title, lineLabel: row.category, record: row.record })}><FileCheck className="mr-1.5 h-4 w-4" />Full details</Button></div>
      </details>)}</div>
    </section>
    <ClientLicensesPanel customerId={view.customer.id} embedded />
    <AccountTransactions view={view} />
    <ServiceDetailDialog detail={detail} onClose={() => setDetail(null)} />
  </div>;
}