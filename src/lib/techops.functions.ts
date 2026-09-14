import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireStaff(ctx: { supabase: any; userId: string }) {
  const { data: ok, error } = await ctx.supabase.rpc("has_any_role", { _user_id: ctx.userId });
  if (error) throw new Error(error.message);
  if (!ok) throw new Error("Your account needs a staff role to perform this action.");
}

/* ---------------------------------------------------------------------------
 * Technician dashboard
 * -------------------------------------------------------------------------*/

export const technicianDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { scope?: "mine" | "team" } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const uid = context.userId;
    const mine = data.scope !== "team";
    const sb = context.supabase;
    const soon = new Date(Date.now() + 7 * 864e5).toISOString();

    const [jobsRes, alertsRes, checksRes, serversRes, ticketsRes, equipRes, incidentsRes, autoRes] =
      await Promise.all([
        sb.from("service_tasks")
          .select("*, customer:customers(id, account_number, company_name)")
          .neq("status", "cancelled")
          .order("scheduled_at", { ascending: true, nullsFirst: false })
          .limit(300),
        sb.from("ops_alerts")
          .select("id, title, severity, status, source, detail, assigned_to, last_seen_at, account_number")
          .neq("status", "resolved")
          .order("last_seen_at", { ascending: false })
          .limit(100),
        sb.from("monitoring_checks").select("id, name, status, target, last_error").eq("enabled", true).is("archived_at", null),
        sb.from("cloud_servers").select("id, name, status, power_state, provider, last_synced_at").is("archived_at", null),
        sb.from("tickets")
          .select("id, ticket_number, subject, status, priority, assigned_to, created_at, customer:customers(company_name)")
          .not("status", "in", "(closed,resolved)")
          .order("created_at", { ascending: false })
          .limit(100),
        sb.from("job_equipment")
          .select("id, description, quantity, status, technician_id, task_id")
          .in("status", ["reserved", "issued"])
          .limit(200),
        sb.from("monitoring_incidents").select("id, check_id, severity, started_at, acknowledged_at").is("ended_at", null),
        sb.from("automation_runs").select("id, rule, status, error, created_at").order("created_at", { ascending: false }).limit(20),
      ]);

    const allJobs = (jobsRes.data ?? []) as any[];
    const jobs = mine ? allJobs.filter((j) => j.assigned_to === uid) : allJobs;
    const openJobs = jobs.filter((j) => j.status !== "completed");

    const alerts = (alertsRes.data ?? []) as any[];
    const servers = (serversRes.data ?? []) as any[];
    const checks = (checksRes.data ?? []) as any[];
    const tickets = ((ticketsRes.data ?? []) as any[]).filter((t) => (mine ? t.assigned_to === uid : true));
    const equipment = ((equipRes.data ?? []) as any[]).filter((e) => (mine ? e.technician_id === uid : true));
    const failedAutomation = ((autoRes.data ?? []) as any[]).filter((r) => r.error || r.status === "error");

    return {
      scope: mine ? "mine" : "team",
      jobs: openJobs.slice(0, 60),
      unassigned: allJobs.filter((j) => !j.assigned_to && j.status === "pending").slice(0, 20),
      upcoming: openJobs
        .filter((j) => j.scheduled_at && j.scheduled_at <= soon)
        .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))
        .slice(0, 15),
      alerts: alerts.slice(0, 25),
      tickets: tickets.slice(0, 20),
      equipment,
      failedAutomation,
      stats: {
        my_jobs: openJobs.length,
        in_progress: openJobs.filter((j) => j.status === "in_progress").length,
        scheduled_7d: openJobs.filter((j) => j.scheduled_at && j.scheduled_at <= soon).length,
        unassigned: allJobs.filter((j) => !j.assigned_to && j.status === "pending").length,
        critical_alerts: alerts.filter((a) => a.severity === "critical").length,
        open_alerts: alerts.length,
        open_incidents: (incidentsRes.data ?? []).length,
        checks_down: checks.filter((c) => c.status === "down").length,
        checks_total: checks.length,
        servers_attention: servers.filter((s) => {
          const p = String(s.power_state ?? "").toLowerCase();
          return s.status !== "terminated" && ["off", "stopped", "error", "failed", "shutdown"].includes(p);
        }).length,
        servers_total: servers.length,
        open_tickets: tickets.length,
        equipment_out: equipment.reduce((n, e) => n + Number(e.quantity ?? 0), 0),
        failed_jobs: failedAutomation.length,
      },
    };
  });

/* ---------------------------------------------------------------------------
 * Job detail + site data
 * -------------------------------------------------------------------------*/

