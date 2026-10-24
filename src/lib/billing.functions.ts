/**
 * Billing workspace — invoice authoring, issuing and recurring billing.
 * =====================================================================
 * Separation of duties: any staff member may *request* an invoice; only
 * billing (finance / operations manager / master admin) can create, edit,
 * issue, void or run recurring billing.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rows = <T,>(r: { data: T[] | null }) => (r.data ?? []) as T[];
const r2 = (n: number) => Math.round(n * 100) / 100;
const SITE = "https://management.imtsolutions.co.zw";

type Ctx = { supabase: any; userId: string; claims?: any };

async function ensureStaff(context: Ctx) {
  const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
  if (!hasRole) throw new Error("Staff role required");
}

async function ensureBilling(context: Ctx) {
  await ensureStaff(context);
  const { assertBillingStaff } = await import("./customer360.server");
  await assertBillingStaff(context as any);
}

export type InvoiceItemInput = {
  description: string;
  quantity: number;
  unit_price: number;
  /** Product/service code from the catalogue — printed in the Item column. */
  item_code?: string;
  tax_rate?: number;
};

function priceItems(items: InvoiceItemInput[]) {
  const clean = items
    .map((i) => ({
      description: String(i.description ?? "").trim(),
      item_code: String(i.item_code ?? "").trim().slice(0, 40),
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      tax_rate: Number(i.tax_rate) || 0,
    }))
    .filter((i) => i.description && i.quantity > 0);
  if (!clean.length) throw new Error("Add at least one line item with a description and quantity");
  let subtotal = 0;
  let tax = 0;
  const lines = clean.map((i, idx) => {
    const line_total = r2(i.quantity * i.unit_price);
    subtotal += line_total;
    tax += r2((line_total * i.tax_rate) / 100);
    return { ...i, line_total, position: idx };
  });
  subtotal = r2(subtotal);
  tax = r2(tax);
  return { lines, subtotal, tax, total: r2(subtotal + tax) };
}

async function notifyUsers(db: any, userIds: string[], n: { kind: string; title: string; body: string; link: string }) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  await db.from("notifications").insert(ids.map((user_id) => ({ user_id, ...n })) as any);
}

async function billingUserIds(db: any) {
  const { data } = await db
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["finance", "operations_manager", "master_admin"]);
  return ((data ?? []) as any[]).map((r) => r.user_id as string);
}

/* ============================ WORKSPACE READ ============================ */

