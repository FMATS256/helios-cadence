import { statementModel, statementWindow, statementAllocatedInvoices, STATEMENT_MAILBOX } from "./statement-document.shared";
import { statementPdf } from "./statement-document.server";
import { officialInvoicePdf, invoicePdfResponse } from "./invoice-document.server";
import { accountManagerContact } from "./account-managers.server";
import { createAndSendEnquiryEmail } from "./inbox.server";

export async function prepareClientStatements(db: any, customerId: string, from: string, to: string) {
  const customerR = await db.from("customers").select("*").eq("id", customerId).is("archived_at", null).single();
  if (customerR.error || !customerR.data) throw new Error("Client account is unavailable");
  const customer = customerR.data;
  const results = await Promise.all([
    db.from("invoices").select("*").eq("customer_id", customerId).is("archived_at", null).lte("issue_date", to).not("status", "in", "(draft,void,cancelled)"),
    db.from("payments").select("*").eq("customer_id", customerId).eq("status", "received").lte("paid_at", `${to}T23:59:59.999+02:00`),
    db.from("refunds").select("*").eq("customer_id", customerId).in("status", ["completed", "recorded"]).lte("refunded_at", `${to}T23:59:59.999+02:00`),
  ]);
  if (results.some(r => r.error)) throw new Error("Statement transactions could not be loaded");
  const [rawInvoices, payments, refunds] = results.map(r => r.data ?? []);
  const ids = rawInvoices.map((i: any) => i.id);
  const allocations = ids.length ? await db.from("payment_allocations").select("invoice_id,amount,payments:payment_id(status,paid_at)").in("invoice_id", ids) : { data: [], error: null };
  if (allocations.error) throw new Error("Statement invoice balances could not be loaded");
  const invoices = statementAllocatedInvoices(rawInvoices, allocations.data ?? [], to);
  const manager = await accountManagerContact(db, customer.account_manager_id);
  const currencies: string[] = [...new Set<string>([...invoices, ...payments, ...refunds].map(r => String(r.currency)))];
  if (!currencies.length) currencies.push("USD");
  const files = [];
  for (const currency of currencies) {
    const model = statementModel(customer, invoices, payments, refunds, from, to, currency);
    files.push(invoicePdfResponse(await statementPdf(model, manager?.name || "Finance Department", { email: manager?.email, phone: manager?.phone }), `Statement-${customer.account_number}-${to}-${currency}`));
  }
  return { customer, manager, invoices, files };
}

/** Deterministic monthly duty: never creates invoices or approves funds. */
export async function sendMonthlyStatements(now = new Date()) {
  const window = statementWindow(now);
  if (!window.due) return { sent: 0, blocked: 0, skipped: 0, notDue: true };
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const schedule = await db.from("finance_statement_schedule").select("enabled").eq("id", true).maybeSingle();
  if (schedule.error || !schedule.data?.enabled) throw new Error("Monthly statement schedule is not enabled");
  const customersR = await db.from("customers").select("id,primary_email,account_manager_id").is("archived_at", null);
  if (customersR.error) throw customersR.error;
  let sent = 0, blocked = 0, skipped = 0;
  for (const c of customersR.data ?? []) {
    const claim = await db.from("finance_statement_deliveries").insert({ customer_id: c.id, period: window.period, statement_date: window.to, recipient: c.primary_email }).select("id").single();
    if (claim.error?.code === "23505") { skipped++; continue; }
    if (claim.error || !claim.data) throw new Error("Unable to reserve monthly statement delivery");
    try {
      if (!c.primary_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.primary_email)) throw new Error("Client billing email is missing or invalid");
      if (!c.account_manager_id) throw new Error("Client account manager is missing");
      const prepared = await prepareClientStatements(db, c.id, window.from, window.to);
      const files = [...prepared.files];
      // Attach every open invoice, plus invoices issued this statement period.
      const invoices = prepared.invoices.filter((i: any) => Number(i.total) > Number(i.amount_paid) || i.issue_date >= window.from);
      for (const inv of invoices) {
        const [lines, allocations] = await Promise.all([
          db.from("invoice_line_items").select("*").eq("invoice_id", inv.id).order("position"),
          db.from("payment_allocations").select("amount,payments:payment_id(status)").eq("invoice_id", inv.id),
        ]);
        if (lines.error || allocations.error) throw new Error("Invoice details unavailable; no email sent");
        const pdf = await officialInvoicePdf(inv, lines.data ?? [], prepared.customer, allocations.data ?? [], { userId: c.account_manager_id, userName: prepared.manager?.name || "IMT Solutions" }, { name: prepared.manager?.name || "IMT Solutions", email: prepared.manager?.email, phone: prepared.manager?.phone });
        files.push(invoicePdfResponse(pdf.bytes, inv.invoice_number));
      }
      if (files.reduce((s, f) => s + f.base64.length * 0.75, 0) > 15 * 1024 * 1024) throw new Error("Monthly documents exceed attachment size limit; Finance review required");
      const result = await createAndSendEnquiryEmail({
        senderId: c.account_manager_id, senderName: "IMT Solutions Finance", senderRole: "Finance", senderEmail: STATEMENT_MAILBOX, mailbox: STATEMENT_MAILBOX, noSignature: true,
        to: c.primary_email, customerId: c.id, subject: `Account statement ${prepared.customer.account_number} - ${window.to}`, originalSubject: true,
        body: `Dear ${prepared.customer.company_name},\n\nPlease find your account statement as at ${window.to}${invoices.length ? " and invoice(s)" : ""} attached.\n\nFor account queries, reply to this email.`, files: files.map(f => ({ ...f, contentType: "application/pdf" })),
      });
      if (!result.ok) throw new Error(result.error);
      const saved = await db.from("finance_statement_deliveries").update({ status: "sent", message_id: result.messageId, completed_at: new Date().toISOString() }).eq("id", claim.data.id);
      if (saved.error) throw new Error("Email accepted but delivery status could not be saved; do not resend");
      sent++;
    } catch (e) {
      const error = e instanceof Error ? e.message : "Statement delivery failed";
      await db.from("finance_statement_deliveries").update({ status: "blocked", error, completed_at: new Date().toISOString() }).eq("id", claim.data.id);
      blocked++;
    }
  }
  return { sent, blocked, skipped, notDue: false };
}