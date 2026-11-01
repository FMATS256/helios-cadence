import { denyUnlessInternal } from "@/lib/hook-auth.server";
import { createFileRoute } from "@tanstack/react-router";

// Cron-triggered monitoring tick. Uses admin client to run due checks.
// Scheduled via pg_cron; /api/public/* bypasses auth on published site.
async function runTick() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: checks } = await supabaseAdmin.from("monitoring_checks").select("*").eq("enabled", true);
  const due = (checks || []).filter((c: any) => {
    if (!c.last_checked_at) return true;
    return (Date.now() - new Date(c.last_checked_at).getTime()) / 1000 >= (c.interval_seconds || 300);
  });

  for (const c of due) {
    const t0 = Date.now();
    let status: "up" | "down" = "up";
    let error: string | null = null;
    let ms: number | null = null;
    try {
      if (c.check_type === "http" || c.check_type === "https") {
        const url = c.target.startsWith("http") ? c.target : `${c.check_type}://${c.target}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, { method: "GET", signal: controller.signal, redirect: "follow" });
        clearTimeout(timer);
        ms = Date.now() - t0;
        if (!(res.status >= 200 && res.status < 500)) { status = "down"; error = `HTTP ${res.status}`; }
      } else { ms = Date.now() - t0; }
    } catch (e: any) {
      status = "down"; error = String(e?.message ?? e).slice(0, 500); ms = Date.now() - t0;
    }

    await supabaseAdmin.from("monitoring_results").insert({ check_id: c.id, status, response_ms: ms, error });
    await supabaseAdmin.from("monitoring_checks").update({
      status, last_checked_at: new Date().toISOString(), last_response_ms: ms, last_error: error,
    }).eq("id", c.id);

    const { data: open } = await supabaseAdmin.from("monitoring_incidents")
      .select("id").eq("check_id", c.id).is("ended_at", null).maybeSingle();
    if (status === "down" && !open) {
      await supabaseAdmin.from("monitoring_incidents").insert({ check_id: c.id, last_error: error });
    } else if (status === "up" && open) {
      await supabaseAdmin.from("monitoring_incidents").update({ ended_at: new Date().toISOString() }).eq("id", open.id);
    }
  }
  const servers = await serverUptime(supabaseAdmin);
  return { ran: due.length, total: (checks || []).length, servers };
}

// Server uptime: probe each powered-on server's common ports; raise or resolve a NOC alert.
async function serverUptime(admin: any) {
  const { tcpProbe } = await import("@/lib/netdiag.server");
  const { data: list } = await admin.from("cloud_servers").select("id, name, public_ips, customer_id")
    .eq("status", "active").is("archived_at", null).limit(50);
  let down = 0;
  for (const s of list ?? []) {
    const ip = ((s.public_ips ?? []) as string[])[0];
    if (!ip) continue;
    const probes = await Promise.all([22, 80, 443, 3389].map((p) => tcpProbe(ip, p)));
    const up = probes.some((p) => p.ok);
    const key = `server-down:${s.id}`;
    const { data: open } = await admin.from("ops_alerts").select("id, occurrences").eq("dedupe_key", key).neq("status", "resolved").maybeSingle();
    if (!up) {
      down++;
      if (open) await admin.from("ops_alerts").update({ last_seen_at: new Date().toISOString(), occurrences: (open.occurrences ?? 1) + 1 }).eq("id", open.id);
      else await admin.from("ops_alerts").insert({ dedupe_key: key, source: "server_uptime", severity: "critical",
        title: `Server ${s.name} is unreachable`, detail: `No response on ${ip} (ports 22/80/443/3389)`,
        customer_id: s.customer_id, entity_type: "cloud_server", entity_id: s.id });
    } else if (open) {
      await admin.from("ops_alerts").update({ status: "resolved", resolved_at: new Date().toISOString(), resolution: "Server responded again" }).eq("id", open.id);
    }
  }
  return { checked: (list ?? []).length, down };
}

export const Route = createFileRoute("/api/public/hooks/monitoring-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => { const denied = denyUnlessInternal(request); if (denied) return denied;
        const out = await runTick();
        return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
      },
      GET: async ({ request }) => { const denied = denyUnlessInternal(request); if (denied) return denied;
        const out = await runTick();
        return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