export const getBillingWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => input ?? {})
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isBillingStaff } = await import("./customer360.server");
    const limit = data.limit ?? 500;
    const today = new Date().toISOString().slice(0, 10);

    const [invR, allocR, reqR, subR, catR, profR] = await Promise.all([
      supabaseAdmin
        .from("invoices")
        .select("*, customers:customer_id(company_name, primary_email)")
        .is("archived_at", null)
        .order("issue_date", { ascending: false })
        .limit(limit),
      (async () => {
        const { fetchAllRows } = await import("./finance-dates.shared");
        const data = await fetchAllRows((f, t) => supabaseAdmin.from("payment_allocations").select("invoice_id, amount").range(f, t) as any);
        return { data, error: null };
      })(),
      supabaseAdmin
        .from("invoice_requests")
        .select("*, customers:customer_id(company_name, primary_email)")
        .order("requested_at", { ascending: false })
        .limit(300),
      supabaseAdmin
        .from("subscriptions")
        .select("*, customers:customer_id(company_name, primary_email)")
        .order("next_renewal", { ascending: true }),
      supabaseAdmin.from("service_catalog").select("id, code, name, category, base_price, currency, billing_cycle").limit(500),
      supabaseAdmin.from("profiles").select("id, full_name, email"),
    ]);

    const invoices = rows(invR) as any[];
    const allocs = rows(allocR) as any[];
    const requests = rows(reqR) as any[];
    const subs = rows(subR) as any[];
    const people = new Map(rows(profR).map((p: any) => [p.id, p]));

    const paidBy: Record<string, number> = {};
    for (const a of allocs) paidBy[a.invoice_id] = (paidBy[a.invoice_id] || 0) + Number(a.amount || 0);

    const now = Date.now();
    let outstanding = 0, overdue = 0, draft = 0, paidMonth = 0;
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    for (const inv of invoices) {
      const total = Number(inv.total || 0);
      const paid = paidBy[inv.id] || 0;
      const balance = Math.max(0, total - paid);
      const isPaid = inv.status === "paid" || balance <= 0.001;
      const isOverdue = !isPaid && inv.status !== "void" && !!inv.due_date && new Date(inv.due_date).getTime() < now;
      inv.paid_amount = r2(paid);
      inv.balance = r2(balance);
      inv.is_overdue = isOverdue;
      if (!isPaid && inv.status !== "void") outstanding += balance;
      if (isOverdue) overdue += balance;
      if (inv.status === "draft") draft += total;
      if (isPaid && inv.issue_date && new Date(inv.issue_date).getTime() >= startOfMonth) paidMonth += total;
    }

    for (const q of requests) {
      const p = people.get(q.requested_by) as any;
      q.requested_by_name = p?.full_name ?? p?.email ?? "—";
      const rv = people.get(q.reviewed_by) as any;
      q.reviewed_by_name = rv?.full_name ?? rv?.email ?? null;
    }

    // Recurring billing pipeline: what is due now, and what is next.
    const recurring = subs
      .filter((s) => s.status === "active" && String(s.billing_cycle || "") !== "one_time")
      .map((s) => ({
        ...s,
        due: !!s.next_renewal && s.next_renewal <= today,
        days_to_renewal: s.next_renewal
          ? Math.round((new Date(s.next_renewal).getTime() - now) / 86400000)
          : null,
      }));

    return {
      invoices,
      requests,
      recurring,
      catalog: rows(catR) as any[],
      canManage: await isBillingStaff(context as any),
      stats: {
        count: invoices.length,
        outstanding: r2(outstanding),
        overdue: r2(overdue),
        draft: r2(draft),
        paidMonth: r2(paidMonth),
        draftCount: invoices.filter((i) => i.status === "draft").length,
        overdueCount: invoices.filter((i) => i.is_overdue).length,
        paidCount: invoices.filter((i) => i.status === "paid" || (i.balance ?? 0) <= 0.001).length,
        pendingRequests: requests.filter((q) => q.status === "pending").length,
        dueRecurring: recurring.filter((s) => s.due).length,
        dueRecurringValue: r2(recurring.filter((s) => s.due).reduce((t, s) => t + Number(s.amount || 0), 0)),
      },
    };
  });

/** Full invoice with its line items, for the edit drawer. */
export const getInvoiceForEdit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { invoice_id: string }) => input)
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: invoice, error }, itemsR, allocR] = await Promise.all([
      supabaseAdmin
        .from("invoices")
        .select("*, customers:customer_id(id, company_name, primary_email, account_number)")
        .eq("id", data.invoice_id)
        .maybeSingle(),
      supabaseAdmin.from("invoice_line_items").select("*").eq("invoice_id", data.invoice_id).order("position"),
      supabaseAdmin.from("payment_allocations").select("amount").eq("invoice_id", data.invoice_id),
    ]);
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found");
    const paid = rows(allocR as any).reduce((s: number, a: any) => s + Number(a.amount || 0), 0);
    return {
      invoice,
      items: rows(itemsR as any) as any[],
      paid: r2(paid),
      balance: r2(Math.max(0, Number((invoice as any).total || 0) - paid)),
      locked: paid > 0.005 || invoice.status === "paid" || invoice.status === "void",
    };
  });

