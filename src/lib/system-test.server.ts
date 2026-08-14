// Server-only helpers backing the System Health / Integration Test workspace.
// Everything here operates ONLY on records marked as test data.
import { monthly, num } from "./customer360.server";

/** Every test record carries this marker so cleanup can never touch real data. */
export const TEST_MARKER = "[SYSTEM TEST]";

export function isTestCustomer(c: any) {
  return String(c?.company_name || "").startsWith(TEST_MARKER);
}

export async function listTestCustomers(db: any) {
  const { data } = await db
    .from("customers")
    .select("*")
    .like("company_name", `${TEST_MARKER}%`)
    .order("created_at", { ascending: false });
  return (data ?? []) as any[];
}

export async function assertTestCustomer(db: any, customerId: string) {
  const { data } = await db.from("customers").select("*").eq("id", customerId).maybeSingle();
  if (!data) throw new Error("Customer not found");
  if (!isTestCustomer(data)) throw new Error("Refusing to operate on a non-test customer");
  return data;
}

/** Full integration snapshot used to assert cross-module synchronisation. */
export async function snapshotCustomer(db: any, customerId: string) {
  const { data: customer } = await db.from("customers").select("*").eq("id", customerId).maybeSingle();
  if (!customer) throw new Error("Customer not found");
  const cid = customer.id;

  const [
    subsR, svcR, invR, payR, allocR, credR, tlR, auditR, commR, tkR, assetR, docR, lifeR, notifR,
  ] = await Promise.all([
    db.from("subscriptions").select("*").eq("customer_id", cid),
    db.from("cloud_services").select("*").eq("customer_id", cid).is("archived_at", null),
    db.from("invoices").select("*").eq("customer_id", cid).is("archived_at", null),
    db.from("payments").select("*").eq("customer_id", cid),
    db.from("payment_allocations").select("invoice_id, payment_id, amount"),
    db.from("customer_credits").select("*").eq("customer_id", cid),
    db.from("customer_timeline").select("*").eq("customer_id", cid).order("created_at", { ascending: false }),
    db.from("audit_log").select("*").eq("account_number", customer.account_number).order("created_at", { ascending: false }).limit(200),
    db.from("communications").select("*").eq("customer_id", cid),
    db.from("tickets").select("*").eq("customer_id", cid),
    db.from("assets").select("*").eq("customer_id", cid).is("archived_at", null),
    db.from("customer_documents").select("*").eq("customer_id", cid),
    db.from("asset_lifecycle_events").select("*").order("created_at", { ascending: false }).limit(500),
    db.from("notifications").select("id, kind, title, created_at").order("created_at", { ascending: false }).limit(100),
  ]);

  const rows = (r: any) => (r?.data ?? []) as any[];
  const subscriptions = rows(subsR);
  const services = rows(svcR);
  const invoices = rows(invR);
  const payments = rows(payR);
  const credits = rows(credR);
  const timeline = rows(tlR);
  const audit = rows(auditR);
  const assets = rows(assetR);

  const paidBy: Record<string, number> = {};
  const myInvoiceIds = new Set(invoices.map((i) => i.id));
  for (const a of rows(allocR)) {
    if (myInvoiceIds.has(a.invoice_id)) paidBy[a.invoice_id] = (paidBy[a.invoice_id] ?? 0) + num(a.amount);
  }

  const enrichedInvoices = invoices.map((i) => {
    const paid = Math.round((paidBy[i.id] ?? 0) * 100) / 100;
    const balance = Math.round((num(i.total) - paid) * 100) / 100;
    return {
      id: i.id,
      invoice_number: i.invoice_number,
      total: num(i.total),
      paid,
      balance,
      status: i.status,
      due_date: i.due_date,
      derived: balance <= 0.005 ? "paid" : paid > 0.005 ? "partial" : "unpaid",
    };
  });

  const outstanding = Math.round(enrichedInvoices.reduce((s, i) => s + Math.max(0, i.balance), 0) * 100) / 100;
  const creditBalance = Math.round(credits.reduce((s, c) => s + num(c.amount), 0) * 100) / 100;
  const activeSubs = subscriptions.filter((s) => s.status === "active");
  const mrr =
    Math.round(
      (activeSubs.reduce((s, x) => s + monthly(x.amount, x.billing_cycle), 0) +
        services.filter((s) => s.status === "active").reduce((s, x) => s + num(x.monthly_cost), 0)) * 100,
    ) / 100;

  // duplicate active package detection (same plan_name active more than once)
  const planCount: Record<string, number> = {};
  for (const s of activeSubs) planCount[String(s.plan_name)] = (planCount[String(s.plan_name)] ?? 0) + 1;
  const duplicateActivePackages = Object.entries(planCount)
    .filter(([, n]) => n > 1)
    .map(([plan, n]) => ({ plan, count: n }));

  const assetIds = new Set(assets.map((a) => a.id));
  const assetEvents = rows(lifeR).filter((e) => assetIds.has(e.asset_id));

  return {
    customer,
    counts: {
      subscriptions: subscriptions.length,
      activeSubscriptions: activeSubs.length,
      suspendedSubscriptions: subscriptions.filter((s) => s.status === "suspended").length,
      cancelledSubscriptions: subscriptions.filter((s) => s.status === "cancelled").length,
      services: services.length,
      invoices: invoices.length,
      payments: payments.length,
      credits: credits.length,
      timeline: timeline.length,
      audit: audit.length,
      communications: rows(commR).length,
      tickets: rows(tkR).length,
      assets: assets.length,
      assetEvents: assetEvents.length,
      documents: rows(docR).length,
      notifications: rows(notifR).length,
    },
    subscriptions: subscriptions.map((s) => ({
      id: s.id, plan_name: s.plan_name, status: s.status, amount: num(s.amount),
      billing_cycle: s.billing_cycle, next_renewal: s.next_renewal,
    })),
    invoices: enrichedInvoices,
    payments: payments.map((p) => ({
      id: p.id, amount: num(p.amount), status: p.status, method: p.method,
      reconciliation_status: p.reconciliation_status, receipt_number: p.receipt_number, paid_at: p.paid_at,
    })),
    credits: credits.map((c) => ({ id: c.id, amount: num(c.amount), kind: c.kind, note: c.note })),
    assets: assets.map((a) => ({ id: a.id, asset_tag: a.asset_tag, status: a.status, assigned_to: a.assigned_to })),
    assetEvents: assetEvents.map((e) => ({ id: e.id, asset_id: e.asset_id, event_type: e.event_type, created_at: e.created_at })),
    documents: rows(docR).map((d) => ({ id: d.id, doc_key: d.doc_key, status: d.status, file_path: d.file_path })),
    tickets: rows(tkR).map((t) => ({ id: t.id, ticket_number: t.ticket_number, status: t.status, assigned_to: t.assigned_to, sla_due_at: t.sla_due_at })),
    communications: rows(commR).map((c) => ({ id: c.id, channel: c.channel, direction: c.direction, subject: c.subject, status: c.status })),
    timelineTypes: timeline.map((t) => t.event_type),
    auditActions: audit.map((a) => a.action),
    summary: { outstanding, creditBalance, mrr, arr: Math.round(mrr * 12 * 100) / 100, duplicateActivePackages },
  };
}

