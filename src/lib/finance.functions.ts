/**
 * Finance module aggregators.
 * ===========================
 * One request per page — no N+1 queries in the finance surfaces.
 * These are read-only aggregators that back the Invoices, Payments,
 * and Quotes pages. Every KPI, chart, and list is derived from a
 * single round-trip, matching the getCustomer360 pattern.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rows = <T,>(r: { data: T[] | null }) => (r.data ?? []) as T[];

async function ensureStaff(context: { supabase: any; userId: string }) {
  const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
  if (!hasRole) throw new Error("Staff role required");
}

/* ---------- Invoices Aggregator ---------- */

export const getInvoicesOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => input ?? {})
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 500;

    const [invR, allocR] = await Promise.all([
      supabaseAdmin
        .from("invoices")
        .select("*, customers:customer_id(company_name)")
        .is("archived_at", null)
        .order("issue_date", { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from("payment_allocations")
        .select("invoice_id, amount"),
    ]);
    const invoices = rows(invR) as any[];
    const allocs = rows(allocR) as any[];

    const paidBy: Record<string, number> = {};
    for (const a of allocs) paidBy[a.invoice_id] = (paidBy[a.invoice_id] || 0) + Number(a.amount || 0);

    const now = Date.now();
    let outstanding = 0, overdue = 0, paidMonth = 0, draft = 0;
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

    for (const inv of invoices) {
      const total = Number(inv.total || 0);
      const paid = paidBy[inv.id] || 0;
      const balance = Math.max(0, total - paid);
      const isPaid = inv.status === "paid" || balance <= 0.001;
      const isOverdue = !isPaid && inv.due_date && new Date(inv.due_date).getTime() < now;
      inv.paid_amount = paid;
      inv.balance = balance;
      inv.is_overdue = !!isOverdue;
      if (!isPaid) outstanding += balance;
      if (isOverdue) overdue += balance;
      if (inv.status === "draft") draft += total;
      if (isPaid && inv.issue_date && new Date(inv.issue_date).getTime() >= startOfMonth) paidMonth += total;
    }

    return {
      invoices,
      stats: {
        count: invoices.length,
        outstanding,
        overdue,
        paidMonth,
        draft,
        overdueCount: invoices.filter((i) => i.is_overdue).length,
        paidCount: invoices.filter((i) => i.status === "paid" || (i.balance ?? 0) <= 0.001).length,
        draftCount: invoices.filter((i) => i.status === "draft").length,
      },
    };
  });

/* ---------- Payments Aggregator ---------- */

export const getPaymentsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => input ?? {})
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 500;

    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("*, customers:customer_id(company_name)")
      .order("paid_at", { ascending: false })
      .limit(limit);

    const list = (payments ?? []) as any[];
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekAgo = now.getTime() - 7 * 86400000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let today = 0, week = 0, month = 0, pending = 0, unrec = 0, refunded = 0;
    for (const p of list) {
      const t = new Date(p.paid_at).getTime();
      const amt = Number(p.amount || 0);
      if (p.status === "received") {
        if (t >= startOfDay) today += amt;
        if (t >= weekAgo) week += amt;
        if (t >= startOfMonth) month += amt;
        if (p.reconciliation_status !== "matched") unrec += amt;
      }
      if (p.status === "pending") pending += amt;
      if (p.status === "refunded") refunded += amt;
    }

    return {
      payments: list,
      stats: {
        count: list.length,
        today, week, month, pending, unrec, refunded,
        receivedCount: list.filter((p) => p.status === "received").length,
        pendingCount: list.filter((p) => p.status === "pending").length,
        unreconciledCount: list.filter((p) => p.status === "received" && p.reconciliation_status !== "matched").length,
      },
    };
  });

/* ---------- Quotes Aggregator ---------- */

export const getQuotesOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => input ?? {})
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 500;

    const { data: quotes } = await supabaseAdmin
      .from("quotes")
      .select("*, customers:customer_id(company_name)")
      .order("created_at", { ascending: false })
      .limit(limit);


    const list = (quotes ?? []) as any[];
    const now = Date.now();

    let pipeline = 0, accepted = 0, sent = 0, expired = 0, expiredCount = 0, acceptedCount = 0;
    for (const q of list) {
      const total = Number(q.total ?? q.amount ?? 0);
      const isExpired = q.valid_until && new Date(q.valid_until).getTime() < now && q.status !== "accepted";
      if (isExpired) { expired += total; expiredCount += 1; }
      if (q.status === "sent") { sent += total; pipeline += total; }
      if (q.status === "draft") pipeline += total;
      if (q.status === "accepted") { accepted += total; acceptedCount += 1; }
    }

    return {
      quotes: list,
      stats: {
        count: list.length,
        pipeline, sent, accepted, expired,
        acceptedCount, expiredCount,
        acceptRate: list.length ? Math.round((acceptedCount / list.length) * 100) : 0,
      },
    };
  });

