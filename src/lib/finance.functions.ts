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

/** Money-changing finance actions are billing-only. */
async function ensureBilling(context: { supabase: any; userId: string }) {
  await ensureStaff(context);
  const { assertBillingStaff } = await import("./customer360.server");
  await assertBillingStaff(context as any);
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
    await ensureBilling(context);
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

export const getStaffInvoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { invoice_id: string }) => input)
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { data: invoice, error } = await context.supabase.from("invoices").select("*, customers:customer_id(company_name,primary_email,billing_address,primary_phone,account_number,account_manager_id)").eq("id", data.invoice_id).is("archived_at", null).maybeSingle();
    if (error || !invoice) throw new Error("Invoice not found");
    const [lines, allocations] = await Promise.all([
      context.supabase.from("invoice_line_items").select("*").eq("invoice_id", invoice.id).order("position"),
      context.supabase.from("payment_allocations").select("amount,payments:payment_id(status)").eq("invoice_id", invoice.id),
    ]);
    if (lines.error || allocations.error) throw new Error("Invoice details could not be loaded");
    const { officialInvoicePdf, invoicePdfResponse } = await import("./invoice-document.server");
    const { accountManagerContact } = await import("./account-managers.server");
    const manager = await accountManagerContact(context.supabase, invoice.customers?.account_manager_id);
    if (!manager?.name) throw new Error("Account manager details must be completed before downloading");
    const { bytes } = await officialInvoicePdf(invoice, lines.data ?? [], invoice.customers, allocations.data ?? [], { userId: context.userId, userName: manager.name });
    return invoicePdfResponse(bytes, invoice.invoice_number);
  });

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
      .select("*, customers:customer_id(id, company_name, primary_email, account_number, billing_address, account_manager_id)")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found");

    // Separation of duties: account managers may send an invoice billing has
    // already approved (issued), but never a draft or a voided invoice.
    const { isBillingStaff } = await import("./customer360.server");
    if (!(await isBillingStaff(context as any))) {
      const st = String((invoice as any).status || "");
      if (st === "draft") {
        throw new Error("This invoice is still a draft. Billing must issue it before it can be sent.");
      }
      if (st === "void") throw new Error("This invoice has been voided and cannot be sent.");
    }

    const cust = (invoice as any).customers;
    const recipient = (data.to || cust?.primary_email || "").trim();
    if (!recipient || !/@/.test(recipient)) throw new Error("This customer has no email address on file.");

    const [itemsR, allocR, profileR] = await Promise.all([
      supabaseAdmin.from("invoice_line_items").select("*").eq("invoice_id", invoice.id).order("position"),
      supabaseAdmin.from("payment_allocations").select("amount").eq("invoice_id", invoice.id),
      supabaseAdmin.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle(),
    ]);
    const lineRows = rows(itemsR as any) as any[];
    const items = lineRows.map((i: any) => ({
      description: i.description,
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      line_total:
        Number(i.line_total ?? (Number(i.quantity) || 0) * (Number(i.unit_price) || 0)) || 0,
    }));

    // The email goes out from the customer's account manager — their name,
    // their mailbox as reply-to, their signature. Fallback: the acting staffer.
    const { accountManagerContact } = await import("./account-managers.server");
    const am = await accountManagerContact(supabaseAdmin, cust?.account_manager_id).catch(() => null);
    const profile = (profileR as any)?.data ?? null;
    const senderEmail = (am?.email || profile?.email || (context.claims?.email as string) || "").trim();
    const senderName = am?.name || profile?.full_name || senderEmail.split("@")[0] || "IMT Solutions";
    const invoiceUrl = `${SITE}/invoices/${invoice.id}`;

    // Attach the official Quote Studio PDF — the same document the client downloads.
    const { officialInvoicePdf } = await import("./invoice-document.server");
    const pdf = await officialInvoicePdf(invoice, lineRows, cust, rows(allocR as any) as any[], { userId: context.userId, userName: senderName });
    const attachment = {
      filename: `${String((invoice as any).invoice_number).replace(/[^\w.-]+/g, "-")}.pdf`,
      content: pdf.bytes,
      contentType: "application/pdf",
    };
    const { imtSignature } = await import("./email-signature.shared");
    const signatureHtml = imtSignature({ name: senderName, role: "account_manager", email: senderEmail || "sales@imtsolutions.co.zw" });
    const fromHeader = `"${senderName} (IMT Solutions)" <${senderEmail}>`;

    const templateData = {
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
    };

    const { sendResendEmail } = await import("./email-templates/send-resend");
    const res = await sendResendEmail({
      templateName: "invoice",
      to: recipient,
      templateData,
      replyTo: senderEmail || undefined,
      from: senderEmail ? fromHeader : undefined,
      signatureHtml,
      attachments: [attachment],
    });

    if (!res.sent) throw new Error("Invoice email could not be sent — please try again.");

    // Land a copy in the account manager's real IMT inbox so they have the
    // exact invoice email in their own mailbox.
    let copySent = false;
    if (senderEmail && senderEmail.toLowerCase() !== recipient.toLowerCase()) {
      const copy = await sendResendEmail({
        templateName: "invoice",
        to: senderEmail,
        templateData: { ...templateData, recipientTitle: undefined },
        replyTo: recipient,
        from: senderEmail ? fromHeader : undefined,
        signatureHtml,
        attachments: [attachment],
      }).catch(() => null);
      copySent = !!copy?.sent;
    }

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

    return { ok: true, to: recipient, from: fromHeader, invoiceUrl, copySentTo: copySent ? senderEmail : null };
  });

