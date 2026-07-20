// Budget & cost-alerts — customer spend caps and monthly alert history.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listCustomerBudgets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("customer_budgets")
      .select("*, customers(id, name, account_number)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const upsertCustomerBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    customer_id: string; monthly_cap_usd: number;
    alert_threshold_pct: number; enabled: boolean;
    notify_user_id?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("customer_budgets").upsert({
      customer_id: data.customer_id,
      monthly_cap_usd: data.monthly_cap_usd,
      alert_threshold_pct: data.alert_threshold_pct,
      enabled: data.enabled,
      notify_user_id: data.notify_user_id ?? context.userId,
      created_by: context.userId,
    }, { onConflict: "customer_id" }).select("*").single();
    if (error) throw error;
    return row;
  });

export const deleteCustomerBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customer_id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("customer_budgets").delete().eq("customer_id", data.customer_id);
    if (error) throw error;
    return { ok: true };
  });

export const listBudgetAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("budget_alerts")
      .select("*, customers(id, name, account_number)")
      .order("sent_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data ?? [];
  });

// Live spend snapshot: sums cloud_servers.monthly_cost_usd + subscriptions.amount per customer this month.
export const getCustomerSpendSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [srv, subs, budgets] = await Promise.all([
      context.supabase.from("cloud_servers").select("customer_id, monthly_cost_usd, selling_price_usd").is("archived_at", null),
      context.supabase.from("subscriptions").select("customer_id, amount, status"),
      context.supabase.from("customer_budgets").select("customer_id, monthly_cap_usd, alert_threshold_pct, enabled"),
    ]);

    const totals: Record<string, { cost: number; revenue: number }> = {};
    for (const r of srv.data ?? []) {
      if (!r.customer_id) continue;
      totals[r.customer_id] ??= { cost: 0, revenue: 0 };
      totals[r.customer_id].cost += Number(r.monthly_cost_usd || 0);
      totals[r.customer_id].revenue += Number(r.selling_price_usd || 0);
    }
    for (const r of subs.data ?? []) {
      if (!r.customer_id || r.status !== "active") continue;
      totals[r.customer_id] ??= { cost: 0, revenue: 0 };
      totals[r.customer_id].revenue += Number(r.amount || 0);
    }
    return { totals, budgets: budgets.data ?? [] };
  });