/* ---------- Customer Balances (receivables per account) ---------- */

export const getCustomerBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => input ?? {})
  .handler(async ({ context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [custR, invR, allocR, payR] = await Promise.all([
      supabaseAdmin.from("customers").select("id, company_name, account_number, status").is("archived_at", null),
      supabaseAdmin.from("invoices").select("id, customer_id, total, status, due_date, issue_date").is("archived_at", null),
      supabaseAdmin.from("payment_allocations").select("invoice_id, amount"),
      supabaseAdmin.from("payments").select("customer_id, amount, status, paid_at"),
    ]);

    const customers = rows(custR) as any[];
    const invoices = rows(invR) as any[];
    const allocs = rows(allocR) as any[];
    const payments = rows(payR) as any[];

    const paidBy: Record<string, number> = {};
    for (const a of allocs) paidBy[a.invoice_id] = (paidBy[a.invoice_id] || 0) + Number(a.amount || 0);

    const byCustomer = new Map<string, any>();
    for (const c of customers) {
      byCustomer.set(c.id, {
        customer_id: c.id,
        company_name: c.company_name,
        account_number: c.account_number,
        status: c.status,
        invoiced: 0,
        paid: 0,
        balance: 0,
        overdue: 0,
        open_invoices: 0,
        overdue_invoices: 0,
        oldest_due: null as string | null,
        last_payment_at: null as string | null,
        last_payment_amount: 0,
      });
    }

    const now = Date.now();
    for (const inv of invoices) {
      const row = byCustomer.get(inv.customer_id);
      if (!row || inv.status === "void") continue;
      const total = Number(inv.total || 0);
      const paid = paidBy[inv.id] || 0;
      const balance = Math.max(0, total - paid);
      row.invoiced += total;
      row.paid += Math.min(paid, total);
      if (balance > 0.005 && inv.status !== "paid") {
        row.balance += balance;
        row.open_invoices += 1;
        if (inv.due_date && new Date(inv.due_date).getTime() < now) {
          row.overdue += balance;
          row.overdue_invoices += 1;
          if (!row.oldest_due || new Date(inv.due_date).getTime() < new Date(row.oldest_due).getTime()) row.oldest_due = inv.due_date;
        }
      }
    }

    for (const p of payments) {
      const row = byCustomer.get(p.customer_id);
      if (!row || p.status === "failed") continue;
      if (!row.last_payment_at || new Date(p.paid_at).getTime() > new Date(row.last_payment_at).getTime()) {
        row.last_payment_at = p.paid_at;
        row.last_payment_amount = Number(p.amount || 0);
      }
    }

    const list = [...byCustomer.values()]
      .map((r) => ({ ...r, balance: Math.round(r.balance * 100) / 100, overdue: Math.round(r.overdue * 100) / 100 }))
      .sort((a, b) => b.balance - a.balance);

    return {
      balances: list,
      stats: {
        totalDue: Math.round(list.reduce((s, r) => s + r.balance, 0) * 100) / 100,
        totalOverdue: Math.round(list.reduce((s, r) => s + r.overdue, 0) * 100) / 100,
        accountsInDebt: list.filter((r) => r.balance > 0.005).length,
        accountsOverdue: list.filter((r) => r.overdue > 0.005).length,
      },
    };
  });

/* =========================================================================
 * PAYMENT RECONCILIATION — money actually moves
 * Applying a payment writes payment_allocations rows, which drives the DB
 * triggers that recompute invoice paid/partial status and the payment's
 * reconciliation state. Fully-settled accounts get suspended services back.
 * =======================================================================*/

export const getPaymentReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { payment_id: string }) => input)
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadOpenInvoices, allocateOldestFirst } = await import("./customer360.server");

    const { data: payment, error } = await supabaseAdmin
      .from("payments").select("*, customers:customer_id(company_name, account_number)")
      .eq("id", data.payment_id).single();
    if (error || !payment) throw new Error(error?.message || "Payment not found");

    const { data: allocRows } = await supabaseAdmin
      .from("payment_allocations")
      .select("id, invoice_id, amount, invoices(invoice_number)")
      .eq("payment_id", payment.id);
    const applied = ((allocRows ?? []) as any[]).reduce((s, a) => s + Number(a.amount || 0), 0);
    const unapplied = Math.round((Number(payment.amount || 0) - applied) * 100) / 100;

    const openInvoices = payment.customer_id
      ? await loadOpenInvoices(supabaseAdmin, payment.customer_id)
      : [];
    const suggestion = allocateOldestFirst(openInvoices, Math.max(0, unapplied));

    return {
      payment,
      allocations: (allocRows ?? []) as any[],
      applied: Math.round(applied * 100) / 100,
      unapplied: Math.max(0, unapplied),
      openInvoices,
      suggestion: suggestion.allocations,
      suggestionUnallocated: suggestion.unallocated,
    };
  });

