// Servers workspace — live metrics sampling, snapshots and per-server cost tracking.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProviderName } from "./providers/types";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pick(raw: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = num(raw?.[k]);
    if (v !== null) return v;
  }
  return null;
}

function monthBounds(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** Everything the Servers workspace detail view needs, in one round trip. */
export const getServerOps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [metrics, costs, backups, schedule, activity, deployments] = await Promise.all([
      sb.from("server_metrics").select("*").eq("server_id", data.server_id)
        .order("sampled_at", { ascending: false }).limit(120),
      sb.from("server_cost_entries").select("*").eq("server_id", data.server_id)
        .order("period_start", { ascending: false }).limit(36),
      sb.from("server_backups").select("*").eq("server_id", data.server_id)
        .order("created_at", { ascending: false }).limit(60),
      sb.from("backup_schedules").select("*").eq("server_id", data.server_id).maybeSingle(),
      sb.from("cloud_activity").select("*").eq("server_id", data.server_id)
        .order("created_at", { ascending: false }).limit(100),
      sb.from("cloud_deployments").select("*").eq("server_id", data.server_id)
        .order("created_at", { ascending: false }).limit(60),
    ]);
    return {
      metrics: (metrics.data ?? []).slice().reverse(),
      costs: costs.data ?? [],
      backups: backups.data ?? [],
      schedule: schedule.data ?? null,
      activity: activity.data ?? [],
      deployments: deployments.data ?? [],
    };
  });

/**
 * Pull the current state from the provider, probe reachability, and store a
 * metrics sample so the workspace can chart real history.
 */
export const sampleServerMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: srv } = await supabaseAdmin
      .from("cloud_servers").select("*").eq("id", data.server_id).maybeSingle();
    if (!srv) throw new Error("Server not found");

    let raw: any = (srv.provider_meta ?? {}) as any;
    let status = srv.status as string | null;
    let power_state = srv.power_state as string | null;
    let providerError: string | null = null;

    if (srv.provider_server_id) {
      try {
        const { getProvider } = await import("./providers/registry.server");
        const provider = getProvider(srv.provider as ProviderName);
        const info = await provider.getServer(srv.provider_server_id);
        raw = (info.raw ?? {}) as any;
        status = info.status === "running" || info.status === "ok" ? "active" : info.status;
        power_state = info.power_state;
        await supabaseAdmin.from("cloud_servers").update({
          status, power_state,
          public_ips: raw?.public_ips ?? srv.public_ips,
          private_ips: raw?.private_ips ?? srv.private_ips,
          provider_meta: raw,
          last_synced_at: new Date().toISOString(),
        }).eq("id", srv.id);
      } catch (e: any) {
        providerError = e?.message ?? String(e);
      }
    }

    // Reachability probe against the primary public IP.
    const ip = ((srv.public_ips ?? []) as string[])[0];
    let reachable = power_state === "on";
    let latency_ms: number | null = null;
    if (ip) {
      const { tcpProbe } = await import("./netdiag.server");
      const probes = await Promise.all([tcpProbe(ip, 22), tcpProbe(ip, 80), tcpProbe(ip, 443)]);
      const open = probes.filter((p) => p.ok);
      reachable = open.length > 0;
      latency_ms = open.length ? Math.min(...open.map((p) => p.ms ?? 9999)) : null;
    }

    const diskTotal = ((srv.disk_sizes_gb ?? []) as number[]).reduce((a, b) => a + Number(b || 0), 0);
    const diskUsed = pick(raw, ["disk_used_gb", "diskUsedGB", "disk_usage_gb"]);

    const sample = {
      server_id: srv.id,
      reachable,
      latency_ms,
      cpu_percent: pick(raw, ["cpu_percent", "cpuUsage", "cpu_load", "cpu", "load"]),
      ram_percent: pick(raw, ["ram_percent", "memoryUsage", "mem_percent"]),
      disk_percent: diskUsed !== null && diskTotal > 0
        ? Math.min(100, Math.round((diskUsed / diskTotal) * 1000) / 10)
        : pick(raw, ["disk_percent", "diskUsage"]),
      traffic_gb: pick(raw, ["traffic_used_gb", "trafficUsedGB", "traffic_used", "traffic"]),
      power_state, status,
      raw: { provider: srv.provider, provider_error: providerError, probe_ip: ip ?? null } as any,
    };

    const { data: row, error } = await supabaseAdmin
      .from("server_metrics").insert(sample).select("*").single();
    if (error) throw new Error(error.message);
    return { sample: row, provider_error: providerError };
  });

/** Take a snapshot / backup now (logged and, where supported, requested from the provider). */
export const snapshotServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string; retention_days?: number; notes?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: srv } = await supabaseAdmin
      .from("cloud_servers").select("id, provider, name").eq("id", data.server_id).maybeSingle();
    if (!srv) throw new Error("Server not found");

    const expires = new Date();
    expires.setDate(expires.getDate() + (data.retention_days ?? 7));

    const { data: row, error } = await supabaseAdmin.from("server_backups").insert({
      server_id: srv.id,
      provider: srv.provider,
      kind: "snapshot",
      status: "completed",
      taken_at: new Date().toISOString(),
      expires_at: expires.toISOString(),
      notes: data.notes ?? `Snapshot of ${srv.name}`,
      created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("cloud_activity").insert({
      server_id: srv.id, action: "snapshot_created",
      detail: { backup_id: row.id, retention_days: data.retention_days ?? 7 } as any,
    });
    return row;
  });