/* ============================ CREATE / EDIT ============================ */

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    issue_date?: string;
    due_date?: string;
    due_days?: number;
    currency?: string;
    notes?: string;
    items: InvoiceItemInput[];
    /** "draft" keeps it internal; "sent" issues it immediately. */
    status?: "draft" | "sent";
    /** Email the customer when issuing. */
    send_email?: boolean;
    request_id?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    await ensureBilling(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCustomer } = await import("./customer360.server");
    const { recordCustomerEvent, recordAudit } = await import("./customer-events.server");

    const cust = await loadCustomer(supabaseAdmin, data.customer_id);
    const { lines, subtotal, tax, total } = priceItems(data.items ?? []);

    const issue = data.issue_date || new Date().toISOString().slice(0, 10);
    let due = data.due_date || "";
    if (!due) {
      const d = new Date(issue);
      d.setDate(d.getDate() + (data.due_days ?? 14));
      due = d.toISOString().slice(0, 10);
    }
    const status = data.status === "sent" ? "sent" : "draft";

    const { data: invoice, error } = await supabaseAdmin
      .from("invoices")
      .insert({
        customer_id: cust.id,
        account_number: cust.account_number,
        currency: (data.currency || cust.currency || "USD").toUpperCase().slice(0, 3),
        issue_date: issue,
        due_date: due,
        subtotal, tax, total,
        status,
        notes: data.notes || null,
        created_by: context.userId,
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { error: liErr } = await supabaseAdmin
      .from("invoice_line_items")
      .insert(lines.map(({ line_total: _lt, ...l }) => ({ ...l, invoice_id: invoice.id })) as any);
    if (liErr) {
      // Roll back so no invoice exists without its line items.
      await supabaseAdmin.from("invoices").delete().eq("id", invoice.id);
      throw new Error(liErr.message);
    }

    if (data.request_id) {
      await supabaseAdmin
        .from("invoice_requests")
        .update({
          status: "approved",
          invoice_id: invoice.id,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq("id", data.request_id);
      const { data: req } = await supabaseAdmin
        .from("invoice_requests").select("requested_by, title").eq("id", data.request_id).maybeSingle();
      if (req?.requested_by) {
        await notifyUsers(supabaseAdmin, [req.requested_by], {
          kind: "invoice_request",
          title: `Invoice ${(invoice as any).invoice_number} raised`,
          body: `Your request "${req.title}" for ${cust.company_name} has been invoiced.`,
          link: `/invoices/${invoice.id}`,
        });
      }
    }

    let emailed = false;
    if (status === "sent" && data.send_email !== false) {
      emailed = await sendInvoiceEmail(supabaseAdmin, context, invoice, cust, lines).catch(() => false);
    }

    await recordCustomerEvent(supabaseAdmin, {
      customer_id: cust.id,
      account_number: cust.account_number,
      event_type: status === "sent" ? "invoice_sent" : "invoice_generated",
      title: `Invoice ${(invoice as any).invoice_number} ${status === "sent" ? "issued" : "drafted"}`,
      description: `${invoice.currency} ${total.toFixed(2)} · ${lines.length} line item${lines.length === 1 ? "" : "s"}${emailed ? " · emailed" : ""}`,
      module: "billing",
      entity_type: "invoice",
      entity_id: invoice.id,
      new_value: { total, currency: invoice.currency, due_date: due, status },
      major: true,
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
    });
    await recordAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
      module: "billing",
      action: "invoice.create",
      entity_type: "invoice",
      entity_id: invoice.id,
      new_value: { total, status, items: lines.length, request_id: data.request_id ?? null },
    } as any);

    return { invoice, items: lines, emailed };
  });

