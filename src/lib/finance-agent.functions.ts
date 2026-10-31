import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BILLING_MAILBOX, validEmailPayment } from "./finance-billing.shared";

async function assertFinance(context: { supabase: any; userId: string }) {
  const [f, a] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "finance" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "master_admin" }),
  ]);
  if (!f.data && !a.data) throw new Error("Only Finance staff can use the Finance agent");
}

export const getFinanceAgent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context);
    const [s, t, p] = await Promise.all([
      context.supabase.from("finance_agent_settings").select("*").eq("id", true).single(),
      context.supabase.from("finance_agent_tasks").select("*").order("created_at", { ascending: false }).limit(30),
      context.supabase.from("finance_agent_proposals").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    const { data: messages, error: mailError } = await context.supabase.from("email_messages").select("id,subject,from_address,body_text,created_at,email_enquiries!inner(id,customer_id,mailbox_address)").eq("direction", "inbound").eq("email_enquiries.mailbox_address", BILLING_MAILBOX).order("created_at", { ascending: false }).limit(30);
    if (mailError) throw new Error("Unable to load billing correspondence");
    const [deliveries, scheduled, clients] = await Promise.all([
      context.supabase.from("finance_statement_deliveries").select("*,customers(company_name,account_number)").order("created_at", { ascending: false }).limit(100),
      context.supabase.rpc("finance_statement_schedule_status"),
      context.supabase.from("customers").select("id,company_name,account_number,primary_email").is("archived_at", null),
    ]);
    if (deliveries.error || scheduled.error || clients.error) throw new Error("Unable to load monthly statement status");
    return { settings: s.data, tasks: t.data ?? [], proposals: p.data ?? [], messages: messages ?? [], mailbox: BILLING_MAILBOX, deliveries: deliveries.data ?? [], scheduled: scheduled.data, statementClients: clients.data ?? [] };
  });

export const refreshFinanceMailbox = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertFinance(context);
  const { syncBillingMailbox } = await import("./finance-billing.server");
  return syncBillingMailbox();
});

export const downloadFinanceStatement = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { customer_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { prepareClientStatements } = await import("./finance-statements.server");
    const now = new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 10);
    return (await prepareClientStatements(db, data.customer_id, `${now.slice(0, 7)}-01`, now)).files;
  });

export const saveFinanceAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agent_name: string; persona: string; enabled_roles: string[] }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { error } = await context.supabase.from("finance_agent_settings").update({
      agent_name: data.agent_name.trim() || "Finance Agent", persona: data.persona.slice(0, 2000),
      enabled_roles: data.enabled_roles, updated_by: context.userId, updated_at: new Date().toISOString(),
    }).eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignFinanceAgentTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title: string; instructions: string; role: string }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    if (!data.title.trim()) throw new Error("Give the task a title");
    const { syncBillingMailbox } = await import("./finance-billing.server");
    await syncBillingMailbox();
    const { data: task, error } = await context.supabase.from("finance_agent_tasks").insert({
      title: data.title.trim(), instructions: data.instructions.slice(0, 4000), role: data.role, created_by: context.userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const { runFinanceAgentTask } = await import("./finance-agent.server");
    await runFinanceAgentTask(task.id);
    return { id: task.id };
  });