export const reconcilePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    payment_id: string;
    /** Explicit split. Omit (or send empty) to auto-apply oldest invoice first. */
    allocations?: Array<{ invoice_id: string; amount: number }>;
  }) => input)
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadOpenInvoices, allocateOldestFirst, resumeSuspendedForCustomer } = await import("./customer360.server");
    const { recordCustomerEvent } = await import("./customer-events.server");

    const { data: payment, error } = await supabaseAdmin
      .from("payments").select("*").eq("id", data.payment_id).single();
    if (error || !payment) throw new Error(error?.message || "Payment not found");
    if (payment.status === "failed") throw new Error("A failed payment cannot be reconciled");
    if (!payment.customer_id) throw new Error("This payment is not linked to a customer");

    const { data: existing } = await supabaseAdmin
      .from("payment_allocations").select("amount").eq("payment_id", payment.id);
    const applied = ((existing ?? []) as any[]).reduce((s, a) => s + Number(a.amount || 0), 0);
    const unapplied = Math.round((Number(payment.amount || 0) - applied) * 100) / 100;
    if (unapplied <= 0.005) throw new Error("This payment is already fully applied");

    const openInvoices = await loadOpenInvoices(supabaseAdmin, payment.customer_id);
    if (!openInvoices.length) throw new Error("This customer has no open invoices to apply the payment to");
    const balanceOf = new Map(openInvoices.map((i: any) => [i.id, i.balance]));

    let planned: Array<{ invoice_id: string; amount: number }>;
    const manual = (data.allocations ?? []).filter((a) => a.invoice_id && Number(a.amount) > 0);
    if (manual.length) {
      planned = manual.map((a) => ({ invoice_id: a.invoice_id, amount: Math.round(Number(a.amount) * 100) / 100 }));
      for (const a of planned) {
        const bal = balanceOf.get(a.invoice_id);
        if (bal === undefined) throw new Error("One of the selected invoices is not open on this account");
        if (a.amount > bal + 0.005) throw new Error(`Allocation of ${a.amount} exceeds the ${bal} still due on that invoice`);
      }
      const sum = planned.reduce((s, a) => s + a.amount, 0);
      if (sum > unapplied + 0.005) throw new Error(`Allocations (${sum.toFixed(2)}) exceed the unapplied amount (${unapplied.toFixed(2)})`);
    } else {
      planned = allocateOldestFirst(openInvoices, unapplied).allocations.map((a) => ({ invoice_id: a.invoice_id, amount: a.amount }));
      if (!planned.length) throw new Error("Nothing to allocate — every invoice is already settled");
    }

    const { error: insErr } = await supabaseAdmin
      .from("payment_allocations")
      .insert(planned.map((a) => ({ payment_id: payment.id, invoice_id: a.invoice_id, amount: a.amount })) as any);
    if (insErr) throw new Error(insErr.message);

    // Triggers have recomputed invoice + payment state; read the truth back.
    const [{ data: after }, remaining] = await Promise.all([
      supabaseAdmin.from("payments").select("reconciliation_status").eq("id", payment.id).single(),
      loadOpenInvoices(supabaseAdmin, payment.customer_id),
    ]);
    const outstanding = Math.round(remaining.reduce((s: number, i: any) => s + i.balance, 0) * 100) / 100;
    const stillOverdue = remaining.some((i: any) => i.is_overdue);

    let resumed: any = null;
    if (!stillOverdue) {
      try { resumed = await resumeSuspendedForCustomer(supabaseAdmin, payment.customer_id); } catch { /* non-fatal */ }
    }

    const total = planned.reduce((s, a) => s + a.amount, 0);
    const invoiceNumbers = planned
      .map((a) => (openInvoices.find((i: any) => i.id === a.invoice_id) as any)?.invoice_number)
      .filter(Boolean);

    await recordCustomerEvent(supabaseAdmin, {
      customer_id: payment.customer_id,
      account_number: payment.account_number,
      event_type: "payment_reconciled",
      title: `Payment ${payment.receipt_number ?? ""} applied to ${planned.length} invoice${planned.length === 1 ? "" : "s"}`.trim(),
      description: `${payment.currency || "USD"} ${total.toFixed(2)} applied${invoiceNumbers.length ? ` to ${invoiceNumbers.join(", ")}` : ""} · balance now ${outstanding.toFixed(2)}`,
      module: "billing",
      entity_type: "payment",
      entity_id: payment.id,
      old_value: { unapplied },
      new_value: { allocations: planned, outstanding_after: outstanding, resumed_services: resumed?.total ?? 0 },
      major: true,
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
    });

    return {
      applied: Math.round(total * 100) / 100,
      allocations: planned,
      invoiceNumbers,
      unappliedAfter: Math.max(0, Math.round((unapplied - total) * 100) / 100),
      reconciliationStatus: (after as any)?.reconciliation_status ?? "pending",
      outstandingAfter: outstanding,
      resumedServices: resumed?.total ?? 0,
    };
  });