export const getJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { loadJob, signPhotoUrls } = await import("./techops.server");
    const bundle = await loadJob(context.supabase, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const ids = [...new Set([bundle.job.assigned_to, bundle.job.requested_by].filter(Boolean))] as string[];
    let people = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids);
      people = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]));
    }

    return {
      ...bundle,
      photos: await signPhotoUrls(supabaseAdmin, bundle.photos),
      contactEmail: bundle.job.site_contact_email
        || (bundle.job as any).customer?.email
        || null,
      assignee: bundle.job.assigned_to ? people.get(bundle.job.assigned_to) ?? null : null,
      requester: bundle.job.requested_by ? people.get(bundle.job.requested_by) ?? null : null,
    };
  });

export const updateJobDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string;
    site_name?: string | null;
    site_address?: string | null;
    site_contact_name?: string | null;
    site_contact_phone?: string | null;
    site_contact_email?: string | null;
    site_lat?: number | null;
    site_lng?: number | null;
    network_config?: string | null;
    installation_notes?: string | null;
    testing_notes?: string | null;
    geocode?: boolean;
  }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const patch: any = {};
    for (const k of ["site_name", "site_address", "site_contact_name", "site_contact_phone", "site_contact_email", "network_config", "installation_notes", "testing_notes"] as const) {
      if (data[k] !== undefined) patch[k] = data[k] || null;
    }
    for (const k of ["site_lat", "site_lng"] as const) {
      if (data[k] !== undefined) {
        const n = data[k];
        patch[k] = n === null || n === ("" as any) || !Number.isFinite(Number(n)) ? null : Number(n);
      }
    }

    // Only auto-geocode when we have no coordinates to work with.
    if (data.geocode && data.site_address && patch.site_lat == null) {
      try {
        const { resolveAddresses } = await import("./geocode.server");
        const hits = await resolveAddresses(context.supabase, [data.site_address], 1);
        const hit = hits.get(data.site_address.trim());
        if (hit) { patch.site_lat = hit.lat; patch.site_lng = hit.lng; }
      } catch { /* geocoding is best-effort */ }
    }


    const { data: row, error } = await context.supabase
      .from("service_tasks").update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordAudit } = await import("./customer-events.server");
    await recordAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
      action: "job_details_updated",
      entity_type: "service_tasks",
      entity_id: data.id,
      account_number: row.account_number,
      module: "operations",
      new_value: patch,
    });
    return row;
  });

/* ---------------------------------------------------------------------------
 * Requirements -> equipment plan
 * -------------------------------------------------------------------------*/

