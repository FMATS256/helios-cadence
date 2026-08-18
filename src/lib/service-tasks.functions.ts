import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TASK_STATUSES, type TaskStatus } from "./service-tasks.shared";

async function requireStaff(ctx: { supabase: any; userId: string }) {
  const { data: ok, error } = await ctx.supabase.rpc("has_any_role", { _user_id: ctx.userId });
  if (error) throw new Error(error.message);
  if (!ok) throw new Error("Your account needs a staff role to perform this action.");
}

async function hydratePeople(rows: any[]) {
  const ids = [...new Set(rows.flatMap((r) => [r.assigned_to, r.requested_by]).filter(Boolean))] as string[];
  if (!ids.length) return rows.map((r) => ({ ...r, assignee: null, requester: null }));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids);
  const map = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]));
  return rows.map((r) => ({
    ...r,
    assignee: r.assigned_to ? map.get(r.assigned_to) ?? null : null,
    requester: r.requested_by ? map.get(r.requested_by) ?? null : null,
  }));
}

export const listServiceTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id?: string; mine?: boolean } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    let q = context.supabase
      .from("service_tasks")
      .select("*, customer:customers(id, account_number, company_name)")
      .order("created_at", { ascending: false });
    if (data.customer_id) q = q.eq("customer_id", data.customer_id);
    if (data.mine) q = q.eq("assigned_to", context.userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return hydratePeople((rows ?? []) as any[]);
  });

export const createServiceTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    service_type: string;
    task_type: string;
    title: string;
    description?: string;
    priority?: string;
    assigned_to?: string | null;
    due_date?: string | null;
    scheduled_at?: string | null;
    subscription_id?: string | null;
    open_ticket?: boolean;
  }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    if (!data.customer_id) throw new Error("Customer is required");
    if (!data.title?.trim()) throw new Error("A short task title is required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: customer, error: custErr } = await supabaseAdmin
      .from("customers").select("id, account_number, company_name").eq("id", data.customer_id).single();
    if (custErr || !customer) throw new Error(custErr?.message ?? "Customer not found");

    let ticketId: string | null = null;
    if (data.open_ticket) {
      const { data: ticket } = await supabaseAdmin.from("tickets").insert({
        customer_id: customer.id,
        account_number: customer.account_number,
        subject: `[Technical] ${data.title.trim()}`,
        description: data.description?.trim() || null,
        priority: data.priority || "normal",
        category: data.service_type,
        assigned_to: data.assigned_to || null,
        status: "open",
        created_by: context.userId,
      } as any).select("id").single();
      ticketId = (ticket as any)?.id ?? null;
    }

    const { data: task, error } = await context.supabase.from("service_tasks").insert({
      customer_id: customer.id,
      account_number: customer.account_number,
      service_type: data.service_type || "general",
      task_type: data.task_type || "deployment",
      title: data.title.trim(),
      description: data.description?.trim() || null,
      priority: data.priority || "normal",
      status: data.assigned_to ? "assigned" : "pending",
      assigned_to: data.assigned_to || null,
      requested_by: context.userId,
      due_date: data.due_date || null,
      scheduled_at: data.scheduled_at || null,
      subscription_id: data.subscription_id || null,
      ticket_id: ticketId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);

    let assigneeName: string | null = null;
    if (data.assigned_to) {
      const { data: p } = await supabaseAdmin.from("profiles").select("full_name, email").eq("id", data.assigned_to).maybeSingle();
      assigneeName = (p as any)?.full_name || (p as any)?.email || null;
      await supabaseAdmin.from("notifications").insert({
        user_id: data.assigned_to,
        kind: "task_assigned",
        title: `New technical task · ${customer.company_name}`,
        body: data.title.trim(),
        link: "/work-orders",
      } as any);
    }

    const { recordCustomerEvent } = await import("./customer-events.server");
    await recordCustomerEvent(supabaseAdmin, {
      customer_id: customer.id,
      account_number: customer.account_number,
      event_type: "technical_task_created",
      title: `Technical task · ${data.title.trim()}`,
      description: `${data.service_type} · ${data.task_type}${assigneeName ? ` · assigned to ${assigneeName}` : " · unassigned"}`,
      module: "operations",
      entity_type: "service_tasks",
      entity_id: (task as any)?.id ?? null,
      major: true,
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
    });

    return task;
  });

export const updateServiceTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string;
    status?: string;
    assigned_to?: string | null;
    priority?: string;
    due_date?: string | null;
    scheduled_at?: string | null;
    completion_notes?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: existing, error: exErr } = await context.supabase
      .from("service_tasks").select("*").eq("id", data.id).single();
    if (exErr || !existing) throw new Error(exErr?.message ?? "Task not found");
    if (data.status && !TASK_STATUSES.includes(data.status as TaskStatus)) throw new Error("Unknown task status");
    if (existing.status === "completed" && data.status && data.status !== "completed") {
      throw new Error("Completed tasks cannot be reopened — create a new task instead.");
    }

    const patch: any = {};
    if (data.priority) patch.priority = data.priority;
    if (data.due_date !== undefined) patch.due_date = data.due_date || null;
    if (data.scheduled_at !== undefined) patch.scheduled_at = data.scheduled_at || null;
    if (data.completion_notes !== undefined) patch.completion_notes = data.completion_notes?.trim() || null;
    if (data.assigned_to !== undefined) {
      patch.assigned_to = data.assigned_to || null;
      if (data.assigned_to && existing.status === "pending") patch.status = "assigned";
    }
    if (data.status) {
      patch.status = data.status;
      if (data.status === "in_progress" && !existing.started_at) patch.started_at = new Date().toISOString();
      if (data.status === "completed") patch.completed_at = new Date().toISOString();
      if (data.status === "assigned" && !(data.assigned_to ?? existing.assigned_to)) {
        throw new Error("Assign a technician before setting the task to assigned.");
      }
    }

    const { data: row, error } = await context.supabase
      .from("service_tasks").update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (patch.assigned_to && patch.assigned_to !== existing.assigned_to) {
      await supabaseAdmin.from("notifications").insert({
        user_id: patch.assigned_to,
        kind: "task_assigned",
        title: "Technical task assigned to you",
        body: existing.title,
        link: "/work-orders",
      } as any);
    }
    if (existing.customer_id && (patch.status || patch.assigned_to !== undefined)) {
      const { recordCustomerEvent } = await import("./customer-events.server");
      await recordCustomerEvent(supabaseAdmin, {
        customer_id: existing.customer_id,
        account_number: existing.account_number ?? "",
        event_type: "technical_task_updated",
        title: `Technical task ${patch.status ?? existing.status} · ${existing.title}`,
        description: data.completion_notes?.trim() || null,
        module: "operations",
        entity_type: "service_tasks",
        entity_id: existing.id,
        major: patch.status === "completed",
        actor_id: context.userId,
        actor_email: context.claims?.email ?? null,
      });
    }
    return row;
  });