export type SystemSnapshot = Awaited<ReturnType<typeof snapshotCustomer>>;

/** Delete every record belonging to test customers. Never touches real accounts. */
export async function purgeTestData(db: any) {
  const customers = await listTestCustomers(db);
  const removed: Record<string, number> = {};
  const bump = (k: string, n: number) => { if (n) removed[k] = (removed[k] ?? 0) + n; };

  for (const c of customers) {
    const cid = c.id;
    const ids = async (table: string, col = "customer_id") => {
      const { data } = await db.from(table).select("id").eq(col, cid);
      return (data ?? []).map((r: any) => r.id as string);
    };

    const [invoiceIds, paymentIds, ticketIds, assetIds, quoteIds] = await Promise.all([
      ids("invoices"), ids("payments"), ids("tickets"), ids("assets"), ids("quotes"),
    ]);

    const del = async (table: string, col: string, values: string[] | string) => {
      if (Array.isArray(values)) {
        if (!values.length) return;
        const { data } = await db.from(table).delete().in(col, values).select("id");
        bump(table, (data ?? []).length);
      } else {
        const { data } = await db.from(table).delete().eq(col, values).select("id");
        bump(table, (data ?? []).length);
      }
    };

    if (invoiceIds.length) await del("payment_allocations", "invoice_id", invoiceIds);
    if (paymentIds.length) await del("payment_allocations", "payment_id", paymentIds);
    if (invoiceIds.length) await del("invoice_line_items", "invoice_id", invoiceIds);
    if (quoteIds.length) await del("quote_line_items", "quote_id", quoteIds);
    if (ticketIds.length) await del("ticket_messages", "ticket_id", ticketIds);
    if (assetIds.length) await del("asset_lifecycle_events", "asset_id", assetIds);

    await del("refunds", "customer_id", cid);
    await del("customer_credits", "customer_id", cid);
    await del("payments", "customer_id", cid);
    await del("invoices", "customer_id", cid);
    await del("quotes", "customer_id", cid);
    await del("subscription_history", "customer_id", cid);
    await del("subscriptions", "customer_id", cid);
    await del("customer_services", "customer_id", cid);
    await del("cloud_services", "customer_id", cid);
    await del("customer_documents", "customer_id", cid);
    await del("tickets", "customer_id", cid);
    await del("assets", "customer_id", cid);
    await del("communications", "customer_id", cid);
    await del("customer_notes", "customer_id", cid);
    await del("customer_contacts", "customer_id", cid);
    await del("customer_branches", "customer_id", cid);
    await del("customer_timeline", "customer_id", cid);
    await del("credentials", "customer_id", cid);
    await del("monitoring_checks", "customer_id", cid);
    await del("projects", "customer_id", cid);
    await del("licenses", "customer_id", cid);
    await del("audit_log", "account_number", c.account_number);
    await del("customers", "id", cid);
  }

  return { customers: customers.length, removed };
}