export const addJobRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { task_id: string; label: string; quantity?: number; category?: string; notes?: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    if (!data.label?.trim()) throw new Error("Describe the requirement");
    const { data: stock } = await context.supabase
      .from("inventory_items").select("id, name, sku, category, description, quantity").is("archived_at", null);
    const { matchStock } = await import("./techops.server");
    const match = matchStock(data.label, stock ?? []);

    const { data: row, error } = await context.supabase.from("job_requirements").insert({
      task_id: data.task_id,
      label: data.label.trim(),
      quantity: Math.max(1, Number(data.quantity ?? 1)),
      category: data.category || "equipment",
      notes: data.notes?.trim() || null,
      inventory_item_id: match?.id ?? null,
      created_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeJobRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { error } = await context.supabase.from("job_requirements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Turn every unfulfilled requirement into a reserved equipment allocation. */
export const buildEquipmentPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { task_id: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: reqs } = await context.supabase
      .from("job_requirements").select("*").eq("task_id", data.task_id).eq("fulfilled", false);
    if (!reqs?.length) throw new Error("No outstanding requirements to plan");

    const itemIds = reqs.map((r: any) => r.inventory_item_id).filter(Boolean) as string[];
    const stockMap = new Map<string, any>();
    const reservedElsewhere = new Map<string, number>();
    if (itemIds.length) {
      const [{ data: items }, { data: held }] = await Promise.all([
        context.supabase.from("inventory_items").select("id, name, sku, quantity").in("id", itemIds),
        // Kit already promised to other jobs and still sitting in the store.
        context.supabase
          .from("job_equipment")
          .select("inventory_item_id, quantity, task_id, status, stock_deducted")
          .in("inventory_item_id", itemIds)
          .in("status", ["reserved", "issued"])
          .eq("stock_deducted", false),
      ]);
      for (const i of items ?? []) stockMap.set(i.id, i);
      for (const h of (held ?? []) as any[]) {
        if (h.task_id === data.task_id) continue;
        reservedElsewhere.set(h.inventory_item_id, (reservedElsewhere.get(h.inventory_item_id) ?? 0) + Number(h.quantity ?? 0));
      }
    }

    const shortfalls: string[] = [];
    const rows = reqs.map((r: any) => {
      const item = r.inventory_item_id ? stockMap.get(r.inventory_item_id) : null;
      const need = Number(r.quantity ?? 1);
      if (item) {
        const held = reservedElsewhere.get(item.id) ?? 0;
        const available = Number(item.quantity ?? 0) - held;
        if (available < need) {
          shortfalls.push(
            `${r.label}: need ${need}, ${available < 0 ? 0 : available} available` +
              (held ? ` (${item.quantity} in stock, ${held} reserved for other jobs)` : ` of ${item.quantity} in stock`),
          );
        }
        reservedElsewhere.set(item.id, held + need);
      } else {
        shortfalls.push(`${r.label}: no matching stock item — procure or add to inventory`);
      }
      return {
        task_id: data.task_id,
        requirement_id: r.id,
        inventory_item_id: r.inventory_item_id,
        description: item ? `${item.name} (${item.sku})` : r.label,
        quantity: r.quantity,
        status: "reserved",
        created_by: context.userId,
      };
    });


    const { data: created, error } = await context.supabase.from("job_equipment").insert(rows as any).select("*");
    if (error) throw new Error(error.message);
    await context.supabase.from("job_requirements").update({ fulfilled: true } as any)
      .in("id", reqs.map((r: any) => r.id));

    return { allocated: created?.length ?? 0, shortfalls };
  });

export const allocateEquipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    task_id: string;
    inventory_item_id?: string | null;
    description: string;
    quantity?: number;
    serial_numbers?: string;
    technician_id?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    if (!data.description?.trim()) throw new Error("Describe the equipment");
    const { data: row, error } = await context.supabase.from("job_equipment").insert({
      task_id: data.task_id,
      inventory_item_id: data.inventory_item_id || null,
      description: data.description.trim(),
      quantity: Math.max(1, Number(data.quantity ?? 1)),
      serial_numbers: data.serial_numbers?.trim() || null,
      technician_id: data.technician_id || context.userId,
      status: "reserved",
      created_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

/**
 * Move an allocation through its lifecycle. Installing deducts stock once and
 * registers the hardware as a customer asset.
 */
export const updateEquipmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string;
    status: "reserved" | "issued" | "installed" | "returned" | "lost";
    serial_numbers?: string;
    notes?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: alloc, error: exErr } = await context.supabase
      .from("job_equipment").select("*").eq("id", data.id).single();
    if (exErr || !alloc) throw new Error(exErr?.message ?? "Allocation not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = { status: data.status };
    if (data.serial_numbers !== undefined) patch.serial_numbers = data.serial_numbers?.trim() || null;
    if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;

    const { data: job } = await context.supabase
      .from("service_tasks").select("id, customer_id, account_number, site_name, site_address, title").eq("id", alloc.task_id).single();

    // Deduct stock exactly once, when the kit leaves the store.
    if (["issued", "installed"].includes(data.status) && !alloc.stock_deducted && alloc.inventory_item_id) {
      const { data: item } = await supabaseAdmin
        .from("inventory_items").select("id, name, quantity").eq("id", alloc.inventory_item_id).single();
      if (item) {
        const next = Math.max(0, Number(item.quantity ?? 0) - Number(alloc.quantity ?? 1));
        await supabaseAdmin.from("inventory_items").update({ quantity: next } as any).eq("id", item.id);
        patch.stock_deducted = true;
      }
    }

    // Register installed hardware as a customer asset.
    if (data.status === "installed" && !alloc.asset_id && job?.customer_id) {
      const { data: asset } = await supabaseAdmin.from("assets").insert({
        customer_id: job.customer_id,
        account_number: job.account_number,
        asset_type: "network_equipment",
        make: alloc.description,
        model: alloc.description,
        serial_number: (data.serial_numbers ?? alloc.serial_numbers) || null,
        status: "deployed",
        location: job.site_name || job.site_address || null,
        notes: `Installed on job ${job.title}`,
        created_by: context.userId,
      } as any).select("id").maybeSingle();
      if (asset?.id) {
        patch.asset_id = asset.id;
        await supabaseAdmin.from("asset_lifecycle_events").insert({
          asset_id: asset.id,
          event_type: "deployed",
          notes: `Installed during job ${job.title}`,
          created_by: context.userId,
        } as any);
      }
    }

    // Returned stock goes back on the shelf.
    if (data.status === "returned" && alloc.stock_deducted && alloc.inventory_item_id) {
      const { data: item } = await supabaseAdmin
        .from("inventory_items").select("id, quantity").eq("id", alloc.inventory_item_id).single();
      if (item) {
        await supabaseAdmin.from("inventory_items")
          .update({ quantity: Number(item.quantity ?? 0) + Number(alloc.quantity ?? 1) } as any).eq("id", item.id);
        patch.stock_deducted = false;
      }
    }

    const { data: row, error } = await context.supabase
      .from("job_equipment").update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);

    const { recordAudit } = await import("./customer-events.server");
    await recordAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
      action: `job_equipment_${data.status}`,
      entity_type: "job_equipment",
      entity_id: data.id,
      account_number: job?.account_number ?? null,
      module: "operations",
      old_value: { status: alloc.status },
      new_value: patch,
    });
    return row;
  });

