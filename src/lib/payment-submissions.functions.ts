/**
 * Payment submission workflow.
 * ============================
 * Separation of duties: account managers submit payment evidence, billing
 * verifies and records the official payment. Every state change is validated
 * server-side, audited and notified — the frontend cannot bypass it.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordCustomerEvent, recordAudit } from "./customer-events.server";

type Ctx = { supabase: any; userId: string };

const n = (v: any) => Number(v || 0);
const round = (v: number) => Math.round(v * 100) / 100;

async function assertStaff(context: Ctx) {
  const { data } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
  if (!data) throw new Error("Your account needs a staff role to use billing.");
}

/** Billing = finance, operations manager or master admin. */
export async function isBillingUser(context: Ctx): Promise<boolean> {
  const [fin, ops, master] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "finance" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operations_manager" }),
    context.supabase.rpc("is_master_admin", { _user_id: context.userId }),
  ]);
  return Boolean(fin.data || ops.data || master.data);
}

async function assertBilling(context: Ctx) {
  await assertStaff(context);
  if (!(await isBillingUser(context))) {
    throw new Error("Only billing (finance, operations manager or master admin) can perform this action.");
  }
}

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

/** Bank / cash / mobile money accounts money can be banked into. */
async function cashAccounts(db: any) {
  const { data } = await db.from("cash_accounts")
    .select("id,name,kind,currency,is_default,is_active")
    .eq("is_active", true)
    .order("is_default", { ascending: false }).order("name");
  return data ?? [];
}

/** Records the deposit on the finance ledger so the account balance moves. */
async function bankDeposit(db: any, args: {
  account_id: string; amount: number; currency: string; occurred_at: string;
  reference?: string | null; notes?: string | null; created_by?: string | null;
}) {
  const { error } = await db.from("cash_movements").insert({
    account_id: args.account_id,
    kind: "deposit",
    amount: args.amount,
    currency: args.currency || "USD",
    occurred_at: args.occurred_at,
    reference: args.reference || null,
    notes: args.notes || null,
    created_by: args.created_by || null,
  } as any);
  if (error) throw new Error(`Payment recorded but the ledger deposit failed: ${error.message}`);
}

async function openInvoicesFor(db: any, customerId: string) {
  const [invR, allocR] = await Promise.all([
    db.from("invoices").select("id,invoice_number,total,currency,issue_date,due_date,status")
      .eq("customer_id", customerId).is("archived_at", null)
      .not("status", "in", "(void,cancelled)").order("due_date", { ascending: true }),
    db.from("payment_allocations").select("invoice_id, amount"),
  ]);
  const paid: Record<string, number> = {};
  for (const a of (allocR.data ?? [])) paid[a.invoice_id] = (paid[a.invoice_id] || 0) + n(a.amount);
  return (invR.data ?? []).map((i: any) => {
    const balance = round(Math.max(0, n(i.total) - (paid[i.id] || 0)));
    return { ...i, paid_amount: round(paid[i.id] || 0), balance };
  }).filter((i: any) => i.balance > 0.005);
}

async function billingUserIds(db: any): Promise<string[]> {
  const { data } = await db.from("user_roles").select("user_id, role")
    .in("role", ["finance", "operations_manager", "master_admin"]);
  return Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
}

async function notifyUsers(db: any, userIds: string[], kind: string, title: string, body: string, link: string) {
  const ids = userIds.filter(Boolean);
  if (!ids.length) return;
  await db.from("notifications").insert(ids.map((id) => ({ user_id: id, kind, title, body, link })) as any);
}

async function addEvent(db: any, submissionId: string, actorId: string, action: string, notes?: string | null, documentId?: string | null) {
  await db.from("payment_submission_events").insert({
    submission_id: submissionId, actor_id: actorId, action,
    notes: notes?.trim() || null, document_id: documentId || null,
  } as any);
}

/* ---------------- context + duplicate protection ---------------- */

