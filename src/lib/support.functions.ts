import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  adminDb,
  customerEmail,
  emailTicketUpdate,
  loadCustomerBrief,
  loadTicket,
  logTicketEvent,
  notifyTechnician,
  pushNotification,
  queueLane,
  requireStaffCtx,
  slaDueFrom,
  staffProfile,
} from "./support.server";

/** Create a ticket: SLA stamped, customer emailed, technician notified, audited. */
export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    subject: string;
    description?: string;
    priority?: string;
    category?: string;
    assigned_to?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await requireStaffCtx(context);
    if (!data.customer_id) throw new Error("Customer is required");
    if (!data.subject?.trim()) throw new Error("Subject is required");

    const db = await adminDb();
    const customer = await loadCustomerBrief(db, data.customer_id);
    const priority = data.priority || "normal";

    const { data: ticket, error } = await db
      .from("tickets")
      .insert({
        customer_id: customer.id,
        account_number: customer.account_number,
        subject: data.subject.trim(),
        description: data.description?.trim() || null,
        priority,
        category: data.category?.trim() || null,
        assigned_to: data.assigned_to || null,
        status: "open",
        sla_due_at: slaDueFrom(priority),
        created_by: context.userId,
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const agent = await staffProfile(db, data.assigned_to);
    const to = await customerEmail(db, customer);

    await Promise.allSettled([
      emailTicketUpdate({
        to,
        companyName: customer.company_name,
        ticket,
        updateNote: data.description?.trim() || "We have logged your request and our team is on it.",
        agentName: agent?.full_name || agent?.email || null,
        agentEmail: agent?.email || null,
        idempotencySuffix: "created",
      }),
      data.assigned_to ? notifyTechnician(db, ticket, data.assigned_to) : Promise.resolve(),
      logTicketEvent(db, ticket, { userId: context.userId, email: context.claims?.email }, {
        event_type: "ticket_created",
        title: `Ticket ${ticket.ticket_number} opened`,
        description: `${ticket.subject} · ${priority}`,
        new_value: { status: "open", priority, assigned_to: data.assigned_to ?? null },
        major: true,
      }),
      db.from("communications").insert({
        customer_id: customer.id,
        account_number: customer.account_number,
        channel: "email",
        direction: "outbound",
        subject: `Ticket ${ticket.ticket_number}: ${ticket.subject}`,
        body: data.description?.trim() || "Ticket acknowledgement sent to the customer.",
        recipient: to,
        sent_at: new Date().toISOString(),
        status: to ? "sent" : "skipped",
        created_by: context.userId,
      } as any),
    ]);

    return ticket;
  });

/** Assign or reassign a ticket. Notifies the new technician and the customer. */
export const assignTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticket_id: string; assigned_to: string | null; note?: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaffCtx(context);
    const db = await adminDb();
    const before = await loadTicket(db, data.ticket_id);
    if (before.assigned_to === data.assigned_to) return before;

    const { data: ticket, error } = await db
      .from("tickets")
      .update({ assigned_to: data.assigned_to, updated_at: new Date().toISOString() } as any)
      .eq("id", data.ticket_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const agent = await staffProfile(db, data.assigned_to);
    const customer = await loadCustomerBrief(db, ticket.customer_id);
    const to = await customerEmail(db, customer);

    await Promise.allSettled([
      data.assigned_to ? notifyTechnician(db, ticket, data.assigned_to, data.note) : Promise.resolve(),
      emailTicketUpdate({
        to,
        companyName: customer.company_name,
        ticket,
        updateNote: agent
          ? `${agent.full_name || agent.email} is now handling your request.`
          : "Your request has returned to the support queue.",
        agentName: agent?.full_name || agent?.email || null,
        agentEmail: agent?.email || null,
        idempotencySuffix: `assigned-${data.assigned_to ?? "none"}`,
      }),
      logTicketEvent(db, ticket, { userId: context.userId, email: context.claims?.email }, {
        event_type: "ticket_assigned",
        title: `Ticket ${ticket.ticket_number} assigned`,
        description: agent ? `Assigned to ${agent.full_name || agent.email}` : "Unassigned",
        old_value: { assigned_to: before.assigned_to },
        new_value: { assigned_to: data.assigned_to },
        major: false,
      }),
    ]);

    return ticket;
  });