/* ---------- Email an invoice to the customer ---------- */

const SITE = "https://management.imtsolutions.co.zw";

/**
 * Sends a real branded invoice email from the acting staff member's address
 * (name.surname@<verified domain>, reply-to their real mailbox), including a
 * link to the invoice, then logs the send on the customer's timeline + audit.
 */
export const emailInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { invoice_id: string; to?: string }) => input)
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invoice, error } = await supabaseAdmin
      .from("invoices")
      .select("*, customers:customer_id(id, company_name, primary_email, account_number)")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found");

    const cust = (invoice as any).customers;
    const recipient = (data.to || cust?.primary_email || "").trim();
    if (!recipient || !/@/.test(recipient)) throw new Error("This customer has no email address on file.");

    const [itemsR, profileR] = await Promise.all([
      supabaseAdmin.from("invoice_line_items").select("*").eq("invoice_id", invoice.id).order("position"),
      supabaseAdmin.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle(),
    ]);
    const items = rows(itemsR as any).map((i: any) => ({
      description: i.description,
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      line_total:
        Number(i.line_total ?? (Number(i.quantity) || 0) * (Number(i.unit_price) || 0)) || 0,
    }));

    const profile = (profileR as any)?.data ?? null;
    const senderEmail = (profile?.email || (context.claims?.email as string) || "").trim();
    const senderName = profile?.full_name || senderEmail.split("@")[0] || "IMT Solutions";
    const invoiceUrl = `${SITE}/invoices/${invoice.id}`;

    const { sendTemplateEmail } = await import("./email-templates/send-email");
    const res = await sendTemplateEmail("invoice", recipient, {
      templateData: {
        companyName: cust?.company_name,
        invoiceNumber: (invoice as any).invoice_number,
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date,
        currency: invoice.currency || "USD",
        subtotal: Number(invoice.subtotal ?? 0),
        tax: Number(invoice.tax ?? 0),
        total: Number((invoice as any).total ?? 0),
        items,
        invoiceUrl,
      },
      idempotencyKey: `invoice-${invoice.id}-${Date.now()}`,
      fromName: `${senderName} (IMT Solutions)`,
      ...(senderEmail ? { fromLocal: senderEmail, replyTo: senderEmail } : {}),
    });

    if (!res.sent) throw new Error("This recipient is suppressed and cannot receive email.");

    const { senderFrom } = await import("./email-templates/send-email");
    const fromHeader = senderFrom(`${senderName} (IMT Solutions)`, senderEmail);

    // Mark it as sent so the pipeline reflects reality.
    if (invoice.status === "draft") {
      await supabaseAdmin.from("invoices").update({ status: "sent" } as any).eq("id", invoice.id);
    }

    if (cust?.id) {
      const { recordCustomerEvent } = await import("./customer-events.server");
      await recordCustomerEvent(supabaseAdmin, {
        customer_id: cust.id,
        account_number: cust.account_number,
        event_type: "invoice_sent",
        title: `Invoice ${(invoice as any).invoice_number} emailed to ${recipient}`,
        description: `${invoice.currency || "USD"} ${Number((invoice as any).total ?? 0).toFixed(2)} · sent by ${senderName}`,
        module: "billing",
        entity_type: "invoice",
        entity_id: invoice.id,
        new_value: { to: recipient, from: fromHeader, invoice_url: invoiceUrl, total: Number((invoice as any).total ?? 0) },
        major: true,
        actor_id: context.userId,
        actor_email: senderEmail || null,
      });

      await supabaseAdmin.from("communications").insert({
        customer_id: cust.id,
        account_number: cust.account_number,
        channel: "email",
        direction: "outbound",
        subject: `Invoice ${(invoice as any).invoice_number}`,
        body: `Invoice emailed to ${recipient}. ${invoiceUrl}`,
        status: "sent",
        created_by: context.userId,
      } as any).then(undefined, () => {});
    }

    return { ok: true, to: recipient, from: fromHeader, invoiceUrl };
  });
