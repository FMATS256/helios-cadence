/**
 * Reporting engine (Block 9)
 * ==========================
 * Server-only report builders. Every report is computed from live tables —
 * no snapshots, no seeded numbers. Each builder returns a uniform shape so the
 * UI can render, export (CSV) and print any report with the same components.
 */

export type ReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  format?: "money" | "number" | "percent" | "date" | "text";
};

export type ReportChip = { label: string; value: string; color: string };

export type ReportResult = {
  key: string;
  title: string;
  description: string;
  from: string;
  to: string;
  generated_at: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  chips: ReportChip[];
  totals?: Record<string, any> | null;
};

export const REPORTS = [
  { key: "revenue", title: "Revenue collected", description: "Payments received per month, by method and customer count." },
  { key: "ar_ageing", title: "Receivables ageing", description: "Outstanding invoices per customer bucketed by days past due." },
  { key: "mrr", title: "Monthly recurring revenue", description: "Active recurring services normalised to a monthly figure, per customer." },
  { key: "renewals", title: "Renewal pipeline", description: "Subscriptions and cloud services renewing inside the window." },
  { key: "churn", title: "Churn & retention", description: "Services cancelled or suspended in the window versus the active base." },
  { key: "tickets", title: "Support & SLA", description: "Ticket volume, resolution time and SLA breaches by priority." },
  { key: "service_health", title: "Service health", description: "Monitoring checks, incidents and infrastructure status." },
] as const;

export type ReportKey = (typeof REPORTS)[number]["key"];

const N = (v: any) => Number(v || 0);
const money = (n: number, c = "USD") => `${c} ${n.toFixed(2)}`;
const monthKey = (d: any) => (d ? String(d).slice(0, 7) : "unknown");

/** Normalise any billing cycle to a monthly amount. */
function monthly(amount: any, cycle?: string | null) {
  const a = N(amount);
  const c = String(cycle || "monthly").toLowerCase();
  if (c === "yearly" || c === "annual") return a / 12;
  if (c === "quarterly") return a / 3;
  if (c === "weekly") return a * 4.345;
  if (c === "daily") return a * 30;
  if (c === "one_time" || c === "once") return 0;
  return a;
}