/** Update status / priority. Emails the customer on every meaningful change. */
export const updateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    ticket_id: string;
    status?: string;
    priority?: string;
    category?: string | null;
    note?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    await requireStaffCtx(context);
    const db = await adminDb();
    const before = await loadTicket(db, data.ticket_id);

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (data.status && data.status !== before.status) {
      patch.status = data.status;
      patch.resolved_at =
        data.status === "resolved" || data.status === "closed"
          ? before.resolved_at ?? new Date().toISOString()
          : null;
    }
    if (data.priority && data.priority !== before.priority) {
      patch.priority = data.priority;
      if (!["resolved", "closed"].includes(String(patch.status ?? before.status))) {
        patch.sla_due_at = slaDueFrom(data.priority, new Date(before.created_at));
      }
    }
    if (data.category !== undefined) patch.category = data.category?.trim() || null;
    if (Object.keys(patch).length === 1) return before;

    const { data: ticket, error } = await db
      .from("tickets")
      .update(patch as any)
      .eq("id", data.ticket_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const customer = await loadCustomerBrief(db, ticket.customer_id);
    const to = await customerEmail(db, customer);
    const agent = await staffProfile(db, ticket.assigned_to);
    const statusChanged = Boolean(patch.status);

    await Promise.allSettled([
      statusChanged
        ? emailTicketUpdate({
            to,
            companyName: customer.company_name,
            ticket,
            updateNote:
              data.note?.trim() ||
              (ticket.status === "resolved"
                ? "Your request has been resolved. Reply to this ticket if anything is still outstanding."
                : ticket.status === "waiting_customer"
                  ? "We need a little more information from you to continue."
                  : `Status updated to ${ticket.status}.`),
            agentName: agent?.full_name || agent?.email || null,
        agentEmail: agent?.email || null,
            idempotencySuffix: `status-${ticket.status}-${ticket.updated_at}`,
          })
        : Promise.resolve(),
      logTicketEvent(db, ticket, { userId: context.userId, email: context.claims?.email }, {
        event_type:
          ticket.status === "resolved" || ticket.status === "closed" ? "ticket_closed" : "ticket_updated",
        title: `Ticket ${ticket.ticket_number} ${statusChanged ? ticket.status : "updated"}`,
        description: data.note?.trim() || null,
        old_value: { status: before.status, priority: before.priority },
        new_value: { status: ticket.status, priority: ticket.priority },
        major: statusChanged,
      }),
    ]);

    return ticket;
  });

