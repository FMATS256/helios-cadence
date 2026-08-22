import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireStaff(ctx: { supabase: any; userId: string }) {
  const { data: ok, error } = await ctx.supabase.rpc("has_any_role", { _user_id: ctx.userId });
  if (error) throw new Error(error.message);
  if (!ok) throw new Error("Your account needs a staff role to perform this action.");
}

export const listAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string; customer_id?: string; mine?: boolean } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    let q = context.supabase
      .from("ops_alerts")
      .select("*, customer:customers(id, account_number, company_name)")
      .order("last_seen_at", { ascending: false })
      .limit(400);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.customer_id) q = q.eq("customer_id", data.customer_id);
    if (data.mine) q = q.eq("assigned_to", context.userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = [...new Set((rows ?? []).map((r: any) => r.assigned_to).filter(Boolean))] as string[];
    let names = new Map<string, string>();
    if (ids.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids);
      names = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]));
    }
    return (rows ?? []).map((r: any) => ({ ...r, assignee: r.assigned_to ? names.get(r.assigned_to) ?? null : null }));
  });

export const getAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: alert, error } = await context.supabase
      .from("ops_alerts")
      .select("*, customer:customers(id, account_number, company_name)")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: events } = await context.supabase
      .from("ops_alert_events")
      .select("*")
      .eq("alert_id", data.id)
      .order("created_at", { ascending: false });
    return { alert, events: events ?? [] };
  });

const NEXT_STATUS: Record<string, string> = {
  acknowledge: "acknowledged",
  investigate: "investigating",
  resolve: "resolved",
  reopen: "open",
};

export const alertAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string;
    action: "acknowledge" | "investigate" | "resolve" | "reopen" | "assign" | "note";
    note?: string;
    assigned_to?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: existing, error: exErr } = await context.supabase
      .from("ops_alerts").select("*").eq("id", data.id).single();
    if (exErr || !existing) throw new Error(exErr?.message ?? "Alert not found");

    const patch: any = {};
    const now = new Date().toISOString();

    if (data.action === "assign") {
      patch.assigned_to = data.assigned_to || null;
      if (existing.status === "open") patch.status = "acknowledged";
    } else if (data.action === "note") {
      // timeline only
    } else {
      const next = NEXT_STATUS[data.action];
      if (!next) throw new Error("Unknown alert action");
      patch.status = next;
      if (next === "acknowledged") { patch.acknowledged_by = context.userId; patch.acknowledged_at = now; }
      if (next === "resolved") {
        patch.resolved_by = context.userId;
        patch.resolved_at = now;
        patch.resolution = data.note?.trim() || "Resolved by engineer";
      }
      if (next === "open") { patch.resolved_at = null; patch.resolved_by = null; patch.resolution = null; }
    }

    let row = existing;
    if (Object.keys(patch).length) {
      const { data: updated, error } = await context.supabase
        .from("ops_alerts").update(patch).eq("id", data.id).select("*").single();
      if (error) throw new Error(error.message);
      row = updated;
    }

    await context.supabase.from("ops_alert_events").insert({
      alert_id: data.id,
      event_type: data.action,
      note: data.note?.trim() || null,
      actor_id: context.userId,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordAudit } = await import("./customer-events.server");
    await recordAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
      action: `alert_${data.action}`,
      entity_type: "ops_alerts",
      entity_id: data.id,
      account_number: existing.account_number ?? null,
      module: "operations",
      old_value: { status: existing.status, assigned_to: existing.assigned_to },
      new_value: patch,
    });

    if (data.action === "assign" && data.assigned_to) {
      await supabaseAdmin.from("notifications").insert({
        user_id: data.assigned_to,
        kind: "ops_alert",
        title: "Alert assigned to you",
        body: existing.title,
        link: "/alerts",
      } as any);
    }

    return row;
  });

export const runAlertEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { evaluateAlerts } = await import("./alerts.server");
    return evaluateAlerts(supabaseAdmin);
  });

export const listAlertRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { data, error } = await context.supabase.from("alert_rules").select("*").order("source");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveAlertRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; threshold?: number | null; severity?: string; enabled?: boolean }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const patch: any = {};
    if (data.threshold !== undefined) patch.threshold = data.threshold;
    if (data.severity) patch.severity = data.severity;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    const { data: row, error } = await context.supabase
      .from("alert_rules").update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordAudit } = await import("./customer-events.server");
    await recordAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
      action: "alert_rule_updated",
      entity_type: "alert_rules",
      entity_id: data.id,
      module: "operations",
      new_value: patch,
    });
    return row;
  });