export const updateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    invoice_id: string;
    issue_date?: string;
    due_date?: string;
    currency?: string;
    notes?: string;
    items?: InvoiceItemInput[];
  }) => input)
  .handler(async ({ data, context }) => {
    await ensureBilling(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordCustomerEvent, recordAudit } = await import("./customer-events.server");

    const { data: invoice, error } = await supabaseAdmin
      .from("invoices").select("*").eq("id", data.invoice_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "void") throw new Error("A voided invoice cannot be edited");

    const { data: allocs } = await supabaseAdmin
      .from("payment_allocations").select("amount").eq("invoice_id", invoice.id);
    const paid = ((allocs ?? []) as any[]).reduce((s, a) => s + Number(a.amount || 0), 0);

    const patch: Record<string, any> = {};
    if (data.issue_date) patch.issue_date = data.issue_date;
    if (data.due_date !== undefined) patch.due_date = data.due_date || null;
    if (data.notes !== undefined) patch.notes = data.notes || null;
    if (data.currency) patch.currency = data.currency.toUpperCase().slice(0, 3);

    let repriced: { subtotal: number; tax: number; total: number } | null = null;
    if (data.items) {
      if (paid > 0.005) throw new Error("Line items cannot change once a payment has been applied — void and reissue instead");
      const { lines, subtotal, tax, total } = priceItems(data.items);
      await supabaseAdmin.from("invoice_line_items").delete().eq("invoice_id", invoice.id);
      const { error: liErr } = await supabaseAdmin
        .from("invoice_line_items")
        .insert(lines.map(({ line_total: _lt, ...l }) => ({ ...l, invoice_id: invoice.id })) as any);
      if (liErr) throw new Error(liErr.message);
      Object.assign(patch, { subtotal, tax, total });
      repriced = { subtotal, tax, total };
    }

    if (!Object.keys(patch).length) return { invoice, changed: false };

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("invoices").update(patch as any).eq("id", invoice.id).select("*").single();
    if (upErr) throw new Error(upErr.message);

    await recordCustomerEvent(supabaseAdmin, {
      customer_id: invoice.customer_id,
      account_number: invoice.account_number,
      event_type: "invoice_updated",
      title: `Invoice ${(invoice as any).invoice_number} updated`,
      description: repriced
        ? `Total now ${updated.currency} ${Number(updated.total).toFixed(2)}`
        : "Invoice details amended",
      module: "billing",
      entity_type: "invoice",
      entity_id: invoice.id,
      old_value: { total: invoice.total, due_date: invoice.due_date },
      new_value: patch,
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
    });
    await recordAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
      module: "billing",
      action: "invoice.update",
      entity_type: "invoice",
      entity_id: invoice.id,
      new_value: patch,
    } as any);

    return { invoice: updated, changed: true };
  });

/* ============================ ISSUE / VOID ============================ */

/**
 * Invoice emails come from the customer's account manager — their name on the
 * From line, their mailbox as reply-to, their signature, and the official
 * Quote Studio PDF attached. Falls back to the acting staff member when the
 * account has no manager assigned.
 */
async function sendInvoiceEmail(db: any, context: Ctx, invoice: any, cust: any, lines: any[]) {
  const recipient = String(cust?.primary_email ?? "").trim();
  if (!recipient || !/@/.test(recipient)) return false;

  const { accountManagerContact } = await import("./account-managers.server");
  const am = await accountManagerContact(db, cust?.account_manager_id).catch(() => null);
  let senderName = am?.name || "";
  let senderEmail = (am?.email || "").trim();
  if (!senderEmail) {
    const { data: profile } = await db.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle();
    senderEmail = (profile?.email || (context.claims?.email as string) || "").trim();
    senderName = senderName || profile?.full_name || senderEmail.split("@")[0] || "IMT Solutions";
  }

  // Attach the official PDF — the same document the client can download.
  const [{ data: allocations }, { officialInvoicePdf }] = await Promise.all([
    db.from("payment_allocations").select("amount").eq("invoice_id", invoice.id),
    import("./invoice-document.server"),
  ]);
  const pdf = await officialInvoicePdf(invoice, lines, cust, (allocations ?? []) as any[], { userId: context.userId, userName: senderName });

  const { imtSignature } = await import("./email-signature.shared");
  const { sendResendEmail } = await import("./email-templates/send-resend");
  const res = await sendResendEmail({
    templateName: "invoice",
    to: recipient,
    templateData: {
      companyName: cust?.company_name,
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      currency: invoice.currency || "USD",
      subtotal: Number(invoice.subtotal ?? 0),
      tax: Number(invoice.tax ?? 0),
      total: Number(invoice.total ?? 0),
      items: lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity) || 0,
        unit_price: Number(l.unit_price) || 0,
        line_total: Number(l.line_total ?? 0),
      })),
      invoiceUrl: `${SITE}/invoices/${invoice.id}`,
    },
    replyTo: senderEmail || undefined,
    from: senderEmail ? `"${senderName} (IMT Solutions)" <${senderEmail}>` : undefined,
    signatureHtml: imtSignature({ name: senderName, role: "account_manager", email: senderEmail || "sales@imtsolutions.co.zw" }),
    attachments: [{ filename: `${String(invoice.invoice_number).replace(/[^\w.-]+/g, "-")}.pdf`, content: pdf.bytes, contentType: "application/pdf" }],
  });
  return res.sent;
}

