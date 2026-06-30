// Server fns the CRM UI calls. Auth-protected.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncAll, syncEntity, type SyncResult } from "./zoho-sync.server";

export const getZohoStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: conn } = await supabaseAdmin
      .from("zoho_connections")
      .select("id, organization_id, expires_at, updated_at, region")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: logs } = await supabaseAdmin
      .from("zoho_sync_logs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20);

    const counts: Record<string, number> = {};
    const tables = [
      "zoho_customers", "zoho_invoices", "zoho_sales_orders", "zoho_estimates",
      "zoho_payments", "zoho_items", "zoho_expenses", "zoho_credit_notes",
      "zoho_vendors", "zoho_organizations", "zoho_taxes",
    ];
    await Promise.all(tables.map(async (t) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabaseAdmin as any).from(t).select("*", { count: "exact", head: true });
      counts[t] = count ?? 0;
    }));

    return { connected: !!conn, connection: conn, logs: logs ?? [], counts };
  });

export const runZohoSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entity?: string }) =>
    z.object({ entity: z.string().min(1).max(64).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<{ results: SyncResult[] }> => {
    if (data.entity) {
      const r = await syncEntity(data.entity);
      return { results: [r] };
    }
    const results = await syncAll();
    return { results };
  });

export const getZohoDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [inv, pay, cust, exp] = await Promise.all([
      supabaseAdmin.from("zoho_invoices").select("total, balance, status, date, currency_code"),
      supabaseAdmin.from("zoho_payments").select("amount, date"),
      supabaseAdmin.from("zoho_customers").select("id, outstanding"),
      supabaseAdmin.from("zoho_expenses").select("amount, date"),
    ]);

    type Inv = { total: number | null; balance: number | null; status: string | null; date: string | null };
    type Amt = { amount: number | null; date: string | null };
    type Cust = { outstanding: number | null };

    const invoices = (inv.data as Inv[] | null) ?? [];
    const payments = (pay.data as Amt[] | null) ?? [];
    const customers = (cust.data as Cust[] | null) ?? [];
    const expenses = (exp.data as Amt[] | null) ?? [];

    const totalInvoiced = invoices.reduce((s, x) => s + Number(x.total ?? 0), 0);
    const totalOutstanding = invoices.reduce((s, x) => s + Number(x.balance ?? 0), 0);
    const totalPaid = payments.reduce((s, x) => s + Number(x.amount ?? 0), 0);
    const totalExpenses = expenses.reduce((s, x) => s + Number(x.amount ?? 0), 0);
    const overdueCount = invoices.filter((x) => x.status === "overdue").length;

    // Monthly revenue (last 6 months)
    const months: { key: string; label: string; revenue: number; expenses: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleString("en", { month: "short" }), revenue: 0, expenses: 0 });
    }
    const monthKey = (iso: string | null) => (iso ? iso.slice(0, 7) : null);
    payments.forEach((p) => {
      const k = monthKey(p.date);
      const m = months.find((x) => x.key === k);
      if (m) m.revenue += Number(p.amount ?? 0);
    });
    expenses.forEach((e) => {
      const k = monthKey(e.date);
      const m = months.find((x) => x.key === k);
      if (m) m.expenses += Number(e.amount ?? 0);
    });

    return {
      kpis: {
        totalInvoiced,
        totalOutstanding,
        totalPaid,
        totalExpenses,
        overdueCount,
        customers: customers.length,
      },
      monthly: months,
    };
  });