/* =========================================================================
 * CUSTOMER FINANCIAL ACCOUNT
 * A single financial account per customer: statement of every invoice,
 * payment, credit, refund and subscription, with ageing and lifetime totals.
 * =======================================================================*/

export const getCustomerFinancialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string }) => input)
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const num = (v: any) => Number(v || 0);
    const r2 = (v: number) => Math.round(v * 100) / 100;

    const { data: customer } = await db.from("customers")
      .select("id, company_name, account_number, status, primary_email, primary_phone, account_type, tags")
      .eq("id", data.customer_id).maybeSingle();
    if (!customer) throw new Error("Customer not found");

    const [invR, payR, allocR, credR, refR, subR, subsR, expR, schR, insR] = await Promise.all([
      db.from("invoices").select("id, invoice_number, status, issue_date, due_date, currency, subtotal, tax, total, paid_at")
        .eq("customer_id", customer.id).is("archived_at", null).order("issue_date", { ascending: false }),
      db.from("payments").select("id, receipt_number, amount, currency, method, reference, status, paid_at, invoice_id, cash_account_id, reconciliation_status")
        .eq("customer_id", customer.id).order("paid_at", { ascending: false }),
      db.from("payment_allocations").select("payment_id, invoice_id, amount"),
      db.from("customer_credits").select("id, amount, currency, kind, note, created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }),
      db.from("refunds").select("id, amount, currency, method, status, reason, refunded_at, created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }),
      db.from("subscriptions").select("id, plan_name, amount, currency, billing_cycle, status, next_renewal, started_on").eq("customer_id", customer.id),
      db.from("payment_submissions").select("id, amount, currency, status, method, payment_date, reference, receipt_number, cash_account_id, created_at")
        .eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(50),
      db.from("expenses")
        .select("id, expense_date, category, vendor, description, amount, currency, status, service_task_id, attachment_url, service_tasks:service_task_id(id, title)")
        .eq("customer_id", customer.id).order("expense_date", { ascending: false }).limit(300),
      db.from("payment_schedules").select("*, invoices:invoice_id(id, invoice_number)")
        .eq("customer_id", customer.id).order("created_at", { ascending: false }),
      db.from("payment_schedule_installments").select("*").eq("customer_id", customer.id).order("due_date", { ascending: true }),
    ]);


    const invoices = rows(invR) as any[];
    const payments = rows(payR) as any[];
    const allocs = rows(allocR) as any[];
    const invIds = new Set(invoices.map((i) => i.id));
    const mine = allocs.filter((a: any) => invIds.has(a.invoice_id));

    const paidByInvoice: Record<string, number> = {};
    for (const a of mine) paidByInvoice[a.invoice_id] = (paidByInvoice[a.invoice_id] || 0) + num(a.amount);
    const allocByPayment: Record<string, number> = {};
    for (const a of allocs) allocByPayment[a.payment_id] = (allocByPayment[a.payment_id] || 0) + num(a.amount);

    const now = Date.now();
    const ageing = { current: 0, d30: 0, d60: 0, d90: 0 };
    const invoiceRows = invoices.map((i) => {
      const paid = r2(paidByInvoice[i.id] || 0);
      const balance = i.status === "void" ? 0 : r2(Math.max(0, num(i.total) - paid));
      const daysOverdue = i.due_date && balance > 0.005
        ? Math.floor((now - new Date(i.due_date).getTime()) / 86400000) : 0;
      if (balance > 0.005) {
        if (daysOverdue <= 0) ageing.current += balance;
        else if (daysOverdue <= 30) ageing.d30 += balance;
        else if (daysOverdue <= 60) ageing.d60 += balance;
        else ageing.d90 += balance;
      }
      return { ...i, paid_amount: paid, balance, days_overdue: Math.max(0, daysOverdue) };
    });

    const paymentRows = payments
      .filter((p) => p.status !== "failed")
      .map((p) => ({ ...p, allocated: r2(allocByPayment[p.id] || 0), unallocated: r2(Math.max(0, num(p.amount) - (allocByPayment[p.id] || 0))) }));

    const accountIds = Array.from(new Set(paymentRows.map((p) => p.cash_account_id).filter(Boolean)));
    const { data: accts } = accountIds.length
      ? await db.from("cash_accounts").select("id, name, kind").in("id", accountIds as string[])
      : { data: [] as any[] };
    const accountName: Record<string, string> = {};
    for (const a of (accts ?? []) as any[]) accountName[a.id] = a.name;

    const CYCLE: Record<string, number> = {
      monthly: 1, quarterly: 1 / 3, semi_annual: 1 / 6, semiannual: 1 / 6,
      annual: 1 / 12, yearly: 1 / 12, weekly: 4.345, daily: 30.44, one_time: 0,
    };
    const subscriptions = rows(subsR) as any[];
    const mrr = r2(subscriptions.filter((s) => s.status === "active")
      .reduce((t, s) => t + num(s.amount) * (CYCLE[String(s.billing_cycle || "monthly").toLowerCase()] ?? 1), 0));

    const credits = rows(credR) as any[];
    const refunds = rows(refR) as any[];
    const invoicedTotal = r2(invoiceRows.filter((i) => i.status !== "void").reduce((t, i) => t + num(i.total), 0));
    const paidTotal = r2(invoiceRows.reduce((t, i) => t + i.paid_amount, 0));
    const balanceDue = r2(invoiceRows.reduce((t, i) => t + i.balance, 0));
    const creditBalance = r2(credits.reduce((t, c) => t + (String(c.kind) === "debit" ? -num(c.amount) : num(c.amount)), 0));
    const refundedTotal = r2(refunds.filter((x) => x.status === "completed" || x.status === "recorded").reduce((t, x) => t + num(x.amount), 0));

    // Job expenses recorded against this customer (cost of delivery, by category).
    const expenseRows = (rows(expR) as any[]).map((e) => ({
      ...e,
      job_title: e.service_tasks?.title ?? null,
      is_job_expense: !!e.service_task_id,
    }));
    const expenseTotal = r2(expenseRows.reduce((t, e) => t + num(e.amount), 0));
    const jobExpenseTotal = r2(expenseRows.filter((e) => e.is_job_expense).reduce((t, e) => t + num(e.amount), 0));
    const expensesByCategory = Object.entries(
      expenseRows.reduce((acc: Record<string, number>, e) => {
        const key = String(e.category || "general");
        acc[key] = r2((acc[key] || 0) + num(e.amount));
        return acc;
      }, {}),
    ).map(([category, amount]) => ({ category, amount: amount as number }))
      .sort((a, b) => b.amount - a.amount);

    // Installment plans and their live due / overdue state.
    const { decorateInstallments } = await import("./schedules.functions");
    const installments = decorateInstallments(rows(insR) as any[]);
    const schedules = (rows(schR) as any[]).map((s) => {
      const mine = installments.filter((i) => i.schedule_id === s.id);
      return {
        ...s,
        installments: mine,
        scheduled: r2(mine.reduce((t, i) => t + num(i.amount_due), 0)),
        paidAmount: r2(mine.reduce((t, i) => t + num(i.amount_paid), 0)),
        outstanding: r2(mine.reduce((t, i) => t + i.outstanding, 0)),
        overdue_amount: r2(mine.filter((i) => i.state === "overdue").reduce((t, i) => t + i.outstanding, 0)),
        overdue_count: mine.filter((i) => i.state === "overdue").length,
        next_due: mine.find((i) => i.state !== "paid" && i.status !== "cancelled") ?? null,
      };
    });
    const scheduleTotals = {
      scheduled: r2(schedules.reduce((t, s) => t + s.scheduled, 0)),
      paid: r2(schedules.reduce((t, s) => t + s.paidAmount, 0)),
      outstanding: r2(schedules.reduce((t, s) => t + s.outstanding, 0)),
      overdue: r2(schedules.reduce((t, s) => t + s.overdue_amount, 0)),
      overdueCount: schedules.reduce((t, s) => t + s.overdue_count, 0),
    };


    // Running statement, newest first.
    const statement = [
      ...invoiceRows.filter((i) => i.status !== "void").map((i) => ({
        date: i.issue_date, kind: "invoice", label: `Invoice ${i.invoice_number}`,
        reference: i.invoice_number, debit: num(i.total), credit: 0, currency: i.currency, status: i.status, id: i.id,
      })),
      ...paymentRows.map((p) => ({
        date: String(p.paid_at ?? "").slice(0, 10), kind: "payment",
        label: `Payment ${p.receipt_number ?? ""}`.trim(), reference: p.reference ?? p.receipt_number ?? null,
        debit: 0, credit: num(p.amount), currency: p.currency, status: p.status, id: p.id,
        account: p.cash_account_id ? accountName[p.cash_account_id] ?? null : null,
      })),
      ...refunds.map((x) => ({
        date: String(x.refunded_at ?? x.created_at ?? "").slice(0, 10), kind: "refund",
        label: "Refund", reference: null, debit: num(x.amount), credit: 0, currency: x.currency, status: x.status, id: x.id,
      })),
      ...credits.map((c) => ({
        date: String(c.created_at ?? "").slice(0, 10), kind: "credit", label: c.note || `Credit (${c.kind})`,
        reference: null, debit: String(c.kind) === "debit" ? num(c.amount) : 0,
        credit: String(c.kind) === "debit" ? 0 : num(c.amount), currency: c.currency, status: c.kind, id: c.id,
      })),
    ].sort((a, b) => {
      const d = String(b.date).localeCompare(String(a.date));
      if (d !== 0) return d;
      // Same day: invoices are issued before payments/refunds are applied, so
      // in this newest-first list payments come first.
      const order = (k: string) => (k === "payment" || k === "credit" ? 0 : 1);
      return order(a.kind) - order(b.kind);
    });

    let running = r2(statement.reduce((t, e) => t + e.debit - e.credit, 0));
    const ledger = statement.map((e) => {
      const row = { ...e, balance: r2(running) };
      running = r2(running - e.debit + e.credit);
      return row;
    });

    return {
      customer,
      totals: {
        invoiced: invoicedTotal,
        paid: paidTotal,
        balance: balanceDue,
        creditBalance,
        refunded: refundedTotal,
        mrr,
        arr: r2(mrr * 12),
        openInvoices: invoiceRows.filter((i) => i.balance > 0.005).length,
        overdue: r2(ageing.d30 + ageing.d60 + ageing.d90),
        lastPaymentAt: paymentRows[0]?.paid_at ?? null,
        lastPaymentAmount: paymentRows[0] ? num(paymentRows[0].amount) : 0,
        unallocated: r2(paymentRows.reduce((t, p) => t + p.unallocated, 0)),
        expenses: expenseTotal,
        jobExpenses: jobExpenseTotal,
        margin: r2(invoicedTotal - expenseTotal),
        scheduled: scheduleTotals.scheduled,
        scheduledOutstanding: scheduleTotals.outstanding,
        scheduledOverdue: scheduleTotals.overdue,
      },
      ageing: { current: r2(ageing.current), d30: r2(ageing.d30), d60: r2(ageing.d60), d90: r2(ageing.d90) },
      invoices: invoiceRows,
      payments: paymentRows.map((p) => ({ ...p, account_name: p.cash_account_id ? accountName[p.cash_account_id] ?? null : null })),
      credits,
      refunds,
      subscriptions,
      submissions: rows(subR) as any[],
      expenses: expenseRows,
      expensesByCategory,
      schedules,
      scheduleTotals,
      ledger,

    };
  });