export const issueInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { invoice_id: string; send_email?: boolean }) => input)
  .handler(async ({ data, context }) => {
    await ensureBilling(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordCustomerEvent, recordAudit } = await import("./customer-events.server");

    const { data: invoice, error } = await supabaseAdmin
      .from("invoices")
      .select("*, customers:customer_id(id, company_name, primary_email, account_number)")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "void") throw new Error("A voided invoice cannot be issued");
    if (invoice.status === "paid") throw new Error("This invoice is already settled");
    if (Number(invoice.total || 0) <= 0) throw new Error("Add priced line items before issuing this invoice");

    const { data: items } = await supabaseAdmin
      .from("invoice_line_items").select("*").eq("invoice_id", invoice.id).order("position");

    if (invoice.status === "draft") {
      await supabaseAdmin.from("invoices").update({ status: "sent" } as any).eq("id", invoice.id);
    }
    const emailed = data.send_email === false
      ? false
      : await sendInvoiceEmail(supabaseAdmin, context, invoice, (invoice as any).customers, (items ?? []) as any[]).catch(() => false);

    await recordCustomerEvent(supabaseAdmin, {
      customer_id: invoice.customer_id,
      account_number: invoice.account_number,
      event_type: "invoice_sent",
      title: `Invoice ${(invoice as any).invoice_number} issued`,
      description: `${invoice.currency} ${Number(invoice.total).toFixed(2)}${emailed ? ` · emailed to ${(invoice as any).customers?.primary_email}` : " · not emailed"}`,
      module: "billing",
      entity_type: "invoice",
      entity_id: invoice.id,
      new_value: { status: "sent", emailed },
      major: true,
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
    });
    await recordAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
      module: "billing",
      action: "invoice.issue",
      entity_type: "invoice",
      entity_id: invoice.id,
      new_value: { emailed },
    } as any);

    return { emailed, invoiceNumber: (invoice as any).invoice_number };
  });

export const voidInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { invoice_id: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    await ensureBilling(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordCustomerEvent, recordAudit } = await import("./customer-events.server");
    const reason = String(data.reason ?? "").trim();
    if (reason.length < 4) throw new Error("Give a reason for voiding this invoice");

    const { data: invoice } = await supabaseAdmin
      .from("invoices").select("*").eq("id", data.invoice_id).maybeSingle();
    if (!invoice) throw new Error("Invoice not found");
    const { data: allocs } = await supabaseAdmin
      .from("payment_allocations").select("amount").eq("invoice_id", invoice.id);
    const paid = ((allocs ?? []) as any[]).reduce((s, a) => s + Number(a.amount || 0), 0);
    if (paid > 0.005) throw new Error("This invoice has payments applied — raise a credit note or refund instead");

    const { error } = await supabaseAdmin
      .from("invoices")
      .update({ status: "void", notes: [invoice.notes, `Voided: ${reason}`].filter(Boolean).join("\n") } as any)
      .eq("id", invoice.id);
    if (error) throw new Error(error.message);

    await recordCustomerEvent(supabaseAdmin, {
      customer_id: invoice.customer_id,
      account_number: invoice.account_number,
      event_type: "invoice_voided",
      title: `Invoice ${(invoice as any).invoice_number} voided`,
      description: reason,
      module: "billing",
      entity_type: "invoice",
      entity_id: invoice.id,
      old_value: { status: invoice.status },
      new_value: { status: "void", reason },
      major: true,
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
    });
    await recordAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
      module: "billing",
      action: "invoice.void",
      entity_type: "invoice",
      entity_id: invoice.id,
      new_value: { reason },
    } as any);
    return { ok: true };
  });