export const getSubmissionContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const { data: cust } = await db.from("customers")
      .select("id,account_number,company_name,primary_email,status").eq("id", data.customer_id).maybeSingle();
    if (!cust) throw new Error("Customer not found");
    const [invoices, subs, accounts] = await Promise.all([
      openInvoicesFor(db, cust.id),
      db.from("payment_submissions").select("*").eq("customer_id", cust.id)
        .order("created_at", { ascending: false }).limit(20),
      cashAccounts(db),
    ]);
    return {
      customer: cust,
      openInvoices: invoices,
      submissions: subs.data ?? [],
      cashAccounts: accounts,
      canRecordDirectly: await isBillingUser(context),
    };
  });

/** Duplicate guard: same customer + amount (and reference/invoice) recently seen. */
export const checkDuplicatePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string; invoice_id?: string | null; amount: number; reference?: string | null }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const amount = round(n(data.amount));
    const ref = data.reference?.trim().toLowerCase() || null;
    const since = new Date(Date.now() - 45 * 86400000).toISOString();

    const [payR, subR] = await Promise.all([
      db.from("payments").select("id,receipt_number,amount,reference,paid_at,invoice_id,status")
        .eq("customer_id", data.customer_id).gte("paid_at", since),
      db.from("payment_submissions").select("id,amount,reference,payment_date,invoice_id,status")
        .eq("customer_id", data.customer_id).in("status", ["pending", "clarification", "approved"]),
    ]);

    const hit = (row: any) =>
      (ref && String(row.reference ?? "").trim().toLowerCase() === ref) ||
      (Math.abs(n(row.amount) - amount) < 0.005 &&
        (!data.invoice_id || !row.invoice_id || row.invoice_id === data.invoice_id));

    const payments = (payR.data ?? []).filter(hit);
    const submissions = (subR.data ?? []).filter(hit);
    return {
      duplicate: payments.length > 0 || submissions.length > 0,
      payments, submissions,
    };
  });

/* ---------------- submit ---------------- */