export const listEquipmentAllocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string; mine?: boolean } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    let q = context.supabase
      .from("job_equipment")
      .select("*, item:inventory_items(id, name, sku, quantity), task:service_tasks(id, title, status, account_number, site_name, customer_id)")
      .order("created_at", { ascending: false })
      .limit(400);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.mine) q = q.eq("technician_id", context.userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = [...new Set((rows ?? []).map((r: any) => r.technician_id).filter(Boolean))] as string[];
    let names = new Map<string, string>();
    if (ids.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids);
      names = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]));
    }
    return (rows ?? []).map((r: any) => ({ ...r, technician: r.technician_id ? names.get(r.technician_id) ?? null : null }));
  });

/* ---------------------------------------------------------------------------
 * Checklist
 * -------------------------------------------------------------------------*/

export const seedJobChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { task_id: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: job } = await context.supabase
      .from("service_tasks").select("id, task_type").eq("id", data.task_id).single();
    const { data: existing } = await context.supabase
      .from("job_checklist").select("id").eq("task_id", data.task_id).limit(1);
    if (existing?.length) throw new Error("This job already has a checklist");

    const { checklistFor } = await import("./techops.server");
    const rows = checklistFor(job?.task_type ?? "installation").map((label, i) => ({
      task_id: data.task_id, label, position: i, phase: "installation",
    }));
    const { data: created, error } = await context.supabase.from("job_checklist").insert(rows as any).select("*");
    if (error) throw new Error(error.message);
    return created;
  });

export const addChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { task_id: string; label: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    if (!data.label?.trim()) throw new Error("Describe the step");
    const { data: last } = await context.supabase
      .from("job_checklist").select("position").eq("task_id", data.task_id).order("position", { ascending: false }).limit(1);
    const { data: row, error } = await context.supabase.from("job_checklist").insert({
      task_id: data.task_id, label: data.label.trim(), position: Number(last?.[0]?.position ?? -1) + 1,
    } as any).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const toggleChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; done: boolean }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: row, error } = await context.supabase.from("job_checklist").update({
      done: data.done,
      done_at: data.done ? new Date().toISOString() : null,
      done_by: data.done ? context.userId : null,
    } as any).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

/* ---------------------------------------------------------------------------
 * Photos
 * -------------------------------------------------------------------------*/

