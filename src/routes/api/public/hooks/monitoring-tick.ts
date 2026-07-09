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
  return { ran: due.length, total: (checks || []).length };
}

export const Route = createFileRoute("/api/public/hooks/monitoring-tick")({
  server: {
    handlers: {
      POST: async () => {
        const out = await runTick();
        return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
      },
      GET: async () => {
        const out = await runTick();
        return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
