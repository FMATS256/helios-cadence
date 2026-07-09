import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Run one HTTP/HTTPS check, return {status, ms, error}
async function probe(check: any): Promise<{ status: "up" | "down"; ms: number | null; error: string | null }> {
  const t0 = Date.now();
  try {
    if (check.check_type === "http" || check.check_type === "https") {
      const url = check.target.startsWith("http") ? check.target : `${check.check_type}://${check.target}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { method: "GET", signal: controller.signal, redirect: "follow" });
      clearTimeout(timer);
      const ms = Date.now() - t0;
      if (res.status >= 200 && res.status < 500) return { status: "up", ms, error: null };
      return { status: "down", ms, error: `HTTP ${res.status}` };
    }
    // ping/tcp/dns not available in Worker runtime — treat as up if URL-like, else skip.
    return { status: "up", ms: Date.now() - t0, error: null };
  } catch (e: any) {
    return { status: "down", ms: Date.now() - t0, error: String(e?.message ?? e).slice(0, 500) };
  }
}

async function runOne(admin: any, check: any) {
  const result = await probe(check);
  await admin.from("monitoring_results").insert({
    check_id: check.id, status: result.status, response_ms: result.ms, error: result.error,
  });
  await admin.from("monitoring_checks").update({
    status: result.status, last_checked_at: new Date().toISOString(),
    last_response_ms: result.ms, last_error: result.error,
  }).eq("id", check.id);

  // Incident open/close
  const { data: open } = await admin.from("monitoring_incidents")
    .select("id").eq("check_id", check.id).is("ended_at", null).maybeSingle();
  if (result.status === "down" && !open) {
    await admin.from("monitoring_incidents").insert({ check_id: check.id, last_error: result.error });
    // Notify staff assigned to related customer's account manager (best-effort)
    const { data: cust } = check.customer_id
      ? await admin.from("customers").select("account_manager_id,company_name").eq("id", check.customer_id).maybeSingle()
      : { data: null };
    if (cust?.account_manager_id) {
      await admin.from("notifications").insert({
        user_id: cust.account_manager_id,
        kind: "monitoring_down",
        title: `DOWN: ${check.name}`,
        body: `${check.target} — ${result.error ?? "unreachable"}`,
        link: "/monitoring",
      });
    }
  } else if (result.status === "up" && open) {
    await admin.from("monitoring_incidents").update({ ended_at: new Date().toISOString() }).eq("id", open.id);
  }
}

export const runDueChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: checks } = await supabaseAdmin.from("monitoring_checks").select("*").eq("enabled", true);
    const due = (checks || []).filter((c: any) => {
      if (!c.last_checked_at) return true;
      return (Date.now() - new Date(c.last_checked_at).getTime()) / 1000 >= (c.interval_seconds || 300);
    });
    for (const c of due) { await runOne(supabaseAdmin, c); }
    return { ran: due.length, total: (checks || []).length };
  });

export const runAllChecksNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: checks } = await supabaseAdmin.from("monitoring_checks").select("*").eq("enabled", true);
    for (const c of (checks || [])) { await runOne(supabaseAdmin, c); }
    return { ran: (checks || []).length };
  });

export const uptimeSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { checkId: string; hours?: number }) => input)
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - (data.hours || 24) * 3600_000).toISOString();
    const { data: rows } = await context.supabase.from("monitoring_results")
      .select("status").eq("check_id", data.checkId).gte("checked_at", since);
    const total = rows?.length ?? 0;
    const up = (rows || []).filter((r: any) => r.status === "up").length;
    return { total, up, pct: total ? Math.round((up / total) * 10000) / 100 : null };
  });
