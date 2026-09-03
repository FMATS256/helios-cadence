// Server-only support-desk helpers: SLA policy, recipient resolution and the
// notification fan-out used by the ticket workflow (Block 4).
import { notify } from "./notify.server";
import { recordCustomerEvent } from "./customer-events.server";

export const SITE_URL = "https://management.imtsolutions.co.zw";

export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Hours until first-response SLA for a given priority. */
export function slaHoursFor(priority?: string | null) {
  switch (String(priority || "normal").toLowerCase()) {
    case "critical":
      return 4;
    case "high":
      return 8;
    case "low":
      return 48;
    default:
      return 24;
  }
}

export function slaDueFrom(priority?: string | null, from: Date = new Date()) {
  const d = new Date(from);
  d.setHours(d.getHours() + slaHoursFor(priority));
  return d.toISOString();
}

export async function requireStaffCtx(ctx: { supabase: any; userId: string }) {
  const { data: hasRole, error } = await ctx.supabase.rpc("has_any_role", { _user_id: ctx.userId });
  if (error) throw new Error(error.message);
  if (!hasRole) throw new Error("Your account needs a staff role to perform this action.");
}

export async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function loadTicket(db: any, ticketId: string) {
  const { data, error } = await db.from("tickets").select("*").eq("id", ticketId).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Ticket not found");
  return data;
}

export async function loadCustomerBrief(db: any, customerId: string) {
  const { data, error } = await db
    .from("customers")
    .select("id, account_number, company_name, primary_email")
    .eq("id", customerId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Customer not found");
  return data;
}

/** Best contact email for a customer: primary contact first, then the account email. */
export async function customerEmail(db: any, customer: any): Promise<string | null> {
  const { data: contact } = await db
    .from("customer_contacts")
    .select("email, is_primary")
    .eq("customer_id", customer.id)
    .is("archived_at", null)
    .not("email", "is", null)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (contact as any)?.email || customer.primary_email || null;
}

export async function staffProfile(db: any, userId?: string | null) {
  if (!userId) return null;
  const { data } = await db.from("profiles").select("id, full_name, email").eq("id", userId).maybeSingle();
  return (data as any) ?? null;
}

/** In-app notification row; never throws. */
export async function pushNotification(
  db: any,
  userId: string | null | undefined,
  kind: string,
  title: string,
  body: string,
  link: string,
) {
  if (!userId) return;
  try {
    await db.from("notifications").insert({ user_id: userId, kind, title, body, link } as any);
  } catch (e: any) {
    console.error("[pushNotification]", e?.message ?? e);
  }
}

/**
 * Email the customer about a ticket using the managed `ticket-update` template.
 * Never throws — support workflow must not fail because email is unavailable.
 */
export async function emailTicketUpdate(opts: {
  to: string | null | undefined;
  companyName?: string | null;
  ticket: any;
  updateNote?: string | null;
  agentName?: string | null;
  agentEmail?: string | null;
  idempotencySuffix: string;
}) {
  await notify(
    "ticket-update",
    opts.to,
    {
      companyName: opts.companyName || "there",
      ticketNumber: opts.ticket.ticket_number ?? opts.ticket.id,
      subject: opts.ticket.subject,
      status: opts.ticket.status,
      priority: opts.ticket.priority,
      updateNote: opts.updateNote ?? undefined,
      agentName: opts.agentName ?? undefined,
      ticketUrl: `${SITE_URL}/portal/tickets`,
    },
    `ticket-${opts.ticket.id}-${opts.idempotencySuffix}`,
    {
      fromName: opts.agentName ? `${opts.agentName} (IMT Support)` : "IMT Support",
      fromLocal: opts.agentEmail || "support",
      ...(opts.agentEmail ? { replyTo: opts.agentEmail } : {}),
    },
  );
}

/** Notify a technician by email + in-app that a ticket landed in their queue. */
export async function notifyTechnician(db: any, ticket: any, technicianId: string, note?: string) {
  const tech = await staffProfile(db, technicianId);
  const tnum = ticket.ticket_number ?? ticket.id;
  await pushNotification(
    db,
    technicianId,
    "ticket_assigned",
    `Ticket ${tnum} assigned to you`,
    `${ticket.subject} · ${String(ticket.priority || "normal").toUpperCase()} · SLA ${
      ticket.sla_due_at ? new Date(ticket.sla_due_at).toLocaleString() : "—"
    }`,
    `/tickets/${ticket.id}`,
  );
  if (tech?.email) {
    const { sendRawEmail } = await import("./customer360.server");
    await sendRawEmail({
      to: tech.email,
      subject: `[${tnum}] Assigned to you — ${ticket.subject}`,
      body: [
        `Hi ${tech.full_name || "there"},`,
        ``,
        `Ticket ${tnum} has been assigned to you.`,
        ``,
        `Customer:  ${ticket.account_number}`,
        `Subject:   ${ticket.subject}`,
        `Priority:  ${ticket.priority}`,
        `Status:    ${ticket.status}`,
        `SLA due:   ${ticket.sla_due_at ? new Date(ticket.sla_due_at).toLocaleString() : "—"}`,
        note ? `\nNote: ${note}` : "",
        ``,
        `Open the ticket: ${SITE_URL}/tickets/${ticket.id}`,
      ].join("\n"),
    }).catch((e: any) => console.error("[notifyTechnician]", e?.message ?? e));
  }
}

/** Timeline + audit entry for any ticket mutation. */
export async function logTicketEvent(
  db: any,
  ticket: any,
  ctx: { userId: string; email?: string | null },
  opts: {
    event_type: string;
    title: string;
    description?: string | null;
    old_value?: Record<string, any> | null;
    new_value?: Record<string, any> | null;
    major?: boolean;
  },
) {
  await recordCustomerEvent(db, {
    customer_id: ticket.customer_id,
    account_number: ticket.account_number,
    event_type: opts.event_type,
    title: opts.title,
    description: opts.description ?? null,
    module: "support",
    entity_type: "ticket",
    entity_id: ticket.id,
    old_value: opts.old_value ?? null,
    new_value: opts.new_value ?? null,
    metadata: { ticket_number: ticket.ticket_number ?? null },
    major: opts.major,
    actor_id: ctx.userId,
    actor_email: ctx.email ?? null,
  });
}

/** Bucket a ticket into a technician-queue lane. */
export function queueLane(t: any): "overdue" | "open" | "in_progress" | "waiting_customer" | "resolved" {
  const status = String(t.status || "open");
  const settled = status === "resolved" || status === "closed";
  if (!settled && t.sla_due_at && new Date(t.sla_due_at).getTime() < Date.now()) return "overdue";
  if (status === "in_progress") return "in_progress";
  if (status === "waiting_customer") return "waiting_customer";
  if (settled) return "resolved";
  return "open";
}
