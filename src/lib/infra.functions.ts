/**
 * Infrastructure aggregation layer (Phase B2)
 * ===========================================
 * One optimized round-trip per module. Every list + every KPI on the
 * Monitoring, Web Hosting and Starlink pages is derived here, server-side,
 * so the UI never fires per-row queries (no N+1) and never invents numbers.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DAY = 86_400_000;

function daysUntil(d?: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / DAY);
}

/* ------------------------------------------------------------------ *
 * Monitoring
 * ------------------------------------------------------------------ */
export const getMonitoringOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb: any = context.supabase;
    const since = new Date(Date.now() - DAY).toISOString();

    const [checksRes, incidentsRes, resultsRes] = await Promise.all([
      sb.from("monitoring_checks").select("*").order("name"),
      sb
        .from("monitoring_incidents")
        .select("*, monitoring_checks:check_id(name,target)")
        .is("ended_at", null)
        .order("started_at", { ascending: false }),
      sb
        .from("monitoring_results")
        .select("check_id,status,response_ms")
        .gte("checked_at", since)
        .limit(50_000),
    ]);

    const checks = (checksRes.data ?? []) as any[];
    const incidents = (incidentsRes.data ?? []) as any[];
    const results = (resultsRes.data ?? []) as any[];

    // Fold 24h results once — this replaces one query per table row.
    const agg = new Map<string, { total: number; up: number; ms: number; msCount: number }>();
    for (const r of results) {
      const a = agg.get(r.check_id) ?? { total: 0, up: 0, ms: 0, msCount: 0 };
      a.total += 1;
      if (r.status === "up") a.up += 1;
      if (r.response_ms != null) { a.ms += Number(r.response_ms); a.msCount += 1; }
      agg.set(r.check_id, a);
    }

    const rows = checks.map((c) => {
      const a = agg.get(c.id);
      return {
        ...c,
        uptime_24h: a && a.total ? Math.round((a.up / a.total) * 1000) / 10 : null,
        avg_response_ms: a && a.msCount ? Math.round(a.ms / a.msCount) : null,
        samples_24h: a?.total ?? 0,
      };
    });

    const up = rows.filter((c) => c.status === "up").length;
    const down = rows.filter((c) => c.status === "down").length;
    const enabled = rows.filter((c) => c.enabled).length;
    const withUptime = rows.filter((c) => c.uptime_24h != null);

    return {
      checks: rows,
      incidents,
      stats: {
        total: rows.length,
        enabled,
        up,
        down,
        unknown: rows.length - up - down,
        openIncidents: incidents.length,
        avgUptime24h: withUptime.length
          ? Math.round((withUptime.reduce((s, c) => s + (c.uptime_24h as number), 0) / withUptime.length) * 10) / 10
          : null,
        samples24h: results.length,
      },
    };
  });

/* ------------------------------------------------------------------ *
 * Web hosting
 * ------------------------------------------------------------------ */
export const getHostingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb: any = context.supabase;
    const [accountsRes, customersRes] = await Promise.all([
      sb
        .from("web_hosting_accounts")
        .select("*")
        .order("created_at", { ascending: false }),
      sb
        .from("customers")
        .select("id,account_number,company_name")
        .is("archived_at", null),
    ]);

    const customers = (customersRes.data ?? []) as any[];
    const byId = new Map(customers.map((c) => [c.id, c]));
    const byAcct = new Map(customers.map((c) => [c.account_number, c]));

    const accounts = ((accountsRes.data ?? []) as any[]).map((a) => {
      const cust = byId.get(a.customer_id) ?? byAcct.get(a.account_number) ?? null;
      const dleft = daysUntil(a.renewal_date);
      return {
        ...a,
        customer_name: cust?.company_name ?? null,
        days_to_renewal: dleft,
        renewal_state:
          dleft == null ? "unknown" : dleft < 0 ? "expired" : dleft <= 30 ? "due" : "ok",
      };
    });

    const active = accounts.filter((a) => a.status === "active");
    const suspended = accounts.filter((a) => a.status === "suspended");
    const dueSoon = accounts.filter((a) => a.renewal_state === "due");
    const expired = accounts.filter((a) => a.renewal_state === "expired");

    return {
      accounts,
      customers,
      stats: {
        total: accounts.length,
        active: active.length,
        suspended: suspended.length,
        dueSoon: dueSoon.length,
        expired: expired.length,
        mrr: active.reduce((s, a) => s + Number(a.monthly_cost ?? 0), 0),
        diskGb: accounts.reduce((s, a) => s + Number(a.disk_quota_gb ?? 0), 0),
      },
    };
  });

/* ------------------------------------------------------------------ *
 * Starlink
 * ------------------------------------------------------------------ */
export const getStarlinkOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb: any = context.supabase;
    const [accountsRes, rechargesRes] = await Promise.all([
      sb
        .from("starlink_accounts")
        .select("*, customers(id,account_number,company_name,primary_email,primary_phone)")
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      sb
        .from("starlink_recharges")
        .select("*, starlink_accounts(starlink_account_number,kit_serial,terminal_id,plan_type)")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const accounts = (accountsRes.data ?? []) as any[];
    const recharges = (rechargesRes.data ?? []) as any[];
    const monthAgo = Date.now() - 30 * DAY;

    const active = accounts.filter((a) => a.status === "active");
    const stale = accounts.filter(
      (a) => !a.last_checked_at || Date.now() - new Date(a.last_checked_at).getTime() > 7 * DAY,
    );
    const monthRecharges = recharges.filter((r) => new Date(r.created_at).getTime() >= monthAgo);

    return {
      accounts,
      recharges,
      stats: {
        total: accounts.length,
        active: active.length,
        suspended: accounts.filter((a) => a.status === "suspended").length,
        business: accounts.filter((a) => a.plan_type === "business").length,
        residential: accounts.filter((a) => a.plan_type !== "business").length,
        mrr: active.reduce((s, a) => s + Number(a.monthly_price ?? 0), 0),
        balance: accounts.reduce((s, a) => s + Number(a.balance_usd ?? 0), 0),
        marginAllTime: recharges.reduce((s, r) => s + Number(r.margin_usd ?? 0), 0),
        margin30d: monthRecharges.reduce((s, r) => s + Number(r.margin_usd ?? 0), 0),
        recharges30d: monthRecharges.length,
        failedExternal: recharges.filter((r) => r.external_status === "failed").length,
        needsCheck: stale.length,
      },
    };
  });