export const submitPaymentToBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    invoice_id?: string | null;
    amount: number;
    currency?: string;
    method?: string;
    payment_date?: string;
    reference?: string | null;
    proof_document_id?: string | null;
    cash_account_id?: string | null;
    notes?: string | null;
    acknowledge_duplicate?: boolean;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const amount = round(n(data.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount received must be greater than zero");
    const db = await admin();

    const { data: cust } = await db.from("customers")
      .select("id,account_number,company_name").eq("id", data.customer_id).maybeSingle();
    if (!cust) throw new Error("Customer not found");

    let invoiceId: string | null = null;
    if (data.invoice_id) {
      const { data: inv } = await db.from("invoices").select("id,customer_id,invoice_number,total")
        .eq("id", data.invoice_id).maybeSingle();
      if (!inv || inv.customer_id !== cust.id) throw new Error("That invoice does not belong to this customer");
      invoiceId = inv.id;
    }

    // Destination account: NMB bank, cash drawer or mobile money.
    let accountId: string | null = null;
    if (data.cash_account_id) {
      const { data: acc } = await db.from("cash_accounts")
        .select("id,is_active").eq("id", data.cash_account_id).maybeSingle();
      if (!acc || !acc.is_active) throw new Error("Select an active bank, cash or mobile money account");
      accountId = acc.id;
    }

    // duplicate protection — the caller must acknowledge before we accept it
    const ref = data.reference?.trim() || null;
    const since = new Date(Date.now() - 45 * 86400000).toISOString();
    const [payR, subR] = await Promise.all([
      db.from("payments").select("id,receipt_number,amount,reference,paid_at")
        .eq("customer_id", cust.id).gte("paid_at", since),
      db.from("payment_submissions").select("id,amount,reference,payment_date,status")
        .eq("customer_id", cust.id).in("status", ["pending", "clarification", "approved"]),
    ]);
    const same = (row: any) =>
      (ref && String(row.reference ?? "").trim().toLowerCase() === ref.toLowerCase()) ||
      Math.abs(n(row.amount) - amount) < 0.005;
    const dupPayments = (payR.data ?? []).filter(same);
    const dupSubs = (subR.data ?? []).filter(same);
    const isDuplicate = dupPayments.length > 0 || dupSubs.length > 0;
    if (isDuplicate && !data.acknowledge_duplicate) {
      throw new Error(
        `Possible duplicate: a payment of ${amount.toFixed(2)}${ref ? ` with reference ${ref}` : ""} already exists on this account. Re-submit with confirmation if it is genuinely a separate payment.`,
      );
    }

    const { data: row, error } = await db.from("payment_submissions").insert({
      customer_id: cust.id,
      account_number: cust.account_number,
      invoice_id: invoiceId,
      amount,
      currency: data.currency || "USD",
      method: data.method || "bank_transfer",
      payment_date: data.payment_date || new Date().toISOString().slice(0, 10),
      reference: ref,
      proof_document_id: data.proof_document_id || null,
      cash_account_id: accountId,
      notes: data.notes?.trim() || null,
      status: "pending",
      duplicate_flag: isDuplicate
        ? { acknowledged: true, payments: dupPayments.map((p: any) => p.id), submissions: dupSubs.map((s: any) => s.id) }
        : null,
      submitted_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);

    await addEvent(db, row.id, context.userId, "submitted", data.notes, data.proof_document_id);

    const { data: me } = await db.from("profiles").select("full_name,email").eq("id", context.userId).maybeSingle();
    const who = me?.full_name || me?.email || "An account manager";

    await notifyUsers(
      db, await billingUserIds(db), "payment_submitted",
      "Payment awaiting verification",
      `${who} submitted ${row.currency} ${amount.toFixed(2)} for ${cust.company_name}.`,
      "/payments?tab=submissions",
    );

    await recordCustomerEvent(db, {
      customer_id: cust.id, account_number: cust.account_number,
      event_type: "payment_submitted",
      title: `Payment submitted to billing: ${row.currency} ${amount.toFixed(2)}`,
      description: ref ? `Reference ${ref}` : null,
      module: "billing", entity_type: "payment_submission", entity_id: row.id,
      new_value: { amount, method: row.method, invoice_id: invoiceId },
      actor_id: context.userId,
    });

    return row;
  });

/* ---------------- listing ---------------- */

export const listPaymentSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id?: string; status?: string; limit?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const billing = await isBillingUser(context);

    let q = db.from("payment_submissions")
      .select("*, customers:customer_id(company_name, account_number), invoices:invoice_id(invoice_number, total, currency)")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 300);
    if (!billing) q = q.eq("submitted_by", context.userId);
    if (data.customer_id) q = q.eq("customer_id", data.customer_id);
    if (data.status) q = q.eq("status", data.status);

    const { data: subs, error } = await q;
    if (error) throw new Error(error.message);
    const list = (subs ?? []) as any[];

    const ids = list.map((s) => s.id);
    const actorIds = Array.from(new Set(list.flatMap((s) => [s.submitted_by, s.reviewed_by]).filter(Boolean)));
    const [evR, profR] = await Promise.all([
      ids.length
        ? db.from("payment_submission_events").select("*").in("submission_id", ids).order("created_at", { ascending: true })
        : Promise.resolve({ data: [] }),
      actorIds.length
        ? db.from("profiles").select("id,full_name,email").in("id", actorIds)
        : Promise.resolve({ data: [] }),
    ]);
    const names: Record<string, string> = {};
    for (const p of (profR.data ?? [])) names[p.id] = p.full_name || p.email || "Staff";
    const eventsBy: Record<string, any[]> = {};
    for (const e of (evR.data ?? [])) (eventsBy[e.submission_id] ||= []).push({ ...e, actor_name: (e.actor_id ? names[e.actor_id] : null) ?? "Staff" });

    const decorated = list.map((s) => ({
      ...s,
      submitted_by_name: names[s.submitted_by] ?? "Staff",
      reviewed_by_name: s.reviewed_by ? names[s.reviewed_by] ?? "Billing" : null,
      events: eventsBy[s.id] ?? [],
    }));

    const sum = (st: string) => decorated.filter((s) => s.status === st).reduce((t, s) => t + n(s.amount), 0);
    return {
      submissions: decorated,
      isBilling: billing,
      stats: {
        pending: decorated.filter((s) => s.status === "pending").length,
        pendingValue: round(sum("pending")),
        clarification: decorated.filter((s) => s.status === "clarification").length,
        approved: decorated.filter((s) => s.status === "approved").length,
        approvedValue: round(sum("approved")),
        rejected: decorated.filter((s) => s.status === "rejected").length,
      },
    };
  });