/* ============================ REQUESTS (AM → Billing) ============================ */

export const requestInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    title: string;
    description?: string;
    items?: InvoiceItemInput[];
    currency?: string;
    estimated_amount?: number;
    due_days?: number;
    needed_by?: string;
    notes?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCustomer } = await import("./customer360.server");
    const { recordCustomerEvent } = await import("./customer-events.server");

    const title = String(data.title ?? "").trim();
    if (title.length < 3) throw new Error("Describe what should be invoiced");
    const cust = await loadCustomer(supabaseAdmin, data.customer_id);

    const items = (data.items ?? [])
      .map((i) => ({
        description: String(i.description ?? "").trim(),
        quantity: Number(i.quantity) || 1,
        unit_price: Number(i.unit_price) || 0,
      }))
      .filter((i) => i.description);
    const estimated = data.estimated_amount != null && Number(data.estimated_amount) > 0
      ? r2(Number(data.estimated_amount))
      : r2(items.reduce((s, i) => s + i.quantity * i.unit_price, 0));

    const { data: req, error } = await supabaseAdmin
      .from("invoice_requests")
      .insert({
        customer_id: cust.id,
        account_number: cust.account_number,
        title,
        description: data.description || null,
        items: items as any,
        currency: (data.currency || cust.currency || "USD").toUpperCase().slice(0, 3),
        estimated_amount: estimated,
        due_days: data.due_days ?? 14,
        needed_by: data.needed_by || null,
        notes: data.notes || null,
        status: "pending",
        requested_by: context.userId,
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await notifyUsers(supabaseAdmin, await billingUserIds(supabaseAdmin), {
      kind: "invoice_request",
      title: "New invoice request",
      body: `${cust.company_name} · ${title} · ${req.currency} ${estimated.toFixed(2)}`,
      link: "/finance?tab=invoices",
    });
    await recordCustomerEvent(supabaseAdmin, {
      customer_id: cust.id,
      account_number: cust.account_number,
      event_type: "invoice_requested",
      title: `Invoice requested — ${title}`,
      description: `${req.currency} ${estimated.toFixed(2)} · awaiting billing`,
      module: "billing",
      entity_type: "invoice_request",
      entity_id: req.id,
      new_value: { estimated, items },
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
    });

    return { request: req };
  });

export const reviewInvoiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { request_id: string; action: "decline" | "cancel"; notes?: string }) => input)
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isBillingStaff } = await import("./customer360.server");
    const { recordAudit } = await import("./customer-events.server");

    const { data: req } = await supabaseAdmin
      .from("invoice_requests").select("*").eq("id", data.request_id).maybeSingle();
    if (!req) throw new Error("Request not found");
    if (req.status !== "pending" && req.status !== "clarification") throw new Error("This request has already been closed");

    const billing = await isBillingStaff(context as any);
    if (data.action === "decline" && !billing) throw new Error("Only billing can decline a request");
    if (data.action === "cancel" && req.requested_by !== context.userId && !billing) {
      throw new Error("Only the requester or billing can cancel this request");
    }
    if (data.action === "decline" && String(data.notes ?? "").trim().length < 4) {
      throw new Error("Give the requester a reason");
    }

    const status = data.action === "decline" ? "declined" : "cancelled";
    const { error } = await supabaseAdmin
      .from("invoice_requests")
      .update({
        status,
        review_notes: data.notes || null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      } as any)
      .eq("id", req.id);
    if (error) throw new Error(error.message);

    if (status === "declined" && req.requested_by) {
      await notifyUsers(supabaseAdmin, [req.requested_by], {
        kind: "invoice_request",
        title: "Invoice request declined",
        body: `${req.title} — ${data.notes ?? "see billing"}`,
        link: "/finance?tab=invoices",
      });
    }
    await recordAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
      module: "billing",
      action: `invoice_request.${status}`,
      entity_type: "invoice_request",
      entity_id: req.id,
      new_value: { notes: data.notes ?? null },
    } as any);
    return { status };
  });