function ageBucket(due?: string | null) {
  if (!due) return "current";
  const days = Math.floor((Date.now() - new Date(due).getTime()) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90_plus";
}

async function customerMap(db: any) {
  const { data } = await db.from("customers").select("id,account_number,company_name,status,primary_email");
  const byId = new Map<string, any>();
  const byAcct = new Map<string, any>();
  for (const c of (data ?? []) as any[]) {
    byId.set(c.id, c);
    if (c.account_number) byAcct.set(c.account_number, c);
  }
  return { byId, byAcct, list: (data ?? []) as any[] };
}

/* ------------------------------------------------------------------ *
 * Builders
 * ------------------------------------------------------------------ */

async function revenueReport(db: any, from: string, to: string): Promise<Partial<ReportResult>> {
  const { data: pays } = await db
    .from("payments")
    .select("id,amount,currency,method,paid_at,customer_id,account_number,status")
    .gte("paid_at", from)
    .lte("paid_at", `${to}T23:59:59`);
  const rows = new Map<string, any>();
  let total = 0;
  const customers = new Set<string>();
  for (const p of (pays ?? []) as any[]) {
    if (String(p.status ?? "").toLowerCase() === "failed" || String(p.status ?? "").toLowerCase() === "void") continue;
    const k = monthKey(p.paid_at);
    const r = rows.get(k) ?? { month: k, amount: 0, count: 0, customers: new Set<string>(), methods: new Set<string>() };
    r.amount += N(p.amount);
    r.count += 1;
    if (p.customer_id) r.customers.add(p.customer_id);
    if (p.method) r.methods.add(p.method);
    rows.set(k, r);
    total += N(p.amount);
    if (p.customer_id) customers.add(p.customer_id);
  }
  const out = Array.from(rows.values())
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .map((r) => ({
      month: r.month,
      amount: Number(r.amount.toFixed(2)),
      count: r.count,
      customers: r.customers.size,
      methods: Array.from(r.methods).join(", ") || "—",
      average: Number((r.amount / Math.max(1, r.count)).toFixed(2)),
    }));
  return {
    columns: [
      { key: "month", label: "Month" },
      { key: "amount", label: "Collected", align: "right", format: "money" },
      { key: "count", label: "Payments", align: "right", format: "number" },
      { key: "customers", label: "Customers", align: "right", format: "number" },
      { key: "average", label: "Avg payment", align: "right", format: "money" },
      { key: "methods", label: "Methods" },
    ],
    rows: out,
    chips: [
      { label: "Collected", value: money(total), color: "#0f766e" },
      { label: "Payments", value: String((pays ?? []).length), color: "#1d4ed8" },
      { label: "Paying customers", value: String(customers.size), color: "#7c3aed" },
      { label: "Months", value: String(out.length), color: "#334155" },
    ],
    totals: { amount: Number(total.toFixed(2)) },
  };
}

async function ageingReport(db: any): Promise<Partial<ReportResult>> {
  const { byId } = await customerMap(db);
  const { data: invs } = await db
    .from("invoices")
    .select("id,invoice_number,customer_id,account_number,status,total,currency,due_date")
    .is("archived_at", null)
    .not("status", "in", "(paid,void,cancelled)");
  const { data: allocs } = await db.from("payment_allocations").select("invoice_id,amount");
  const paidBy = new Map<string, number>();
  for (const a of (allocs ?? []) as any[]) paidBy.set(a.invoice_id, (paidBy.get(a.invoice_id) ?? 0) + N(a.amount));

  const acc = new Map<string, any>();
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  for (const i of (invs ?? []) as any[]) {
    const outstanding = N(i.total) - (paidBy.get(i.id) ?? 0);
    if (outstanding <= 0.009) continue;
    const key = i.customer_id ?? i.account_number ?? "unassigned";
    const c = i.customer_id ? byId.get(i.customer_id) : null;
    const row = acc.get(key) ?? {
      customer: c?.company_name ?? i.account_number ?? "Unassigned",
      account_number: i.account_number ?? "—",
      current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0, invoices: 0,
      oldest_due: i.due_date ?? null,
    };
    const b = ageBucket(i.due_date) as keyof typeof buckets;
    row[b] += outstanding;
    row.total += outstanding;
    row.invoices += 1;
    if (i.due_date && (!row.oldest_due || i.due_date < row.oldest_due)) row.oldest_due = i.due_date;
    acc.set(key, row);
    buckets[b] += outstanding;
  }
  const rows = Array.from(acc.values())
    .map((r) => ({
      ...r,
      current: Number(r.current.toFixed(2)),
      d1_30: Number(r.d1_30.toFixed(2)),
      d31_60: Number(r.d31_60.toFixed(2)),
      d61_90: Number(r.d61_90.toFixed(2)),
      d90_plus: Number(r.d90_plus.toFixed(2)),
      total: Number(r.total.toFixed(2)),
    }))
    .sort((a, b) => b.total - a.total);
  const grand = Object.values(buckets).reduce((s, v) => s + v, 0);
  return {
    columns: [
      { key: "customer", label: "Customer" },
      { key: "account_number", label: "Account" },
      { key: "invoices", label: "Invoices", align: "right", format: "number" },
      { key: "current", label: "Current", align: "right", format: "money" },
      { key: "d1_30", label: "1–30", align: "right", format: "money" },
      { key: "d31_60", label: "31–60", align: "right", format: "money" },
      { key: "d61_90", label: "61–90", align: "right", format: "money" },
      { key: "d90_plus", label: "90+", align: "right", format: "money" },
      { key: "total", label: "Outstanding", align: "right", format: "money" },
      { key: "oldest_due", label: "Oldest due", format: "date" },
    ],
    rows,
    chips: [
      { label: "Outstanding", value: money(grand), color: "#b91c1c" },
      { label: "Current", value: money(buckets.current), color: "#0f766e" },
      { label: "1–30 days", value: money(buckets.d1_30), color: "#b45309" },
      { label: "31–90 days", value: money(buckets.d31_60 + buckets.d61_90), color: "#c2410c" },
      { label: "90+ days", value: money(buckets.d90_plus), color: "#7f1d1d" },
      { label: "Accounts", value: String(rows.length), color: "#334155" },
    ],
    totals: { outstanding: Number(grand.toFixed(2)), ...buckets },
  };
}

async function mrrReport(db: any): Promise<Partial<ReportResult>> {
  const { byId, byAcct } = await customerMap(db);
  const [subs, cloud, hosting, storage, nas, starlink, voip] = await Promise.all([
    db.from("subscriptions").select("customer_id,account_number,plan_name,amount,billing_cycle,status,next_renewal").eq("status", "active"),
    db.from("cloud_services").select("customer_id,account_number,service_name,monthly_cost,status,renewal_date").is("archived_at", null).eq("status", "active"),
    db.from("web_hosting_accounts").select("customer_id,account_number,monthly_price,status").eq("status", "active"),
    db.from("cloud_storage_accounts").select("customer_id,account_number,monthly_price,status").eq("status", "active"),
    db.from("managed_nas_accounts").select("customer_id,account_number,monthly_price,status").eq("status", "active"),
    db.from("starlink_accounts").select("customer_id,account_number,monthly_price,status").eq("status", "active"),
    db.from("voip_accounts").select("customer_id,account_number,monthly_cost,status").eq("status", "active"),
  ]);

  const acc = new Map<string, any>();
  const add = (row: any, amount: number, line: string, renewal?: string | null) => {
    if (!(amount > 0)) return;
    const c = row.customer_id ? byId.get(row.customer_id) : byAcct.get(row.account_number);
    const key = row.customer_id ?? row.account_number ?? "unassigned";
    const r = acc.get(key) ?? {
      customer: c?.company_name ?? row.account_number ?? "Unassigned",
      account_number: row.account_number ?? c?.account_number ?? "—",
      status: c?.status ?? "—",
      services: 0, mrr: 0, lines: new Set<string>(), next_renewal: null as string | null,
    };
    r.services += 1;
    r.mrr += amount;
    r.lines.add(line);
    if (renewal && (!r.next_renewal || renewal < r.next_renewal)) r.next_renewal = renewal;
    acc.set(key, r);
  };

  for (const s of (subs.data ?? []) as any[]) add(s, monthly(s.amount, s.billing_cycle), "Subscription", s.next_renewal);
  for (const s of (cloud.data ?? []) as any[]) add(s, N(s.monthly_cost), "Cloud", s.renewal_date);
  for (const s of (hosting.data ?? []) as any[]) add(s, N(s.monthly_price), "Hosting");
  for (const s of (storage.data ?? []) as any[]) add(s, N(s.monthly_price), "Storage");
  for (const s of (nas.data ?? []) as any[]) add(s, N(s.monthly_price), "NAS");
  for (const s of (starlink.data ?? []) as any[]) add(s, N(s.monthly_price), "Starlink");
  for (const s of (voip.data ?? []) as any[]) add(s, N(s.monthly_cost), "VoIP");

  const rows = Array.from(acc.values())
    .map((r) => ({
      customer: r.customer,
      account_number: r.account_number,
      status: r.status,
      services: r.services,
      lines: Array.from(r.lines).join(", "),
      mrr: Number(r.mrr.toFixed(2)),
      arr: Number((r.mrr * 12).toFixed(2)),
      next_renewal: r.next_renewal,
    }))
    .sort((a, b) => b.mrr - a.mrr);
  const total = rows.reduce((s, r) => s + r.mrr, 0);
  return {
    columns: [
      { key: "customer", label: "Customer" },
      { key: "account_number", label: "Account" },
      { key: "services", label: "Services", align: "right", format: "number" },
      { key: "lines", label: "Service lines" },
      { key: "mrr", label: "MRR", align: "right", format: "money" },
      { key: "arr", label: "ARR", align: "right", format: "money" },
      { key: "next_renewal", label: "Next renewal", format: "date" },
    ],
    rows,
    chips: [
      { label: "Total MRR", value: money(total), color: "#0f766e" },
      { label: "Total ARR", value: money(total * 12), color: "#1d4ed8" },
      { label: "Billing accounts", value: String(rows.length), color: "#7c3aed" },
      { label: "Avg MRR", value: money(total / Math.max(1, rows.length)), color: "#334155" },
    ],
    totals: { mrr: Number(total.toFixed(2)), arr: Number((total * 12).toFixed(2)) },
  };
}

async function renewalsReport(db: any, from: string, to: string): Promise<Partial<ReportResult>> {
  const { byId, byAcct } = await customerMap(db);
  const [subs, cloud] = await Promise.all([
    db.from("subscriptions").select("id,customer_id,account_number,plan_name,amount,currency,billing_cycle,status,next_renewal,auto_renew")
      .not("next_renewal", "is", null).gte("next_renewal", from).lte("next_renewal", to),
    db.from("cloud_services").select("id,customer_id,account_number,service_name,monthly_cost,status,renewal_date")
      .is("archived_at", null).not("renewal_date", "is", null).gte("renewal_date", from).lte("renewal_date", to),
  ]);
  const name = (r: any) => (r.customer_id ? byId.get(r.customer_id) : byAcct.get(r.account_number))?.company_name ?? r.account_number ?? "Unassigned";
  const rows = [
    ...((subs.data ?? []) as any[]).map((s) => ({
      customer: name(s), account_number: s.account_number ?? "—", service: s.plan_name, type: "Subscription",
      status: s.status, amount: Number(monthly(s.amount, s.billing_cycle).toFixed(2)),
      cycle: s.billing_cycle ?? "monthly", renewal: s.next_renewal, auto_renew: s.auto_renew ? "Yes" : "No",
    })),
    ...((cloud.data ?? []) as any[]).map((c) => ({
      customer: name(c), account_number: c.account_number ?? "—", service: c.service_name, type: "Cloud service",
      status: c.status, amount: Number(N(c.monthly_cost).toFixed(2)), cycle: "monthly",
      renewal: c.renewal_date, auto_renew: "Yes",
    })),
  ].sort((a, b) => String(a.renewal).localeCompare(String(b.renewal)));
  const value = rows.reduce((s, r) => s + r.amount, 0);
  const soon = rows.filter((r) => new Date(r.renewal).getTime() - Date.now() < 7 * 86_400_000).length;
  return {
    columns: [
      { key: "renewal", label: "Renews", format: "date" },
      { key: "customer", label: "Customer" },
      { key: "account_number", label: "Account" },
      { key: "service", label: "Service" },
      { key: "type", label: "Type" },
      { key: "status", label: "Status" },
      { key: "cycle", label: "Cycle" },
      { key: "amount", label: "Monthly value", align: "right", format: "money" },
      { key: "auto_renew", label: "Auto-renew" },
    ],
    rows,
    chips: [
      { label: "Renewals", value: String(rows.length), color: "#1d4ed8" },
      { label: "Within 7 days", value: String(soon), color: "#b45309" },
      { label: "Monthly value", value: money(value), color: "#0f766e" },
    ],
    totals: { count: rows.length, monthly_value: Number(value.toFixed(2)) },
  };
}

async function churnReport(db: any, from: string, to: string): Promise<Partial<ReportResult>> {
  const [subs, cloud] = await Promise.all([
    db.from("subscriptions").select("id,account_number,plan_name,amount,billing_cycle,status,updated_at,created_at"),
    db.from("cloud_services").select("id,account_number,service_name,monthly_cost,status,updated_at,created_at,archived_at"),
  ]);
  const all = [
    ...((subs.data ?? []) as any[]).map((s) => ({
      label: s.plan_name, account_number: s.account_number, status: s.status,
      value: monthly(s.amount, s.billing_cycle), created_at: s.created_at, changed_at: s.updated_at,
    })),
    ...((cloud.data ?? []) as any[]).map((c) => ({
      label: c.service_name, account_number: c.account_number, status: c.archived_at ? "cancelled" : c.status,
      value: N(c.monthly_cost), created_at: c.created_at, changed_at: c.archived_at ?? c.updated_at,
    })),
  ];
  const inWindow = (d: any) => d && String(d).slice(0, 10) >= from && String(d).slice(0, 10) <= to;
  const months = new Map<string, any>();
  let lost = 0, gained = 0, lostValue = 0, gainedValue = 0;
  for (const s of all) {
    const churned = ["cancelled", "terminated", "suspended"].includes(String(s.status).toLowerCase());
    if (churned && inWindow(s.changed_at)) {
      const k = monthKey(s.changed_at);
      const m = months.get(k) ?? { month: k, new_services: 0, churned_services: 0, new_value: 0, churned_value: 0 };
      m.churned_services += 1; m.churned_value += s.value; months.set(k, m);
      lost += 1; lostValue += s.value;
    }
    if (inWindow(s.created_at)) {
      const k = monthKey(s.created_at);
      const m = months.get(k) ?? { month: k, new_services: 0, churned_services: 0, new_value: 0, churned_value: 0 };
      m.new_services += 1; m.new_value += s.value; months.set(k, m);
      gained += 1; gainedValue += s.value;
    }
  }
  const activeBase = all.filter((s) => String(s.status).toLowerCase() === "active").length;
  const rows = Array.from(months.values())
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .map((m) => ({
      month: m.month,
      new_services: m.new_services,
      churned_services: m.churned_services,
      net: m.new_services - m.churned_services,
      new_value: Number(m.new_value.toFixed(2)),
      churned_value: Number(m.churned_value.toFixed(2)),
      net_value: Number((m.new_value - m.churned_value).toFixed(2)),
    }));
  const rate = activeBase + lost > 0 ? (lost / (activeBase + lost)) * 100 : 0;
  return {
    columns: [
      { key: "month", label: "Month" },
      { key: "new_services", label: "New", align: "right", format: "number" },
      { key: "churned_services", label: "Churned", align: "right", format: "number" },
      { key: "net", label: "Net", align: "right", format: "number" },
      { key: "new_value", label: "New MRR", align: "right", format: "money" },
      { key: "churned_value", label: "Lost MRR", align: "right", format: "money" },
      { key: "net_value", label: "Net MRR", align: "right", format: "money" },
    ],
    rows,
    chips: [
      { label: "Active base", value: String(activeBase), color: "#0f766e" },
      { label: "New services", value: String(gained), color: "#1d4ed8" },
      { label: "Churned", value: String(lost), color: "#b91c1c" },
      { label: "Churn rate", value: `${rate.toFixed(1)}%`, color: "#7f1d1d" },
      { label: "Net MRR", value: money(gainedValue - lostValue), color: "#334155" },
    ],
    totals: { churn_rate: Number(rate.toFixed(2)), net_mrr: Number((gainedValue - lostValue).toFixed(2)) },
  };
}

async function ticketsReport(db: any, from: string, to: string): Promise<Partial<ReportResult>> {
  const { data } = await db
    .from("tickets")
    .select("id,priority,status,created_at,resolved_at,sla_due_at,assigned_team")
    .is("archived_at", null)
    .gte("created_at", from)
    .lte("created_at", `${to}T23:59:59`);
  const rows = new Map<string, any>();
  let open = 0, breached = 0, resolved = 0, totalHours = 0;
  for (const t of (data ?? []) as any[]) {
    const p = String(t.priority ?? "normal");
    const r = rows.get(p) ?? { priority: p, total: 0, resolved: 0, open: 0, breached: 0, hours: 0 };
    r.total += 1;
    const isResolved = ["resolved", "closed"].includes(String(t.status).toLowerCase());
    if (isResolved) {
      r.resolved += 1; resolved += 1;
      if (t.resolved_at) {
        const h = (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 3_600_000;
        r.hours += h; totalHours += h;
      }
    } else {
      r.open += 1; open += 1;
    }
    const dueMiss = t.sla_due_at && new Date(t.sla_due_at).getTime() < new Date(t.resolved_at ?? Date.now()).getTime();
    if (dueMiss) { r.breached += 1; breached += 1; }
    rows.set(p, r);
  }
  const out = Array.from(rows.values()).map((r) => ({
    priority: r.priority,
    total: r.total,
    resolved: r.resolved,
    open: r.open,
    breached: r.breached,
    avg_hours: Number((r.hours / Math.max(1, r.resolved)).toFixed(1)),
    sla_compliance: Number((((r.total - r.breached) / Math.max(1, r.total)) * 100).toFixed(1)),
  }));
  const total = (data ?? []).length;
  return {
    columns: [
      { key: "priority", label: "Priority" },
      { key: "total", label: "Tickets", align: "right", format: "number" },
      { key: "resolved", label: "Resolved", align: "right", format: "number" },
      { key: "open", label: "Open", align: "right", format: "number" },
      { key: "breached", label: "SLA breaches", align: "right", format: "number" },
      { key: "avg_hours", label: "Avg resolution (h)", align: "right", format: "number" },
      { key: "sla_compliance", label: "SLA %", align: "right", format: "percent" },
    ],
    rows: out,
    chips: [
      { label: "Tickets", value: String(total), color: "#1d4ed8" },
      { label: "Resolved", value: String(resolved), color: "#0f766e" },
      { label: "Open", value: String(open), color: "#b45309" },
      { label: "SLA breaches", value: String(breached), color: "#b91c1c" },
      { label: "Avg resolution", value: `${(totalHours / Math.max(1, resolved)).toFixed(1)} h`, color: "#334155" },
    ],
    totals: { total, resolved, open, breached },
  };
}

async function serviceHealthReport(db: any): Promise<Partial<ReportResult>> {
  const [checks, incidents, servers, hosting] = await Promise.all([
    db.from("monitoring_checks").select("id,name,status,enabled,target,account_number,last_checked_at").is("archived_at", null),
    db.from("monitoring_incidents").select("id,check_id,started_at,resolved_at"),
    db.from("cloud_servers").select("id,name,status,provider,account_number"),
    db.from("web_hosting_accounts").select("id,domain,status,account_number"),
  ]);
  const openIncidents = new Map<string, number>();
  for (const i of (incidents.data ?? []) as any[]) {
    if (!i.resolved_at) openIncidents.set(i.check_id, (openIncidents.get(i.check_id) ?? 0) + 1);
  }
  const rows = [
    ...((checks.data ?? []) as any[]).map((c) => ({
      resource: c.name, kind: "Monitor", account_number: c.account_number ?? "—",
      detail: c.target ?? "—", status: c.enabled === false ? "paused" : (c.status ?? "unknown"),
      issues: openIncidents.get(c.id) ?? 0, last_seen: c.last_checked_at,
    })),
    ...((servers.data ?? []) as any[]).map((s) => ({
      resource: s.name, kind: "Server", account_number: s.account_number ?? "—",
      detail: s.provider ?? "—", status: s.status ?? "unknown", issues: 0, last_seen: null,
    })),
    ...((hosting.data ?? []) as any[]).map((h) => ({
      resource: h.domain, kind: "Hosting", account_number: h.account_number ?? "—",
      detail: "cPanel", status: h.status ?? "unknown", issues: 0, last_seen: null,
    })),
  ];
  const down = rows.filter((r) => ["down", "failed", "error"].includes(String(r.status).toLowerCase())).length;
  const degraded = rows.filter((r) => ["degraded", "warning", "suspended"].includes(String(r.status).toLowerCase())).length;
  const healthy = rows.length - down - degraded;
  return {
    columns: [
      { key: "resource", label: "Resource" },
      { key: "kind", label: "Type" },
      { key: "account_number", label: "Account" },
      { key: "detail", label: "Detail" },
      { key: "status", label: "Status" },
      { key: "issues", label: "Open incidents", align: "right", format: "number" },
      { key: "last_seen", label: "Last checked", format: "date" },
    ],
    rows: rows.sort((a, b) => Number(b.issues) - Number(a.issues)),
    chips: [
      { label: "Resources", value: String(rows.length), color: "#334155" },
      { label: "Healthy", value: String(healthy), color: "#0f766e" },
      { label: "Degraded", value: String(degraded), color: "#b45309" },
      { label: "Down", value: String(down), color: "#b91c1c" },
    ],
    totals: { healthy, degraded, down },
  };
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export async function buildReport(db: any, key: string, from: string, to: string): Promise<ReportResult> {
  const meta = REPORTS.find((r) => r.key === key) ?? REPORTS[0];
  let part: Partial<ReportResult>;
  switch (meta.key) {
    case "ar_ageing": part = await ageingReport(db); break;
    case "mrr": part = await mrrReport(db); break;
    case "renewals": part = await renewalsReport(db, from, to); break;
    case "churn": part = await churnReport(db, from, to); break;
    case "tickets": part = await ticketsReport(db, from, to); break;
    case "service_health": part = await serviceHealthReport(db); break;
    default: part = await revenueReport(db, from, to);
  }
  return {
    key: meta.key,
    title: meta.title,
    description: meta.description,
    from,
    to,
    generated_at: new Date().toISOString(),
    columns: part.columns ?? [],
    rows: part.rows ?? [],
    chips: part.chips ?? [],
    totals: part.totals ?? null,
  };
}

/** Compact operational digest used by the scheduled email automation. */
export async function buildDigest(db: any) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [rev, ageing, mrr, tickets, health, renewals] = await Promise.all([
    buildReport(db, "revenue", monthStart, today),
    buildReport(db, "ar_ageing", monthStart, today),
    buildReport(db, "mrr", monthStart, today),
    buildReport(db, "tickets", monthStart, today),
    buildReport(db, "service_health", monthStart, today),
    buildReport(db, "renewals", today, new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)),
  ]);
  return {
    period: `${monthStart} → ${today}`,
    metrics: [
      { label: "MRR", value: `USD ${Number(mrr.totals?.["mrr"] ?? 0).toFixed(2)}` },
      { label: "Collected this month", value: `USD ${Number(rev.totals?.["amount"] ?? 0).toFixed(2)}` },
      { label: "Outstanding receivables", value: `USD ${Number(ageing.totals?.["outstanding"] ?? 0).toFixed(2)}` },
      { label: "Open tickets", value: String(tickets.totals?.["open"] ?? 0) },
      { label: "SLA breaches", value: String(tickets.totals?.["breached"] ?? 0) },
      { label: "Services down", value: String(health.totals?.["down"] ?? 0) },
      { label: "Renewals next 14 days", value: String(renewals.totals?.["count"] ?? 0) },
    ],
  };
}
