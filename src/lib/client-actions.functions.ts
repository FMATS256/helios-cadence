import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireStaff(ctx: { supabase: any; userId: string }) {
  const { data: hasRole, error } = await ctx.supabase.rpc("has_any_role", { _user_id: ctx.userId });
  if (error) throw new Error(error.message);
  if (!hasRole) throw new Error("Your account needs a staff role to perform this action.");
}

async function loadCustomer(cid: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("customers").select("id, account_number, company_name, primary_email").eq("id", cid).single();
  if (error || !data) throw new Error(error?.message ?? "Customer not found");
  return data;
}

/** List staff who can be assigned tickets (technical/support/cloud/noc/master_admin). */
export const listAssignableStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id, role")
      .in("role", ["master_admin", "technical_support", "cloud_engineer", "noc", "operations_manager", "account_manager"]);
    const ids = [...new Set((roles ?? []).map((r: any) => r.user_id))];
    if (ids.length === 0) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("id, full_name, email").in("id", ids);
    return (profiles ?? []).map((p: any) => ({
      id: p.id, name: p.full_name || p.email, email: p.email,
      role: (roles ?? []).find((r: any) => r.user_id === p.id)?.role,
    }));
  });

/** Create a quote (with optional line items) scoped to a customer. */
export const createQuoteForCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    title: string;
    valid_until?: string | null;
    currency?: string;
    notes?: string;
    status?: string;
    items: Array<{ description: string; quantity: number; unit_price: number }>;
  }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    if (!data.customer_id) throw new Error("Customer is required");
    if (!data.title?.trim()) throw new Error("Title is required");
    const cust = await loadCustomer(data.customer_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const items = (data.items ?? []).filter((i) => i.description?.trim() && Number(i.quantity) > 0);
    const total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price || 0), 0);
    const { data: quote, error } = await supabaseAdmin.from("quotes").insert({
      customer_id: cust.id,
      account_number: cust.account_number,
      title: data.title.trim(),
      amount: total,
      currency: data.currency || "USD",
      status: data.status || "draft",
      valid_until: data.valid_until || null,
      notes: data.notes?.trim() || null,
      created_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);
    if (items.length) {
      const rows = items.map((i, idx) => ({
        quote_id: quote.id,
        description: i.description.trim(),
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price) || 0,
        position: idx,
      }));
      await supabaseAdmin.from("quote_line_items").insert(rows);
    }
    return quote;
  });

/** Create a support ticket scoped to a customer. */
export const createTicketForCustomer = createServerFn({ method: "POST" })
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
    await requireStaff(context);
    if (!data.customer_id) throw new Error("Customer is required");
    if (!data.subject?.trim()) throw new Error("Subject is required");
    const cust = await loadCustomer(data.customer_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket, error } = await supabaseAdmin.from("tickets").insert({
      customer_id: cust.id,
      account_number: cust.account_number,
      subject: data.subject.trim(),
      description: data.description?.trim() || null,
      priority: data.priority || "normal",
      category: data.category || null,
      assigned_to: data.assigned_to || null,
      status: "open",
      created_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);

    // Auto-log a communication entry against the primary contact so the ticket
    // shows up in the customer's communication timeline.
    try {
      const { data: contact } = await supabaseAdmin
        .from("customer_contacts")
        .select("id, name, email, phone, is_primary")
        .eq("customer_id", cust.id)
        .is("archived_at", null)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();
      let assigneeName: string | null = null;
      if (data.assigned_to) {
        const { data: p } = await supabaseAdmin
          .from("profiles").select("full_name, email").eq("id", data.assigned_to).maybeSingle();
        assigneeName = (p as any)?.full_name || (p as any)?.email || null;
      }
      const tnum = (ticket as any).ticket_number || (ticket as any).id;
      const summary = [
        `Ticket ${tnum} opened (${data.priority || "normal"}).`,
        assigneeName ? `Assigned to ${assigneeName}.` : "Unassigned.",
        data.description?.trim() ? `\n${data.description.trim()}` : "",
      ].filter(Boolean).join(" ");
      await supabaseAdmin.from("communications").insert({
        customer_id: cust.id,
        account_number: cust.account_number,
        channel: "note",
        direction: "outbound",
        subject: `Ticket ${tnum}: ${data.subject.trim()}`,
        body: summary,
        recipient: (contact as any)?.email || (contact as any)?.phone || (contact as any)?.name || cust.primary_email || null,
        sent_at: new Date().toISOString(),
        status: "logged",
        created_by: context.userId,
      } as any);
    } catch (e) {
      console.error("[createTicketForCustomer] auto-log failed:", (e as any)?.message ?? e);
    }
    return ticket;
  });

