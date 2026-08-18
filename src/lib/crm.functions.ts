import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const LEAD_STATUSES = [
  "new", "contacted", "qualified", "proposal", "negotiation", "won", "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

async function requireStaff(ctx: { supabase: any; userId: string }) {
  const { data: ok, error } = await ctx.supabase.rpc("has_any_role", { _user_id: ctx.userId });
  if (error) throw new Error(error.message);
  if (!ok) throw new Error("Your account needs a staff role to perform this action.");
}

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { data, error } = await context.supabase
      .from("leads")
      .select("*, customer:customers(id, account_number, company_name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const open = rows.filter((r) => !["won", "lost"].includes(r.status));
    const stats = {
      total: rows.length,
      open: open.length,
      won: rows.filter((r) => r.status === "won").length,
      lost: rows.filter((r) => r.status === "lost").length,
      pipelineValue: open.reduce((s, r) => s + Number(r.estimated_value || 0), 0),
      wonValue: rows.filter((r) => r.status === "won").reduce((s, r) => s + Number(r.estimated_value || 0), 0),
      followUpsDue: open.filter((r) => r.next_follow_up && new Date(r.next_follow_up).getTime() <= Date.now()).length,
    };
    return { leads: rows, stats };
  });

export const upsertLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    company_name: string;
    contact_name?: string;
    title?: string;
    email?: string;
    phone?: string;
    source?: string;
    status?: string;
    interest?: string;
    estimated_value?: number;
    currency?: string;
    assigned_to?: string | null;
    next_follow_up?: string | null;
    notes?: string;
    lost_reason?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    if (!data.company_name?.trim()) throw new Error("Company name is required");
    const payload = {
      company_name: data.company_name.trim(),
      contact_name: data.contact_name?.trim() || null,
      title: data.title?.trim() || null,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      source: data.source || "manual",
      status: data.status || "new",
      interest: data.interest?.trim() || null,
      estimated_value: Number(data.estimated_value) || 0,
      currency: data.currency || "USD",
      assigned_to: data.assigned_to || null,
      next_follow_up: data.next_follow_up || null,
      notes: data.notes?.trim() || null,
      lost_reason: data.lost_reason?.trim() || null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("leads").update(payload as any).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("leads").insert({ ...payload, created_by: context.userId } as any).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const setLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: string; lost_reason?: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    if (!LEAD_STATUSES.includes(data.status as LeadStatus)) throw new Error("Unknown lead status");
    const { error } = await context.supabase.from("leads").update({
      status: data.status,
      lost_reason: data.status === "lost" ? (data.lost_reason?.trim() || null) : null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Convert a qualified lead into a real customer account. */
export const convertLeadToCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: lead, error } = await context.supabase
      .from("leads").select("*").eq("id", data.id).single();
    if (error || !lead) throw new Error(error?.message ?? "Lead not found");
    if (lead.converted_customer_id) throw new Error("This lead has already been converted");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acct, error: acctErr } = await supabaseAdmin.rpc("gen_customer_account_number");
    if (acctErr) throw new Error(acctErr.message);

    const { data: customer, error: custErr } = await supabaseAdmin.from("customers").insert({
      account_number: acct,
      company_name: lead.company_name,
      primary_email: lead.email,
      primary_phone: lead.phone,
      status: "active",
      created_by: context.userId,
    } as any).select("*").single();
    if (custErr) throw new Error(custErr.message);

    if (lead.contact_name) {
      await supabaseAdmin.from("customer_contacts").insert({
        customer_id: customer.id,
        account_number: customer.account_number,
        name: lead.contact_name,
        title: lead.title,
        email: lead.email,
        phone: lead.phone,
        is_primary: true,
      } as any);
    }

    await context.supabase.from("leads").update({
      status: "won",
      converted_customer_id: customer.id,
      converted_at: new Date().toISOString(),
    }).eq("id", lead.id);

    const { recordCustomerEvent } = await import("./customer-events.server");
    await recordCustomerEvent(supabaseAdmin, {
      customer_id: customer.id,
      account_number: customer.account_number,
      event_type: "lead_converted",
      title: `Converted from lead · ${lead.company_name}`,
      description: lead.interest ? `Interest: ${lead.interest}` : null,
      module: "crm",
      entity_type: "leads",
      entity_id: lead.id,
      major: true,
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
    });

    return { ok: true, customer };
  });
