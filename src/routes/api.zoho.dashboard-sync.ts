import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireBearer, json } from "@/lib/api-auth.server";
import { syncAll } from "@/lib/zoho-sync.server";

// GET — returns aggregated dashboard data
// POST — runs syncAll() then returns aggregated dashboard data
export const Route = createFileRoute("/api/zoho/dashboard-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireBearer(request);
        if (auth instanceof Response) return auth;
        const results = await syncAll();
        const dashboard = await buildDashboard();
        return json({ results, dashboard });
      },
      GET: async ({ request }) => {
        const auth = await requireBearer(request);
        if (auth instanceof Response) return auth;
        return json({ dashboard: await buildDashboard() });
      },
    },
  },
});

async function buildDashboard() {
  const [inv, pay, exp, cust] = await Promise.all([
    supabaseAdmin.from("zoho_invoices").select("total, balance, status"),
    supabaseAdmin.from("zoho_payments").select("amount"),
    supabaseAdmin.from("zoho_expenses").select("amount"),
    supabaseAdmin.from("zoho_customers").select("id", { count: "exact", head: true }),
  ]);
  type Inv = { total: number | null; balance: number | null; status: string | null };
  type Amt = { amount: number | null };
  const invoices = (inv.data as Inv[] | null) ?? [];
  const payments = (pay.data as Amt[] | null) ?? [];
  const expenses = (exp.data as Amt[] | null) ?? [];
  return {
    totalInvoiced: invoices.reduce((s, x) => s + Number(x.total ?? 0), 0),
    totalOutstanding: invoices.reduce((s, x) => s + Number(x.balance ?? 0), 0),
    totalPaid: payments.reduce((s, x) => s + Number(x.amount ?? 0), 0),
    totalExpenses: expenses.reduce((s, x) => s + Number(x.amount ?? 0), 0),
    overdueCount: invoices.filter((x) => x.status === "overdue").length,
    customers: cust.count ?? 0,
  };
}