export const uploadJobPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { task_id: string; filename: string; content_type: string; data_base64: string; caption?: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    if (!data.data_base64) throw new Error("No image data received");
    const binary = Uint8Array.from(atob(data.data_base64), (c) => c.charCodeAt(0));
    if (binary.byteLength > 8 * 1024 * 1024) throw new Error("Images must be 8 MB or smaller");

    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
    const path = `${data.task_id}/${Date.now()}-${safe}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage.from("job-photos")
      .upload(path, binary, { contentType: data.content_type || "image/jpeg", upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: row, error } = await context.supabase.from("job_photos").insert({
      task_id: data.task_id, storage_path: path, caption: data.caption?.trim() || null, uploaded_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);

    const { data: signed } = await supabaseAdmin.storage.from("job-photos").createSignedUrl(path, 3600);
    return { ...row, url: signed?.signedUrl ?? null };
  });

export const deleteJobPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: photo } = await context.supabase.from("job_photos").select("*").eq("id", data.id).single();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (photo?.storage_path) await supabaseAdmin.storage.from("job-photos").remove([photo.storage_path]);
    const { error } = await context.supabase.from("job_photos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------------------------------------------------------------
 * Sign-off + completion
 * -------------------------------------------------------------------------*/

export const captureSignoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    task_id: string;
    signed_by_name: string;
    signed_by_role?: string;
    signature_data?: string;
    satisfaction?: string;
    notes?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    if (!data.signed_by_name?.trim()) throw new Error("Capture the name of the person signing off");

    const { data: row, error } = await context.supabase.from("job_signoffs").insert({
      task_id: data.task_id,
      signed_by_name: data.signed_by_name.trim(),
      signed_by_role: data.signed_by_role?.trim() || null,
      signature_data: data.signature_data || null,
      satisfaction: data.satisfaction || null,
      notes: data.notes?.trim() || null,
      captured_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);

    await context.supabase.from("service_tasks")
      .update({ signed_off_at: new Date().toISOString() } as any).eq("id", data.task_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin
      .from("service_tasks").select("id, customer_id, account_number, title").eq("id", data.task_id).single();
    if (job?.customer_id) {
      const { recordCustomerEvent } = await import("./customer-events.server");
      await recordCustomerEvent(supabaseAdmin, {
        customer_id: job.customer_id,
        account_number: job.account_number ?? "",
        event_type: "job_signed_off",
        title: `Job signed off · ${job.title}`,
        description: `Signed by ${data.signed_by_name.trim()}`,
        module: "operations",
        entity_type: "service_tasks",
        entity_id: job.id,
        major: true,
        actor_id: context.userId,
        actor_email: context.claims?.email ?? null,
      });
    }
    return row;
  });

/** Close a job: validates the workflow, then emails the completion report. */
export const completeJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { task_id: string; completion_notes?: string; send_report?: boolean }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { loadJob, buildCompletionReport } = await import("./techops.server");
    const bundle = await loadJob(context.supabase, data.task_id);
    const { job, checklist, equipment, signoffs } = bundle;

    if (job.status === "completed") throw new Error("This job is already completed");
    const outstanding = checklist.filter((c: any) => !c.done);
    if (checklist.length && outstanding.length) {
      throw new Error(`${outstanding.length} checklist step(s) still outstanding`);
    }
    if (!signoffs.length) throw new Error("Capture the customer sign-off before completing the job");
    const stillReserved = equipment.filter((e: any) => e.status === "reserved");
    if (stillReserved.length) {
      throw new Error(`${stillReserved.length} equipment allocation(s) still marked reserved — issue, install or return them first`);
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await context.supabase.from("service_tasks").update({
      status: "completed",
      completed_at: now,
      completion_notes: data.completion_notes?.trim() || job.completion_notes || null,
    } as any).eq("id", data.task_id).select("*").single();
    if (error) throw new Error(error.message);

    const report = buildCompletionReport({
      job: { ...job, completed_at: now },
      checklist,
      equipment,
      signoff: signoffs[0] ?? null,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let emailed = false;
    const customerEmail = ((job as any).site_contact_email
      || (job as any).customer?.email) as string | undefined;
    if (data.send_report !== false && customerEmail) {
      const { notify } = await import("./notify.server");
      await notify("general-message", customerEmail, {
        subject: `Installation complete · ${job.title}`,
        recipientName: (job as any).site_contact_name || (job as any).customer?.company_name,
        message: `${report}\n\nThank you for choosing IMT Solutions. Reply to this email or open a ticket if anything needs attention.`,
        senderName: "IMT Technical Operations",
      }, `job-report-${job.id}`);
      emailed = true;
      await supabaseAdmin.from("service_tasks").update({ report_sent_at: now } as any).eq("id", job.id);
    }

    if (job.customer_id) {
      const { recordCustomerEvent } = await import("./customer-events.server");
      await recordCustomerEvent(supabaseAdmin, {
        customer_id: job.customer_id,
        account_number: job.account_number ?? "",
        event_type: "job_completed",
        title: `Job completed · ${job.title}`,
        description: data.completion_notes?.trim() || null,
        module: "operations",
        entity_type: "service_tasks",
        entity_id: job.id,
        metadata: { report_emailed: emailed },
        major: true,
        actor_id: context.userId,
        actor_email: context.claims?.email ?? null,
      });
    }

    return { job: updated, report, emailed };
  });

export const jobCompletionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { task_id: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { loadJob, buildCompletionReport } = await import("./techops.server");
    const b = await loadJob(context.supabase, data.task_id);
    return { report: buildCompletionReport({ job: b.job, checklist: b.checklist, equipment: b.equipment, signoff: b.signoffs[0] ?? null }) };
  });

export const listStockItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { data, error } = await context.supabase
      .from("inventory_items").select("id, name, sku, quantity, category").is("archived_at", null).order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
