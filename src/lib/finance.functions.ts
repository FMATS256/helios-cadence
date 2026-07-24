/**
 * Finance module aggregators.
 * ===========================
 * One request per page — no N+1 queries in the finance surfaces.
 * These are read-only aggregators that back the Invoices, Payments,
 * and Quotes pages. Every KPI, chart, and list is derived from a
 * single round-trip, matching the getCustomer360 pattern.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rows = <T,>(r: { data: T[] | null }) => (r.data ?? []) as T[];

async function ensureStaff(context: { supabase: any; userId: string }) {
  const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
  if (!hasRole) throw new Error("Staff role required");
}

/* ---------- Invoices Aggregator ---------- */

export const getInvoicesOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => input ?? {})
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 500;

    const [invR, allocR] = await Promise.all([
      supabaseAdmin
        .from("invoices")
        .select("*, customers:customer_id(company_name)")
        .is("archived_at", null)
        .order("issue_date", { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from("payment_allocations")
        .select("invoice_id, amount"),
    ]);
    const invoices = rows(invR) as any[];
    const allocs = rows(allocR) as any[];

    const paidBy: Record<string, number> = {};
    for (const a of allocs) paidBy[a.invoice_id] = (paidBy[a.invoice_id] || 0) + Number(a.amount || 0);

    const now = Date.now();
    let outstanding = 0, overdue = 0, paidMonth = 0, draft = 0;
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

    for (const inv of invoices) {
      const total = Number(inv.total || 0);
      const paid = paidBy[inv.id] || 0;
      const balance = Math.max(0, total - paid);
      const isPaid = inv.status === "paid" || balance <= 0.001;
      const isOverdue = !isPaid && inv.due_date && new Date(inv.due_date).getTime() < now;
      inv.paid_amount = paid;
      inv.balance = balance;
      inv.is_overdue = !!isOverdue;
      if (!isPaid) outstanding += balance;
      if (isOverdue) overdue += balance;
      if (inv.status === "draft") draft += total;
      if (isPaid && inv.issue_date && new Date(inv.issue_date).getTime() >= startOfMonth) paidMonth += total;
    }

    return {
      invoices,
      stats: {
        count: invoices.length,
        outstanding,
        overdue,
        paidMonth,
        draft,
        overdueCount: invoices.filter((i) => i.is_overdue).length,
        paidCount: invoices.filter((i) => i.status === "paid" || (i.balance ?? 0) <= 0.001).length,
        draftCount: invoices.filter((i) => i.status === "draft").length,
      },
    };
  });

/* ---------- Payments Aggregator ---------- */

export const getPaymentsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => input ?? {})
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 500;

    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("*, customers:customer_id(company_name)")
      .order("paid_at", { ascending: false })
      .limit(limit);

    const list = (payments ?? []) as any[];
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekAgo = now.getTime() - 7 * 86400000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let today = 0, week = 0, month = 0, pending = 0, unrec = 0, refunded = 0;
    for (const p of list) {
      const t = new Date(p.paid_at).getTime();
      const amt = Number(p.amount || 0);
      if (p.status === "received") {
        if (t >= startOfDay) today += amt;
        if (t >= weekAgo) week += amt;
        if (t >= startOfMonth) month += amt;
        if (p.reconciliation_status !== "matched") unrec += amt;
      }
      if (p.status === "pending") pending += amt;
      if (p.status === "refunded") refunded += amt;
    }

    return {
      payments: list,
      stats: {
        count: list.length,
        today, week, month, pending, unrec, refunded,
        receivedCount: list.filter((p) => p.status === "received").length,
        pendingCount: list.filter((p) => p.status === "pending").length,
        unreconciledCount: list.filter((p) => p.status === "received" && p.reconciliation_status !== "matched").length,
      },
    };
  });

/* ---------- Quotes Aggregator ---------- */

export const getQuotesOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => input ?? {})
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 500;

    const { data: quotes } = await supabaseAdmin
      .from("quotes")
      .select("*, customers:customer_id(company_name)")
      .order("created_at", { ascending: false })
      .limit(limit);


    const list = (quotes ?? []) as any[];
    const now = Date.now();

    let pipeline = 0, accepted = 0, sent = 0, expired = 0, expiredCount = 0, acceptedCount = 0;
    for (const q of list) {
      const total = Number(q.total ?? q.amount ?? 0);
      const isExpired = q.valid_until && new Date(q.valid_until).getTime() < now && q.status !== "accepted";
      if (isExpired) { expired += total; expiredCount += 1; }
      if (q.status === "sent") { sent += total; pipeline += total; }
      if (q.status === "draft") pipeline += total;
      if (q.status === "accepted") { accepted += total; acceptedCount += 1; }
    }

    return {
      quotes: list,
      stats: {
        count: list.length,
        pipeline, sent, accepted, expired,
        acceptedCount, expiredCount,
        acceptRate: list.length ? Math.round((acceptedCount / list.length) * 100) : 0,
      },
    };
  });
