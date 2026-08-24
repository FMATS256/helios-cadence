import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** SOC overview: live posture signals + incident queue. */
export const socOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { buildPosture } = await import("./soc.server");
    const [posture, incidentsRes, profilesRes] = await Promise.all([
      buildPosture(context.supabase),
      context.supabase
        .from("security_incidents")
        .select("id,title,category,severity,status,source,detected_at,contained_at,resolved_at,assigned_to,customer_id,account_number,impact,created_at")
        .order("detected_at", { ascending: false })
        .limit(200),
      context.supabase.from("profiles").select("id,full_name,email"),
    ]);

    const nameById = new Map<string, string>();
    for (const p of (profilesRes.data ?? []) as any[]) nameById.set(p.id, p.full_name || p.email || "Unknown");

    const incidents = ((incidentsRes.data ?? []) as any[]).map((i) => ({
      ...i,
      assignee: i.assigned_to ? (nameById.get(i.assigned_to) ?? "Unknown") : null,
    }));

    const openStates = ["open", "investigating", "contained"];
    return {
      ...posture,
      incidents,
      staff: ((profilesRes.data ?? []) as any[]).map((p) => ({ id: p.id, name: p.full_name || p.email })),
      stats: {
        open: incidents.filter((i) => openStates.includes(i.status)).length,
        critical: incidents.filter((i) => i.severity === "critical" && openStates.includes(i.status)).length,
        investigating: incidents.filter((i) => i.status === "investigating").length,
        contained: incidents.filter((i) => i.status === "contained").length,
        resolved30d: incidents.filter(
          (i) => i.resolved_at && Date.now() - new Date(i.resolved_at).getTime() < 30 * 86_400_000,
        ).length,
      },
    };
  });

/** Full incident record with its timeline. */
export const getIncident = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const [incRes, evRes, profilesRes] = await Promise.all([
      context.supabase.from("security_incidents").select("*").eq("id", data.id).single(),
      context.supabase
        .from("security_incident_events")
        .select("*")
        .eq("incident_id", data.id)
        .order("created_at", { ascending: false }),
      context.supabase.from("profiles").select("id,full_name,email"),
    ]);
    if (incRes.error) throw new Error(incRes.error.message);
    const nameById = new Map<string, string>();
    for (const p of (profilesRes.data ?? []) as any[]) nameById.set(p.id, p.full_name || p.email || "Unknown");
    const { INCIDENT_FLOW } = await import("./soc.server");
    return {
      incident: {
        ...incRes.data,
        assignee: (incRes.data as any).assigned_to ? nameById.get((incRes.data as any).assigned_to) ?? "Unknown" : null,
      },
      events: ((evRes.data ?? []) as any[]).map((e) => ({
        ...e,
        actor: e.actor_id ? (nameById.get(e.actor_id) ?? e.actor_email ?? "Unknown") : (e.actor_email ?? "System"),
      })),
      nextStates: INCIDENT_FLOW[String((incRes.data as any).status)] ?? [],
    };
  });

/** Raise a new security incident. */
export const createIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    title: string;
    description?: string;
    category?: string;
    severity?: string;
    source?: string;
    customer_id?: string | null;
    affected_asset?: string | null;
    impact?: string | null;
  }) => {
    if (!input?.title?.trim()) throw new Error("A title is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("security_incidents")
      .insert({
        title: data.title.trim(),
        description: data.description ?? null,
        category: data.category ?? "other",
        severity: data.severity ?? "medium",
        source: data.source ?? "manual",
        customer_id: data.customer_id ?? null,
        affected_asset: data.affected_asset ?? null,
        impact: data.impact ?? null,
        status: "open",
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("security_incident_events").insert({
      incident_id: (row as any).id,
      event_type: "opened",
      note: data.description ?? null,
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordAudit } = await import("./customer-events.server");
    await recordAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      action: "security_incident_opened",
      entity_type: "security_incident",
      entity_id: (row as any).id,
      module: "soc",
      new_value: { title: data.title, severity: data.severity ?? "medium" },
    });

    return row;
  });

/** Move an incident through its lifecycle, assign it, or add a note. */
export const incidentAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string;
    action: "note" | "assign" | "status";
    note?: string;
    assigned_to?: string | null;
    status?: string;
    root_cause?: string;
    remediation?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { INCIDENT_FLOW } = await import("./soc.server");
    const { data: current, error: curErr } = await context.supabase
      .from("security_incidents").select("id,status,title").eq("id", data.id).single();
    if (curErr || !current) throw new Error(curErr?.message ?? "Incident not found");

    const patch: Record<string, unknown> = {};
    let eventType = "note";

    if (data.action === "assign") {
      patch.assigned_to = data.assigned_to ?? null;
      eventType = data.assigned_to ? "assigned" : "unassigned";
    }

    if (data.action === "status") {
      const next = String(data.status);
      const allowed = INCIDENT_FLOW[String((current as any).status)] ?? [];
      if (!allowed.includes(next)) {
        throw new Error(`Cannot move an incident from ${(current as any).status} to ${next}.`);
      }
      patch.status = next;
      eventType = next;
      if (next === "contained") patch.contained_at = new Date().toISOString();
      if (next === "resolved" || next === "closed") patch.resolved_at = new Date().toISOString();
      if (data.root_cause) patch.root_cause = data.root_cause;
      if (data.remediation) patch.remediation = data.remediation;
      if ((next === "resolved" || next === "closed") && !data.root_cause && !(patch as any).root_cause) {
        // Root cause is required to close out an incident.
        const { data: existing } = await context.supabase
          .from("security_incidents").select("root_cause").eq("id", data.id).single();
        if (!(existing as any)?.root_cause) throw new Error("Record a root cause before resolving or closing.");
      }
    }

    if (Object.keys(patch).length) {
      const { error } = await context.supabase.from("security_incidents").update(patch as any).eq("id", data.id);
      if (error) throw new Error(error.message);
    }

    await context.supabase.from("security_incident_events").insert({
      incident_id: data.id,
      event_type: eventType,
      note: data.note ?? null,
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordAudit } = await import("./customer-events.server");
    await recordAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      action: `security_incident_${eventType}`,
      entity_type: "security_incident",
      entity_id: data.id,
      module: "soc",
      new_value: { ...patch, note: data.note ?? null },
    });

    return { ok: true };
  });

/** Convert a posture signal into a tracked incident. */
export const escalatePostureSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string; label: string; severity?: string; detail?: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("security_incidents")
      .insert({
        title: `${data.label} requires remediation`,
        description: data.detail ?? null,
        category: "posture",
        severity: data.severity === "critical" ? "critical" : data.severity === "high" ? "high" : "medium",
        source: `posture:${data.key}`,
        status: "open",
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("security_incident_events").insert({
      incident_id: (row as any).id,
      event_type: "opened",
      note: `Escalated from security posture signal "${data.key}".`,
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
    });

    return row;
  });
