import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { portfolioCustomerAllowed } from "./account-workspace.shared";
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

    const { data: callerRoles, error: roleError } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const { data: accessibleCustomer, error: accessError } = await context.supabase.from("customers").select("account_manager_id").eq("id", data.customer_id).is("archived_at", null).maybeSingle();
    if (roleError || accessError || !accessibleCustomer || !portfolioCustomerAllowed((callerRoles ?? []).map((r) => r.role), context.userId, accessibleCustomer.account_manager_id)) throw new Error("You can only dispatch technicians for accounts in your portfolio");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: customer, error: custErr } = await supabaseAdmin
      .from("customers").select("id, account_number, company_name, primary_email, primary_phone").eq("id", data.customer_id).single();
    if (custErr || !customer) throw new Error(custErr?.message ?? "Customer not found");

    // Attach the client's best contact address to the job so field staff and the
    // completion report always know where updates go.
    const { customerEmail } = await import("./support.server");
    const clientEmail = await customerEmail(supabaseAdmin, customer);

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
      site_contact_email: clientEmail,
      site_contact_phone: (customer as any).primary_phone ?? null,
      ticket_id: ticketId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);

    let assigneeName: string | null = null;
    if (data.assigned_to) {
      const { data: p } = await supabaseAdmin.from("profiles").select("full_name, email").eq("id", data.assigned_to).maybeSingle();
      assigneeName = (p as any)?.full_name || (p as any)?.email || null;
    }

    // Notify the assignee plus the technical operations desk whenever a job is
    // added to the system, so nothing sits unseen in the queue.
    const { data: techRoles } = await supabaseAdmin.from("user_roles").select("user_id")
      .in("role", ["technical_support", "cloud_engineer", "noc", "operations_manager", "master_admin"]);
    const recipients = Array.from(new Set([
      ...(data.assigned_to ? [data.assigned_to] : []),
      ...((techRoles ?? []).map((r: any) => r.user_id)),
    ].filter((id) => Boolean(id) && id !== context.userId)));
    if (recipients.length) {
      await supabaseAdmin.from("notifications").insert(recipients.map((id) => ({
        user_id: id,
        kind: data.assigned_to === id ? "task_assigned" : "job_created",
        title: `New work order · ${customer.company_name}`,
        body: `${data.title.trim()} · ${data.service_type} / ${data.task_type}${assigneeName ? ` · assigned to ${assigneeName}` : " · unassigned"}`,
        link: "/techops/dashboard",
      })) as any);
    }


    // Let the client know a job has been raised on their account.
    if (clientEmail) {
      try {
        const { notify } = await import("./notify.server");
        await notify("general-message", clientEmail, {
          subject: `Work order logged · ${data.title.trim()}`,
          recipientName: customer.company_name,
          message: `We have logged a ${String(data.task_type).replace(/_/g, " ")} job on your account.\n\n${data.title.trim()}${data.description?.trim() ? `\n\n${data.description.trim()}` : ""}\n\nOur technical team will be in touch with scheduling details.`,
          senderName: "IMT Technical Operations",
        }, `job-created-${(task as any)?.id}`);
      } catch { /* email is best-effort */ }
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
    // Ticket-style history: every status/assignment change is written to the job thread.
    const changes: string[] = [];
    if (patch.status && patch.status !== existing.status) changes.push(`Status changed to ${String(patch.status).replace(/_/g, " ")}`);
    if (data.assigned_to !== undefined && (patch.assigned_to ?? null) !== (existing.assigned_to ?? null)) changes.push(patch.assigned_to ? "Reassigned to another engineer" : "Returned to the team queue");
    if (changes.length) {
      await context.supabase.from("work_order_updates").insert({
        task_id: existing.id, author_id: context.userId, kind: "status",
        body: changes.join(" · ") + (data.completion_notes?.trim() ? `\n\n${data.completion_notes.trim()}` : ""),
      } as any);
      if (patch.status && patch.status !== existing.status && existing.requested_by && existing.requested_by !== context.userId) {
        await supabaseAdmin.from("notifications").insert({
          user_id: existing.requested_by, kind: "task_update",
          title: `Work order ${String(patch.status).replace(/_/g, " ")} · ${existing.title}`,
          body: data.completion_notes?.trim() || changes.join(" · "), link: `/techops/jobs/${existing.id}`,
        } as any);
      }
    }
    if (patch.assigned_to && patch.assigned_to !== existing.assigned_to) {
      await supabaseAdmin.from("notifications").insert({
        user_id: patch.assigned_to,
        kind: "task_assigned",
        title: "Technical task assigned to you",
        body: existing.title,
        link: "/techops/dashboard",
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

async function notifyPeople(ids: (string | null | undefined)[], exclude: string, n: { kind: string; title: string; body: string; link: string }) {
  const recipients = Array.from(new Set(ids.filter((id): id is string => Boolean(id) && id !== exclude)));
  if (!recipients.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("notifications").insert(recipients.map((user_id) => ({ user_id, ...n })) as any);
}

/** Engineer claims an unassigned team-queue job. Atomic: only succeeds while nobody owns it. */
export const claimServiceTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: row, error } = await context.supabase.from("service_tasks")
      .update({ assigned_to: context.userId, status: "assigned" } as any)
      .eq("id", data.id).is("assigned_to", null).in("status", ["pending", "assigned"])
      .select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("This job has already been claimed by another engineer.");
    const name = (context.claims as any)?.email ?? "An engineer";
    await context.supabase.from("work_order_updates").insert({ task_id: data.id, author_id: context.userId, kind: "claimed", body: "Claimed this job" } as any);
    await notifyPeople([(row as any).requested_by], context.userId, {
      kind: "task_assigned", title: `Work order claimed · ${(row as any).title}`, body: `${name} has taken this job.`, link: `/techops/jobs/${data.id}`,
    });
    return row;
  });

export const listWorkOrderUpdates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { task_id: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: rows, error } = await context.supabase.from("work_order_updates")
      .select("*").eq("task_id", data.task_id).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = [...new Set((rows ?? []).map((r: any) => r.author_id).filter(Boolean))] as string[];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = ids.length ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] as any[] };
    const map = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]));
    return (rows ?? []).map((r: any) => ({ ...r, author: map.get(r.author_id) ?? "Staff" }));
  });

export const addWorkOrderUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { task_id: string; body: string }) => {
    const body = String(input.body ?? "").trim();
    if (!body) throw new Error("Write an update first");
    if (body.length > 4000) throw new Error("Update is too long");
    return { task_id: input.task_id, body };
  })
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: task, error: tErr } = await context.supabase.from("service_tasks").select("id, title, assigned_to, requested_by").eq("id", data.task_id).single();
    if (tErr || !task) throw new Error("Work order not found");
    const { error } = await context.supabase.from("work_order_updates").insert({ task_id: data.task_id, author_id: context.userId, kind: "comment", body: data.body } as any);
    if (error) throw new Error(error.message);
    await notifyPeople([(task as any).assigned_to, (task as any).requested_by], context.userId, {
      kind: "task_update", title: `New update · ${(task as any).title}`, body: data.body.slice(0, 180), link: `/techops/jobs/${data.task_id}`,
    });
    return { ok: true };
  });