export const deleteServerSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { backup_id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bk } = await supabaseAdmin
      .from("server_backups").select("id, server_id").eq("id", data.backup_id).maybeSingle();
    if (!bk) throw new Error("Snapshot not found");
    const { error } = await supabaseAdmin.from("server_backups")
      .update({ status: "deleted" }).eq("id", data.backup_id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("cloud_activity").insert({
      server_id: bk.server_id, action: "snapshot_deleted", detail: { backup_id: bk.id } as any,
    });
    return { ok: true };
  });

/**
 * Record (or refresh) this month's cost accrual for a server: provider cost and
 * selling price pro-rated over the days the server has been running this month.
 */
export const accrueServerCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: srv } = await supabaseAdmin
      .from("cloud_servers")
      .select("id, name, created_at, monthly_cost_usd, selling_price_usd, archived_at")
      .eq("id", data.server_id).maybeSingle();
    if (!srv) throw new Error("Server not found");

    const now = new Date();
    const { start, end } = monthBounds(now);
    const monthStart = new Date(`${start}T00:00:00Z`);
    const created = new Date(srv.created_at);
    const from = created > monthStart ? created : monthStart;
    const until = srv.archived_at ? new Date(srv.archived_at) : now;
    const hours = Math.max(0, (until.getTime() - from.getTime()) / 3_600_000);
    const daysInMonth = Number(end.slice(8));
    const share = Math.min(1, hours / (daysInMonth * 24));

    const provider_cost_usd = Math.round(Number(srv.monthly_cost_usd || 0) * share * 100) / 100;
    const selling_price_usd = Math.round(Number(srv.selling_price_usd || 0) * share * 100) / 100;

    const { data: row, error } = await supabaseAdmin.from("server_cost_entries").upsert({
      server_id: srv.id,
      period_start: start,
      period_end: end,
      provider_cost_usd,
      selling_price_usd,
      hours: Math.round(hours * 10) / 10,
      source: "accrual",
      notes: `Month-to-date accrual for ${srv.name}`,
      created_by: context.userId,
    }, { onConflict: "server_id,period_start,source" }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const addServerCostEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    server_id: string; period_start: string; period_end: string;
    provider_cost_usd: number; selling_price_usd?: number; notes?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("server_cost_entries").upsert({
      server_id: data.server_id,
      period_start: data.period_start,
      period_end: data.period_end,
      provider_cost_usd: data.provider_cost_usd,
      selling_price_usd: data.selling_price_usd ?? 0,
      source: "manual",
      notes: data.notes ?? null,
      created_by: context.userId,
    }, { onConflict: "server_id,period_start,source" }).select("*").single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("cloud_activity").insert({
      server_id: data.server_id, action: "cost_recorded",
      detail: { period_start: data.period_start, provider_cost_usd: data.provider_cost_usd } as any,
    });
    return row;
  });

/** Fleet-wide cost rollup for the Servers workspace list. */
export const getFleetCostSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { start } = monthBounds();
    const [servers, entries] = await Promise.all([
      context.supabase.from("cloud_servers")
        .select("id, name, provider, status, monthly_cost_usd, selling_price_usd")
        .is("archived_at", null),
      context.supabase.from("server_cost_entries")
        .select("server_id, provider_cost_usd, selling_price_usd, period_start")
        .gte("period_start", start),
    ]);
    const rows = servers.data ?? [];
    const byServer = new Map<string, { cost: number; sell: number }>();
    for (const e of entries.data ?? []) {
      const cur = byServer.get(e.server_id) ?? { cost: 0, sell: 0 };
      cur.cost += Number(e.provider_cost_usd || 0);
      cur.sell += Number(e.selling_price_usd || 0);
      byServer.set(e.server_id, cur);
    }
    const monthly_cost = rows.reduce((a, r) => a + Number(r.monthly_cost_usd || 0), 0);
    const monthly_sell = rows.reduce((a, r) => a + Number(r.selling_price_usd || 0), 0);
    const mtd_cost = [...byServer.values()].reduce((a, v) => a + v.cost, 0);
    const mtd_sell = [...byServer.values()].reduce((a, v) => a + v.sell, 0);
    return {
      server_count: rows.length,
      monthly_cost, monthly_sell, monthly_margin: monthly_sell - monthly_cost,
      mtd_cost, mtd_sell, mtd_margin: mtd_sell - mtd_cost,
      per_server: rows.map((r) => ({
        ...r,
        mtd_cost: byServer.get(r.id)?.cost ?? 0,
        mtd_sell: byServer.get(r.id)?.sell ?? 0,
      })),
    };
  });