/** Log a communication event (call/email/whatsapp/meeting) against a customer contact. */
export const logCommunication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    channel: string;
    direction?: string;
    subject?: string;
    body?: string;
    recipient?: string;
    contact_id?: string;
    occurred_at?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    if (!data.customer_id) throw new Error("Customer is required");
    if (!data.channel) throw new Error("Channel is required");
    const cust = await loadCustomer(data.customer_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let recipient = data.recipient?.trim() || null;
    if (!recipient && data.contact_id) {
      const { data: c } = await supabaseAdmin
        .from("customer_contacts").select("email, phone, name")
        .eq("id", data.contact_id).eq("customer_id", cust.id).maybeSingle();
      recipient = (c as any)?.email || (c as any)?.phone || (c as any)?.name || null;
    }
    const { data: row, error } = await supabaseAdmin.from("communications").insert({
      customer_id: cust.id,
      account_number: cust.account_number,
      channel: data.channel,
      direction: data.direction || "outbound",
      subject: data.subject?.trim() || null,
      body: data.body?.trim() || null,
      recipient,
      sent_at: data.occurred_at ? new Date(data.occurred_at).toISOString() : new Date().toISOString(),
      created_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Create an ad-hoc invoice with custom line items scoped to a customer. */
export const createInvoiceForCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    currency?: string;
    issue_date?: string;
    due_days?: number;
    tax_rate?: number;
    notes?: string;
    items: Array<{ description: string; quantity: number; unit_price: number }>;
  }) => input)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    if (!data.customer_id) throw new Error("Customer is required");
    const items = (data.items ?? []).filter((i) => i.description?.trim() && Number(i.quantity) > 0);
    if (items.length === 0) throw new Error("Add at least one line item");
    const cust = await loadCustomer(data.customer_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const issue = data.issue_date ? new Date(data.issue_date) : new Date();
    const due = new Date(issue); due.setDate(due.getDate() + (data.due_days ?? 14));
    const subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price || 0), 0);
    const taxRate = data.tax_rate ?? 0;
    const tax = +(subtotal * taxRate / 100).toFixed(2);
    const total = +(subtotal + tax).toFixed(2);
    const { data: invoice, error } = await supabaseAdmin.from("invoices").insert({
      customer_id: cust.id,
      account_number: cust.account_number,
      currency: data.currency || "USD",
      issue_date: issue.toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
      subtotal, tax, total,
      status: "sent",
      notes: data.notes?.trim() || null,
      created_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);
    const lineRows = items.map((i, idx) => ({
      invoice_id: invoice.id,
      description: i.description.trim(),
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price) || 0,
      tax_rate: taxRate,
      position: idx,
    }));
    await supabaseAdmin.from("invoice_line_items").insert(lineRows);

    if (cust.primary_email) {
      const { notify } = await import("./notify.server");
      await notify("invoice", cust.primary_email, {
        companyName: cust.company_name,
        invoiceNumber: (invoice as any).invoice_number,
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date,
        currency: invoice.currency,
        subtotal, tax, total,
        items: lineRows.map((r) => ({ description: r.description, quantity: r.quantity, unit_price: r.unit_price, line_total: r.quantity * r.unit_price * (1 + taxRate / 100) })),
        invoiceUrl: `https://management.imtsolutions.co.zw/invoices/${invoice.id}`,
      }, `invoice-${invoice.id}`, {
        fromName: `${(context.claims?.email as string)?.split("@")[0] ?? "IMT Solutions"} (IMT Solutions)`,
        ...(context.claims?.email ? { fromLocal: context.claims.email as string, replyTo: context.claims.email as string } : {}),
      });
      const { recordCustomerEvent } = await import("./customer-events.server");
      await recordCustomerEvent(supabaseAdmin, {
        customer_id: cust.id,
        account_number: cust.account_number,
        event_type: "invoice_sent",
        title: `Invoice ${(invoice as any).invoice_number} emailed to ${cust.primary_email}`,
        description: `${invoice.currency} ${total.toFixed(2)} · with a link to view and pay`,
        module: "billing",
        entity_type: "invoice",
        entity_id: invoice.id,
        new_value: { to: cust.primary_email, invoice_url: `https://management.imtsolutions.co.zw/invoices/${invoice.id}`, total },
        major: true,
        actor_id: context.userId,
        actor_email: (context.claims?.email as string) ?? null,
      });
    }
    return invoice;
  });