/** Billing review screen: full context for one submission. */
export const getSubmissionReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { submission_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const { data: sub } = await db.from("payment_submissions")
      .select("*, customers:customer_id(id,company_name,account_number,primary_email,primary_phone,status)")
      .eq("id", data.submission_id).maybeSingle();
    if (!sub) throw new Error("Submission not found");
    const billing = await isBillingUser(context);
    if (!billing && sub.submitted_by !== context.userId) throw new Error("You can only view your own submissions");

    const [openInv, evR, docR, allocR] = await Promise.all([
      openInvoicesFor(db, sub.customer_id),
      db.from("payment_submission_events").select("*").eq("submission_id", sub.id).order("created_at", { ascending: true }),
      sub.proof_document_id
        ? db.from("customer_documents").select("id,doc_label,file_name,file_path,mime_type,created_at").eq("id", sub.proof_document_id).maybeSingle()
        : Promise.resolve({ data: null }),
      sub.invoice_id ? db.from("payment_allocations").select("amount").eq("invoice_id", sub.invoice_id) : Promise.resolve({ data: [] }),
    ]);

    const invoice = sub.invoice_id ? openInv.find((i: any) => i.id === sub.invoice_id) ?? null : null;
    const alreadyPaid = round(((allocR.data ?? []) as any[]).reduce((t, a) => t + n(a.amount), 0));

    return {
      submission: sub,
      customer: sub.customers,
      invoice,
      invoiceAlreadyPaid: alreadyPaid,
      openInvoices: openInv,
      events: evR.data ?? [],
      proof: docR.data ?? null,
      cashAccounts: await cashAccounts(db),
      isBilling: billing,
    };
  });

/* ---------------- submitter responses ---------------- */

export const respondToSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { submission_id: string; notes: string; proof_document_id?: string | null }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    if (!data.notes?.trim()) throw new Error("Please describe the clarification you are providing");
    const db = await admin();
    const { data: sub } = await db.from("payment_submissions").select("*").eq("id", data.submission_id).maybeSingle();
    if (!sub) throw new Error("Submission not found");
    const billing = await isBillingUser(context);
    if (!billing && sub.submitted_by !== context.userId) throw new Error("You can only respond to your own submissions");
    if (!["pending", "clarification"].includes(sub.status)) throw new Error(`This submission is ${sub.status} and can no longer be updated`);

    const patch: Record<string, unknown> = { status: "pending" };
    if (data.proof_document_id) patch.proof_document_id = data.proof_document_id;
    const { error } = await db.from("payment_submissions").update(patch as any).eq("id", sub.id);
    if (error) throw new Error(error.message);
    await addEvent(db, sub.id, context.userId, "clarified", data.notes, data.proof_document_id);

    await notifyUsers(
      db, await billingUserIds(db), "payment_submitted",
      "Clarification provided",
      `A payment submission for ${sub.currency} ${n(sub.amount).toFixed(2)} has been updated.`,
      "/payments?tab=submissions",
    );
    return { ok: true };
  });

export const cancelSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { submission_id: string; reason?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const { data: sub } = await db.from("payment_submissions").select("*").eq("id", data.submission_id).maybeSingle();
    if (!sub) throw new Error("Submission not found");
    const billing = await isBillingUser(context);
    if (!billing && sub.submitted_by !== context.userId) throw new Error("You can only cancel your own submissions");
    if (!["pending", "clarification"].includes(sub.status)) throw new Error(`This submission is ${sub.status} and cannot be cancelled`);
    const { error } = await db.from("payment_submissions").update({ status: "cancelled" } as any).eq("id", sub.id);
    if (error) throw new Error(error.message);
    await addEvent(db, sub.id, context.userId, "cancelled", data.reason);
    return { ok: true };
  });

/* ---------------- billing review ---------------- */