/** Post a reply (emailed to the customer) or an internal note (staff only). */
export const postTicketMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticket_id: string; body: string; is_internal?: boolean }) => input)
  .handler(async ({ data, context }) => {
    await requireStaffCtx(context);
    if (!data.body?.trim()) throw new Error("Message is required");
    const db = await adminDb();
    const ticket = await loadTicket(db, data.ticket_id);

    const { data: msg, error } = await db
      .from("ticket_messages")
      .insert({
        ticket_id: ticket.id,
        author_id: context.userId,
        body: data.body.trim(),
        is_internal: Boolean(data.is_internal),
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (!data.is_internal) {
      const customer = await loadCustomerBrief(db, ticket.customer_id);
      // Base44 tickets: reply to the person who raised it (stored in the description).
      const desc = String(ticket.description || "");
      const reqLine = desc.match(/Requested by:([^\n]*)/i)?.[1] ?? "";
      const requesterEmail = reqLine.match(/[^\s·<>]+@[^\s·<>]+\.[^\s·<>]+/)?.[0] ?? null;
      const to = requesterEmail || (await customerEmail(db, customer));
      const agent = await staffProfile(db, context.userId);
      await Promise.allSettled([
        emailTicketUpdate({
          to,
          companyName: customer.company_name,
          ticket,
          updateNote: data.body.trim(),
          agentName: agent?.full_name || agent?.email || null,
          agentEmail: agent?.email || null,
          idempotencySuffix: `msg-${msg.id}`,
        }),
        db.from("communications").insert({
          customer_id: customer.id,
          account_number: customer.account_number,
          channel: "email",
          direction: "outbound",
          subject: `Ticket ${ticket.ticket_number}: ${ticket.subject}`,
          body: data.body.trim(),
          recipient: to,
          sent_at: new Date().toISOString(),
          status: to ? "sent" : "skipped",
          created_by: context.userId,
        } as any),
        logTicketEvent(db, ticket, { userId: context.userId, email: agent?.email }, {
          event_type: "ticket_reply",
          title: `Reply sent on ${ticket.ticket_number ?? "ticket"}`,
          description: `${to ? `To ${to}: ` : "No recipient email: "}${data.body.trim().slice(0, 300)}`,
        }),
      ]);
      return { ...msg, recipient: to };
    }

    if (ticket.assigned_to && ticket.assigned_to !== context.userId) {
      await pushNotification(
        db,
        ticket.assigned_to,
        "ticket_update",
        `New ${data.is_internal ? "note" : "reply"} on ${ticket.ticket_number}`,
        data.body.trim().slice(0, 160),
        `/tickets/${ticket.id}`,
      );
    }

    return msg;
  });

/** Technician queue: lanes + SLA state. `scope: "all"` for supervisors. */
export const getSupportQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { scope?: "mine" | "all" | "unassigned" } = {}) => input)
  .handler(async ({ data, context }) => {
    await requireStaffCtx(context);
    const db = await adminDb();
    const scope = data?.scope ?? "all";

    let q = db
      .from("tickets")
      .select("*")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (scope === "mine") q = q.eq("assigned_to", context.userId);
    if (scope === "unassigned") q = q.is("assigned_to", null);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const tickets = (rows ?? []) as any[];

    const assigneeIds = [...new Set(tickets.map((t) => t.assigned_to).filter(Boolean))];
    const custIds = [...new Set(tickets.map((t) => t.customer_id).filter(Boolean))];
    const [profilesR, custR] = await Promise.all([
      assigneeIds.length
        ? db.from("profiles").select("id, full_name, email").in("id", assigneeIds)
        : Promise.resolve({ data: [] }),
      custIds.length
        ? db.from("customers").select("id, account_number, company_name").in("id", custIds)
        : Promise.resolve({ data: [] }),
    ]);
    const byUser = new Map(((profilesR as any).data ?? []).map((p: any) => [p.id, p]));
    const byCust = new Map(((custR as any).data ?? []).map((c: any) => [c.id, c]));

    const enriched = tickets.map((t) => {
      const p: any = byUser.get(t.assigned_to);
      const c: any = byCust.get(t.customer_id);
      return {
        ...t,
        lane: queueLane(t),
        assignee_name: p ? p.full_name || p.email : null,
        customer_name: c?.company_name ?? null,
        sla_breached:
          !["resolved", "closed"].includes(String(t.status)) &&
          Boolean(t.sla_due_at) &&
          new Date(t.sla_due_at).getTime() < Date.now(),
      };
    });

    const count = (lane: string) => enriched.filter((t) => t.lane === lane).length;
    return {
      tickets: enriched,
      stats: {
        total: enriched.length,
        open: count("open"),
        in_progress: count("in_progress"),
        waiting_customer: count("waiting_customer"),
        resolved: count("resolved"),
        overdue: count("overdue"),
        unassigned: enriched.filter((t) => !t.assigned_to && !["resolved", "closed"].includes(String(t.status))).length,
        critical: enriched.filter(
          (t) => ["critical", "urgent"].includes(String(t.priority)) && !["resolved", "closed"].includes(String(t.status)),
        ).length,
      },
    };
  });