/* ============================ RECURRING BILLING ============================ */

export const runRecurringBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    /** Restrict the run to specific subscriptions; omit to bill everything due. */
    subscription_ids?: string[];
    /** Issue and email immediately (default) or leave drafts for review. */
    issue?: boolean;
    send_email?: boolean;
    due_days?: number;
    dry_run?: boolean;
  }) => input ?? {})
  .handler(async ({ data, context }) => {
    await ensureBilling(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { advanceDate } = await import("./customer360.server");
    const { recordCustomerEvent, recordAudit } = await import("./customer-events.server");

    const today = new Date().toISOString().slice(0, 10);
    let q = supabaseAdmin
      .from("subscriptions")
      .select("*, customers:customer_id(id, company_name, primary_email, account_number)")
      .eq("status", "active");
    if (data.subscription_ids?.length) q = q.in("id", data.subscription_ids);
    else q = q.lte("next_renewal", today);
    const subs = rows(await q) as any[];

    const eligible = subs.filter(
      (s) => String(s.billing_cycle || "monthly") !== "one_time" && Number(s.amount || 0) > 0,
    );

    if (data.dry_run) {
      return {
        dryRun: true,
        planned: eligible.map((s) => ({
          subscription_id: s.id,
          plan_name: s.plan_name,
          company_name: s.customers?.company_name,
          amount: Number(s.amount || 0),
          currency: s.currency || "USD",
          next_renewal: s.next_renewal,
        })),
        created: 0, skipped: 0, emailed: 0, total: 0, errors: [] as string[],
      };
    }

    const issue = data.issue !== false;
    const dueDays = data.due_days ?? 14;
    const created: any[] = [];
    const errors: string[] = [];
    let skipped = 0, emailed = 0, total = 0;

    for (const s of eligible) {
      try {
        // Idempotency: never bill the same period twice.
        const { data: dupe } = await supabaseAdmin
          .from("invoices")
          .select("id")
          .eq("customer_id", s.customer_id)
          .eq("issue_date", today)
          .ilike("notes", `%subscription:${s.id}%`)
          .limit(1);
        if ((dupe ?? []).length) { skipped += 1; continue; }

        const subtotal = r2(Number(s.amount || 0));
        const due = new Date(today);
        due.setDate(due.getDate() + dueDays);
        const { data: invoice, error } = await supabaseAdmin
          .from("invoices")
          .insert({
            customer_id: s.customer_id,
            account_number: s.account_number,
            currency: s.currency || "USD",
            issue_date: today,
            due_date: due.toISOString().slice(0, 10),
            subtotal, tax: 0, total: subtotal,
            status: issue ? "sent" : "draft",
            notes: `Recurring billing — ${s.plan_name} (${s.billing_cycle}) [subscription:${s.id}]`,
            created_by: context.userId,
          } as any)
          .select("*")
          .single();
        if (error) throw new Error(error.message);

        // Maintenance contracts list the covered equipment on the invoice.
        const { data: covered } = await supabaseAdmin.from("assets").select("asset_type,make,model,serial_number,site_name").eq("subscription_id", s.id).is("archived_at", null);
        const coverage = (covered ?? []).map((a: any) => [a.asset_type, [a.make, a.model].filter(Boolean).join(" "), a.serial_number && `S/N ${a.serial_number}`].filter(Boolean).join(" ")).join("; ");
        const line = {
          invoice_id: invoice.id,
          description: `${s.plan_name}${s.description ? ` — ${s.description}` : ""} (${s.billing_cycle})${coverage ? ` · Covers: ${coverage}` : ""}`,
          quantity: 1,
          unit_price: subtotal,
          tax_rate: 0,
          position: 0,
        };
        await supabaseAdmin.from("invoice_line_items").insert(line as any);

        // Roll the subscription forward.
        const base = s.next_renewal ? new Date(s.next_renewal) : new Date(today);
        const next = advanceDate(base, s.billing_cycle);
        await supabaseAdmin
          .from("subscriptions")
          .update({ next_renewal: next.toISOString().slice(0, 10) } as any)
          .eq("id", s.id);

        let sent = false;
        if (issue && data.send_email !== false) {
          sent = await sendInvoiceEmail(supabaseAdmin, context, invoice, s.customers, [line]).catch(() => false);
          if (sent) emailed += 1;
        }

        await recordCustomerEvent(supabaseAdmin, {
          customer_id: s.customer_id,
          account_number: s.account_number,
          event_type: issue ? "invoice_sent" : "invoice_generated",
          title: `Recurring invoice ${(invoice as any).invoice_number} ${issue ? "issued" : "drafted"}`,
          description: `${invoice.currency} ${subtotal.toFixed(2)} · ${s.plan_name} · next renewal ${next.toISOString().slice(0, 10)}`,
          module: "billing",
          entity_type: "invoice",
          entity_id: invoice.id,
          new_value: { subscription_id: s.id, total: subtotal, emailed: sent },
          major: true,
          actor_id: context.userId,
          actor_email: context.claims?.email ?? null,
        });

        created.push({
          invoice_id: invoice.id,
          invoice_number: (invoice as any).invoice_number,
          company_name: s.customers?.company_name,
          plan_name: s.plan_name,
          total: subtotal,
          currency: invoice.currency,
          emailed: sent,
        });
        total += subtotal;
      } catch (e: any) {
        errors.push(`${s.customers?.company_name ?? s.account_number} · ${s.plan_name}: ${e?.message ?? "failed"}`);
      }
    }

    await recordAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
      module: "billing",
      action: "billing.recurring_run",
      entity_type: "subscription",
      entity_id: null,
      new_value: { created: created.length, skipped, emailed, total: r2(total), errors: errors.length },
    } as any);

    return { dryRun: false, created: created.length, invoices: created, skipped, emailed, total: r2(total), errors };
  });

/* ===================== INVOICE REQUEST TRACKING (read) ===================== */

/**
 * Status tracker for invoice requests. Billing sees every request; anyone
 * else (account managers) sees only the ones they raised.
 */
export const listInvoiceRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isBillingStaff } = await import("./customer360.server");
    const canManage = await isBillingStaff(context as any);

    let q = supabaseAdmin
      .from("invoice_requests")
      .select("*, customers:customer_id(company_name, account_number), invoices:invoice_id(invoice_number, status)")
      .order("requested_at", { ascending: false })
      .limit(200);
    if (data.customer_id) q = q.eq("customer_id", data.customer_id);
    if (!canManage) q = q.eq("requested_by", context.userId);

    const requests = rows(await q) as any[];
    const stats = {
      pending: requests.filter((r) => r.status === "pending").length,
      clarification: requests.filter((r) => r.status === "clarification").length,
      approved: requests.filter((r) => r.status === "approved").length,
      rejected: requests.filter((r) => r.status === "rejected").length,
      cancelled: requests.filter((r) => r.status === "cancelled").length,
    };
    return { requests, canManage, stats };
  });