export const reviewPaymentSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    submission_id: string;
    decision: "approve" | "reject" | "clarify";
    notes?: string;
    reason?: string;
    invoice_id?: string | null;
    cash_account_id?: string | null;
    allocations?: Array<{ invoice_id: string; amount: number }>;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertBilling(context);
    const db = await admin();
    const { data: sub } = await db.from("payment_submissions").select("*").eq("id", data.submission_id).maybeSingle();
    if (!sub) throw new Error("Submission not found");
    if (!["pending", "clarification"].includes(sub.status)) {
      throw new Error(`This submission is already ${sub.status}`);
    }
    const { data: cust } = await db.from("customers")
      .select("id,account_number,company_name,primary_email").eq("id", sub.customer_id).maybeSingle();
    if (!cust) throw new Error("Customer not found");
    const now = new Date().toISOString();

    /* --- reject / clarify ------------------------------------------------ */
    if (data.decision !== "approve") {
      if (data.decision === "reject" && !data.reason?.trim()) throw new Error("A rejection reason is required");
      if (data.decision === "clarify" && !(data.notes?.trim() || data.reason?.trim())) {
        throw new Error("Describe what clarification is needed");
      }
      const status = data.decision === "reject" ? "rejected" : "clarification";
      const { error } = await db.from("payment_submissions").update({
        status,
        reviewed_by: context.userId,
        reviewed_at: now,
        review_notes: data.notes?.trim() || null,
        rejection_reason: data.decision === "reject" ? data.reason!.trim() : null,
      } as any).eq("id", sub.id);
      if (error) throw new Error(error.message);

      await addEvent(db, sub.id, context.userId, data.decision === "reject" ? "rejected" : "clarification_requested",
        data.reason?.trim() || data.notes);

      await notifyUsers(
        db, [sub.submitted_by].filter(Boolean) as string[], data.decision === "reject" ? "payment_rejected" : "payment_clarification",
        data.decision === "reject" ? "Payment submission rejected" : "Billing needs clarification",
        `${cust.company_name} · ${sub.currency} ${n(sub.amount).toFixed(2)} — ${(data.reason || data.notes || "").trim()}`,
        "/payments?tab=submissions",
      );

      await recordCustomerEvent(db, {
        customer_id: cust.id, account_number: cust.account_number,
        event_type: "status_changed",
        title: data.decision === "reject" ? "Payment submission rejected" : "Clarification requested on payment submission",
        description: (data.reason || data.notes || "").trim() || null,
        module: "billing", entity_type: "payment_submission", entity_id: sub.id,
        old_value: { status: sub.status }, new_value: { status },
        actor_id: context.userId, major: data.decision === "reject",
      });

      await recordAudit(db, {
        actor_id: context.userId, action: `payment_submission.${data.decision}`,
        entity_type: "payment_submission", entity_id: sub.id,
        account_number: cust.account_number, module: "billing",
        old_value: { status: sub.status }, new_value: { status, reason: data.reason ?? null },
      });
      return { status };
    }

    /* --- approve & record ------------------------------------------------ */
    const amount = round(n(sub.amount));
    const open = await openInvoicesFor(db, cust.id);
    const byId = new Map(open.map((i: any) => [i.id, i]));

    let plan: Array<{ invoice_id: string; amount: number }> = [];
    const explicit = (data.allocations ?? []).filter((a) => a.invoice_id && n(a.amount) > 0);
    if (explicit.length) {
      for (const a of explicit) {
        const inv: any = byId.get(a.invoice_id);
        if (!inv) throw new Error("One of the selected invoices is not open on this customer");
        if (round(n(a.amount)) > inv.balance + 0.005) {
          throw new Error(`Allocation of ${n(a.amount).toFixed(2)} exceeds the ${inv.balance.toFixed(2)} balance on ${inv.invoice_number}`);
        }
      }
      plan = explicit.map((a) => ({ invoice_id: a.invoice_id, amount: round(n(a.amount)) }));
    } else {
      const target = data.invoice_id ?? sub.invoice_id;
      const ordered = target && byId.has(target)
        ? [byId.get(target), ...open.filter((i: any) => i.id !== target)]
        : open;
      let left = amount;
      for (const inv of ordered as any[]) {
        if (left <= 0.005) break;
        const take = round(Math.min(left, inv.balance));
        if (take > 0.005) { plan.push({ invoice_id: inv.id, amount: take }); left = round(left - take); }
      }
    }
    const planned = round(plan.reduce((t, a) => t + a.amount, 0));
    if (planned > amount + 0.005) throw new Error("Allocations exceed the payment amount");

    const { data: payment, error: payErr } = await db.from("payments").insert({
      customer_id: cust.id,
      account_number: cust.account_number,
      amount,
      currency: sub.currency || "USD",
      method: sub.method || "bank_transfer",
      reference: sub.reference,
      status: "received",
      paid_at: new Date(`${sub.payment_date}T12:00:00Z`).toISOString(),
      notes: [sub.notes, data.notes?.trim()].filter(Boolean).join(" · ") || null,
      invoice_id: plan.length === 1 ? plan[0].invoice_id : sub.invoice_id,
      created_by: context.userId,
    } as any).select("*").single();
    if (payErr) throw new Error(payErr.message);

    if (plan.length) {
      const { error: allocErr } = await db.from("payment_allocations").insert(
        plan.map((a) => ({ payment_id: payment.id, invoice_id: a.invoice_id, amount: a.amount })) as any,
      );
      if (allocErr) throw new Error(`Payment recorded but allocation failed: ${allocErr.message}`);
    }

    // once nothing is outstanding, suspended services may be released
    let resumed: any = {};
    try {
      const stillOpen = await openInvoicesFor(db, cust.id);
      if (!stillOpen.length) {
        const { resumeSuspendedForCustomer } = await import("./customer360.server");
        resumed = (await resumeSuspendedForCustomer(db, cust.id)) ?? {};
      }
    } catch { /* resumption is best-effort */ }


    const { error: upErr } = await db.from("payment_submissions").update({
      status: "approved",
      reviewed_by: context.userId,
      reviewed_at: now,
      review_notes: data.notes?.trim() || null,
      payment_id: payment.id,
      receipt_number: payment.receipt_number,
    } as any).eq("id", sub.id);
    if (upErr) throw new Error(upErr.message);
    await addEvent(db, sub.id, context.userId, "approved", data.notes);

    // invoice outcome for the confirmation message
    const after = await openInvoicesFor(db, cust.id);
    const touched = await Promise.all(plan.map(async (a) => {
      const { data: inv } = await db.from("invoices").select("invoice_number,total,status").eq("id", a.invoice_id).maybeSingle();
      const stillOpen = after.find((i: any) => i.id === a.invoice_id);
      return {
        invoice_number: inv?.invoice_number, applied: a.amount,
        status: inv?.status, balance: stillOpen ? stillOpen.balance : 0,
      };
    }));

    await notifyUsers(
      db, [sub.submitted_by].filter(Boolean) as string[], "payment_approved",
      "Payment approved and recorded",
      `${cust.company_name} · ${payment.currency} ${amount.toFixed(2)} recorded. Receipt ${payment.receipt_number ?? ""}`.trim(),
      "/payments?tab=submissions",
    );

    await recordCustomerEvent(db, {
      customer_id: cust.id, account_number: cust.account_number,
      event_type: "payment_received",
      title: `Payment approved: ${payment.currency} ${amount.toFixed(2)}`,
      description: `Receipt ${payment.receipt_number ?? "—"}${touched.length ? ` · applied to ${touched.map((t) => t.invoice_number).join(", ")}` : ""}`,
      module: "billing", entity_type: "payment", entity_id: payment.id,
      new_value: { amount, receipt_number: payment.receipt_number, allocations: plan, resumed },
      actor_id: context.userId, major: true,
    });

    await recordAudit(db, {
      actor_id: context.userId, action: "payment_submission.approve",
      entity_type: "payment_submission", entity_id: sub.id,
      account_number: cust.account_number, module: "billing",
      old_value: { status: sub.status },
      new_value: { status: "approved", payment_id: payment.id, receipt_number: payment.receipt_number, allocations: plan },
    });

    // official receipt to the customer
    if (cust.primary_email) {
      try {
        const { notify } = await import("./notify.server");
        await notify("receipt", cust.primary_email, {
          companyName: cust.company_name,
          receiptNumber: payment.receipt_number,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          reference: payment.reference,
          paidAt: String(payment.paid_at).slice(0, 10),
        }, `receipt-${payment.id}`);
      } catch { /* email failure must not roll back the payment */ }
    }

    return { status: "approved", payment, allocations: touched, resumed };
  });