export const reviewFinanceProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; decision: "approve" | "reject" }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: p } = await db.from("finance_agent_proposals")
      .update({ status: data.decision === "reject" ? "rejected" : "applying", reviewed_by: context.userId, reviewed_at: now })
      .eq("id", data.id).eq("status", "pending").select("*").maybeSingle();
    if (!p) throw new Error("This proposal was already reviewed");
    if (data.decision === "reject") return { ok: true };

    const payload: any = p.payload;
    let result = "";
    try {
      if (p.kind === "email_payment") {
        const { data: message } = await db.from("email_messages").select("id,direction,email_enquiries!inner(customer_id,mailbox_address)").eq("id", payload.target).maybeSingle();
        const enquiry: any = message?.email_enquiries;
        const inv = payload.invoice_id ? (await db.from("invoices").select("customer_id,currency").eq("id", payload.invoice_id).maybeSingle()).data : null;
        if (!message || message.direction !== "inbound" || enquiry?.mailbox_address !== BILLING_MAILBOX || enquiry.customer_id !== payload.customer_id || (payload.invoice_id && !inv) || !validEmailPayment(payload.amount, payload.currency, payload.customer_id, inv)) throw new Error("Payment evidence no longer matches this customer/invoice");
        const { data: prior, error: priorError } = await db.from("payment_submissions").select("id").eq("external_id", `billing-email:${message.id}`).limit(1);
        if (priorError) throw priorError;
        if (prior?.length) throw new Error("This payment email was already submitted to Finance");
        const { data: customer } = await db.from("customers").select("account_number").eq("id", payload.customer_id).single();
        const { data: duplicates, error: duplicateError } = await db.from("payment_submissions").select("id").eq("customer_id", payload.customer_id).eq("reference", payload.reference).in("status", ["pending", "clarification", "approved"]).limit(1);
        if (duplicateError) throw duplicateError;
        if (duplicates?.length) throw new Error("A submission with this payment reference already exists; verify it in Finance");
        const { error } = await db.from("payment_submissions").insert({ customer_id: payload.customer_id, account_number: customer?.account_number, invoice_id: payload.invoice_id, amount: payload.amount, currency: payload.currency, payment_date: payload.payment_date, reference: payload.reference, method: "bank_transfer", status: "pending", source: "billing_email", external_id: `billing-email:${message.id}`, external_payload: { message_id: message.id, proposal_id: p.id }, notes: `Unverified client email claim. Review original billing email ${message.id} and verify funds before approving.`, submitted_by: context.userId });
        if (error) throw error;
        result = "Payment claim received in Finance; awaiting verification, no ledger payment recorded";
      } else if (p.kind === "payment_match") {
        const { data: rows, error } = await db.from("payment_submissions").update({ invoice_id: payload.invoice_id })
          .eq("id", payload.target).eq("status", "pending").is("invoice_id", null).select("id");
        if (error) throw error;
        if (!rows?.length) throw new Error("Payment is no longer pending or already linked");
        result = `Linked to ${payload.invoice_number}; still awaits normal Finance approval`;
      } else if (p.kind === "expense_decision") {
        const status = payload.decision === "approve" ? "approved" : "rejected";
        const { data: rows, error } = await db.from("expenses").update({ status }).eq("id", payload.target).eq("status", "pending").select("id");
        if (error) throw error;
        if (!rows?.length) throw new Error("Expense is no longer pending");
        result = `Expense ${status}`;
      } else if (p.kind === "payment_reminder") {
        const { data: invoice } = await db.from("invoices").select("id,total,amount_paid,status,currency,customer_id,customers(primary_email)").eq("id", payload.target).is("archived_at", null).maybeSingle();
        const customer: any = invoice?.customers;
        if (!invoice || ["paid", "void", "cancelled", "draft"].includes(invoice.status) || Number(invoice.total) - Number(invoice.amount_paid) <= 0.005 || invoice.customer_id !== payload.customer_id || customer?.primary_email !== payload.to) throw new Error("Invoice is settled, unavailable or recipient changed; generate a fresh reminder");
        if (payload.balance === undefined || Math.abs(Number(invoice.total) - Number(invoice.amount_paid) - payload.balance) > 0.005 || invoice.currency !== payload.currency) throw new Error("Invoice balance changed; generate a fresh reminder before sending");
        const { createAndSendEnquiryEmail } = await import("./inbox.server");
        const sent = await createAndSendEnquiryEmail({
          senderId: context.userId, senderName: "IMT Solutions Billing", senderRole: "Finance",
          senderEmail: BILLING_MAILBOX, mailbox: BILLING_MAILBOX, to: payload.to, subject: payload.subject,
          body: payload.body, customerId: payload.customer_id, originalSubject: true,
        });
        if (!sent.ok) throw new Error(sent.error);
        result = `Reminder sent to ${payload.to}`;
      } else throw new Error("Unknown proposal type");
      await db.from("finance_agent_proposals").update({ status: "applied", apply_result: result }).eq("id", p.id);
      return { ok: true, result };
    } catch (e: any) {
      await db.from("finance_agent_proposals").update({ status: "failed", apply_result: e?.message ?? "Failed" }).eq("id", p.id);
      throw new Error(e?.message ?? "Failed");
    }
  });
