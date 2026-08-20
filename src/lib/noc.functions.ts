// NOC — network operations centre aggregator, incident acknowledgement and shift handover.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureStaff(context: { supabase: any; userId: string }) {
  const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
  if (!hasRole) throw new Error("Staff role required");
}

export const getNocOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureStaff(context);
    const since24 = new Date(Date.now() - 24 * 3600_000).toISOString();

    const [checksR, incidentsR, resultsR, ticketsR, serversR, notesR] = await Promise.all([
      context.supabase
        .from("monitoring_checks")
        .select("*, customers(id, company_name, account_number)")
        .order("status").order("name"),
      context.supabase
        .from("monitoring_incidents")
        .select("*, monitoring_checks(id, name, target, customer_id)")
        .order("started_at", { ascending: false }).limit(200),
      context.supabase.from("monitoring_results").select("check_id, status, response_ms, checked_at").gte("checked_at", since24).limit(5000),
      context.supabase
        .from("tickets")
        .select("id, ticket_number, subject, status, priority, created_at, customers(company_name)")
        .not("status", "in", '("closed","resolved")')
        .order("created_at", { ascending: false }).limit(200),
      context.supabase.from("cloud_servers").select("id, name, status, provider, ip_address, customer_id").limit(500),
      context.supabase.from("noc_shift_notes").select("*").order("created_at", { ascending: false }).limit(50),
    ]);

    const checks: any[] = checksR.data ?? [];
    const incidents: any[] = incidentsR.data ?? [];
    const results: any[] = resultsR.data ?? [];
    const tickets: any[] = ticketsR.data ?? [];
    const servers: any[] = serversR.data ?? [];
    const notes: any[] = notesR.data ?? [];

    const byCheck: Record<string, { up: number; total: number; ms: number[] }> = {};
    for (const r of results) {
      const b = (byCheck[r.check_id] ||= { up: 0, total: 0, ms: [] });
      b.total++;
      if (r.status === "up") b.up++;
      if (r.response_ms != null) b.ms.push(Number(r.response_ms));
    }

    const enriched = checks.map((c) => {
      const b = byCheck[c.id];
      const uptime = b && b.total ? Math.round((b.up / b.total) * 1000) / 10 : null;
      const avgMs = b && b.ms.length ? Math.round(b.ms.reduce((s, m) => s + m, 0) / b.ms.length) : null;
      return { ...c, uptime_24h: uptime, avg_ms_24h: avgMs, samples_24h: b?.total ?? 0 };
    });

    const openIncidents = incidents.filter((i) => !i.ended_at);
    const down = enriched.filter((c) => c.status === "down");
    const degraded = enriched.filter((c) => c.uptime_24h != null && c.uptime_24h < 99 && c.status !== "down");
    const allMs = enriched.map((c) => c.avg_ms_24h).filter((n): n is number => n != null);

    return {
      checks: enriched,
      incidents,
      tickets,
      servers,
      notes,
      stats: {
        monitored: checks.length,
        up: enriched.filter((c) => c.status === "up").length,
        down: down.length,
        degraded: degraded.length,
        openIncidents: openIncidents.length,
        unacknowledged: openIncidents.filter((i) => !i.acknowledged_at).length,
        incidents24h: incidents.filter((i) => i.started_at >= since24).length,
        avgLatency: allMs.length ? Math.round(allMs.reduce((s, m) => s + m, 0) / allMs.length) : null,
        uptime24h: enriched.length
          ? Math.round(
              (enriched.filter((c) => c.uptime_24h != null).reduce((s, c) => s + (c.uptime_24h ?? 0), 0) /
                Math.max(1, enriched.filter((c) => c.uptime_24h != null).length)) * 10,
            ) / 10
          : null,
        openTickets: tickets.length,
        criticalTickets: tickets.filter((t) => t.priority === "critical" || t.priority === "urgent").length,
        serversRunning: servers.filter((s) => (s.status || "").toLowerCase() === "running" || (s.status || "").toLowerCase() === "active").length,
        serversTotal: servers.length,
      },
    };
  });

export const acknowledgeIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; note?: string; severity?: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const patch: any = { acknowledged_at: new Date().toISOString(), acknowledged_by: context.userId };
    if (data.note?.trim()) patch.ack_note = data.note.trim();
    if (data.severity) patch.severity = data.severity;
    const { error } = await context.supabase.from("monitoring_incidents").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resolveIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; note?: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const patch: any = { ended_at: new Date().toISOString() };
    if (data.note?.trim()) patch.ack_note = data.note.trim();
    const { error } = await context.supabase.from("monitoring_incidents").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addShiftNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { note: string; shift?: string; shift_date?: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    if (!data.note?.trim()) throw new Error("Note is required");
    const { error } = await context.supabase.from("noc_shift_notes").insert({
      note: data.note.trim(),
      shift: data.shift || "day",
      shift_date: data.shift_date || new Date().toISOString().slice(0, 10),
      author_id: context.userId,
      author_email: (context as any).claims?.email ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
