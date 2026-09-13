/**
 * Refund workflow.
 * ================
 * Separation of duties: only billing (finance / operations manager / master
 * admin) may initiate and process a refund. Everyone else — account managers
 * included — raises a refund request with a reason and the account the money
 * should come from. Billing then approves or declines it.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordCustomerEvent, recordAudit } from "./customer-events.server";

type Ctx = { supabase: any; userId: string; claims?: any };

const n = (v: any) => Number(v || 0);
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

async function assertStaff(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_any_role", { _user_id: ctx.userId });
  if (!data) throw new Error("Your account needs a staff role to use refunds.");
}

async function isBilling(ctx: Ctx): Promise<boolean> {
  const [fin, ops, master] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "finance" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "operations_manager" }),
    ctx.supabase.rpc("is_master_admin", { _user_id: ctx.userId }),
  ]);
  return Boolean(fin.data || ops.data || master.data);
}

async function billingUserIds(db: any): Promise<string[]> {
  const { data } = await db.from("user_roles").select("user_id")
    .in("role", ["finance", "operations_manager", "master_admin"]);
  return Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
}

async function notify(db: any, userIds: string[], kind: string, title: string, body: string, link: string) {
  const ids = userIds.filter(Boolean);
  if (!ids.length) return;
  await db.from("notifications").insert(ids.map((id) => ({ user_id: id, kind, title, body, link })) as any);
}

async function alreadyRefunded(db: any, paymentId: string, excludeId?: string) {
  const { data } = await db.from("refunds").select("id, amount, status").eq("payment_id", paymentId)
    .not("status", "in", "(cancelled,rejected)");
  return (data ?? []).filter((r: any) => r.id !== excludeId).reduce((s: number, r: any) => s + n(r.amount), 0);
}

/** Everything the refund request form needs: payments, refund accounts, history. */
export const getRefundContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const db = await admin();
    const { data: cust } = await db.from("customers")
      .select("id, account_number, company_name").eq("id", data.customer_id).maybeSingle();
    if (!cust) throw new Error("Customer not found");

    const [payR, accR, refR] = await Promise.all([
      db.from("payments").select("id, amount, currency, method, reference, receipt_number, paid_at, status")
        .eq("customer_id", cust.id).neq("status", "failed").order("paid_at", { ascending: false }).limit(50),
      db.from("cash_accounts").select("id, name, kind, currency, is_default").eq("is_active", true).order("name"),
      db.from("refunds").select("*").eq("customer_id", cust.id).order("created_at", { ascending: false }).limit(50),
    ]);

    return {
      customer: cust,
      payments: payR.data ?? [],
      accounts: accR.data ?? [],
      refunds: refR.data ?? [],
      canProcess: await isBilling(context as Ctx),
    };
  });

/** Any staff member (typically an account manager) asks billing for a refund. */
export const requestRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    payment_id?: string | null;
    invoice_id?: string | null;
    amount: number;
    currency?: string;
    refund_account_id: string;
    method?: string | null;
    reference?: string | null;
    reason: string;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Refund amount must be greater than zero");
    if (!data.reason?.trim()) throw new Error("A reason for the refund is required");
    if (!data.refund_account_id) throw new Error("Choose the account the refund should be paid from");

    const db = await admin();
    const { data: cust } = await db.from("customers")
      .select("id, account_number, company_name").eq("id", data.customer_id).maybeSingle();
    if (!cust) throw new Error("Customer not found");

    const { data: account } = await db.from("cash_accounts")
      .select("id, name").eq("id", data.refund_account_id).maybeSingle();
    if (!account) throw new Error("That refund account no longer exists");

    if (data.payment_id) {
      const { data: pay } = await db.from("payments").select("id, customer_id, amount").eq("id", data.payment_id).maybeSingle();
      if (!pay || pay.customer_id !== cust.id) throw new Error("That payment does not belong to this customer");
      const prior = await alreadyRefunded(db, pay.id);
      if (prior + amount > n(pay.amount) + 0.005) {
        throw new Error(`Refund exceeds the payment. Already refunded or requested ${prior.toFixed(2)} of ${n(pay.amount).toFixed(2)}`);
      }
    }

    const { data: refund, error } = await db.from("refunds").insert({
      customer_id: cust.id,
      account_number: cust.account_number,
      payment_id: data.payment_id || null,
      invoice_id: data.invoice_id || null,
      amount,
      currency: data.currency || "USD",
      method: data.method?.trim() || null,
      reference: data.reference?.trim() || null,
      reason: data.reason.trim(),
      request_reason: data.reason.trim(),
      refund_account_id: account.id,
      status: "requested",
      requested_by: context.userId,
      created_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);

    await recordCustomerEvent(db, {
      customer_id: cust.id, account_number: cust.account_number,
      event_type: "refund_requested",
      title: `Refund requested: ${(data.currency || "USD")} ${amount.toFixed(2)}`,
      description: `${data.reason.trim()} · from ${account.name}`,
      module: "billing", entity_type: "refund", entity_id: refund.id,
      new_value: { amount, account: account.name },
      actor_id: context.userId,
      actor_email: (context as any).claims?.email ?? null,
    });
    await recordAudit(db, {
      action: "refund_requested", module: "billing", entity_type: "refunds", entity_id: refund.id,
      customer_id: cust.id, new_value: { amount, reason: data.reason.trim(), account: account.name },
      actor_id: context.userId,
    });
    await notify(db, await billingUserIds(db), "refund_requested",
      `Refund request · ${cust.company_name}`,
      `${(data.currency || "USD")} ${amount.toFixed(2)} from ${account.name} — ${data.reason.trim()}`,
      "/payments?tab=refunds");

    return refund;
  });

/** Billing queue of refund requests and processed refunds. */
export const listRefunds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const db = await admin();
    let q = db.from("refunds").select("*").order("created_at", { ascending: false }).limit(400);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const custIds = Array.from(new Set((rows ?? []).map((r: any) => r.customer_id).filter(Boolean)));
    const userIds = Array.from(new Set((rows ?? []).flatMap((r: any) => [r.requested_by, r.reviewed_by]).filter(Boolean)));
    const [custR, profR, accR] = await Promise.all([
      custIds.length ? db.from("customers").select("id, company_name, account_number").in("id", custIds) : { data: [] },
      userIds.length ? db.from("profiles").select("id, full_name, email").in("id", userIds) : { data: [] },
      db.from("cash_accounts").select("id, name, kind"),
    ]);
    const cust = new Map((custR.data ?? []).map((c: any) => [c.id, c]));
    const prof = new Map((profR.data ?? []).map((p: any) => [p.id, p]));
    const acc = new Map((accR.data ?? []).map((a: any) => [a.id, a]));
    const label = (id: any) => (id ? (prof.get(id)?.full_name || prof.get(id)?.email || null) : null);

    const refunds = (rows ?? []).map((r: any) => ({
      ...r,
      company_name: cust.get(r.customer_id)?.company_name ?? null,
      customer_account: cust.get(r.customer_id)?.account_number ?? r.account_number,
      requested_by_name: label(r.requested_by),
      reviewed_by_name: label(r.reviewed_by),
      refund_account_name: r.refund_account_id ? (acc.get(r.refund_account_id)?.name ?? null) : null,
    }));

    const pending = refunds.filter((r: any) => r.status === "requested");
    return {
      refunds,
      canProcess: await isBilling(context as Ctx),
      stats: {
        requested: pending.length,
        requestedValue: pending.reduce((s: number, r: any) => s + n(r.amount), 0),
        processed: refunds.filter((r: any) => ["processed", "credited"].includes(r.status)).length,
        processedValue: refunds.filter((r: any) => ["processed", "credited"].includes(r.status))
          .reduce((s: number, r: any) => s + n(r.amount), 0),
        rejected: refunds.filter((r: any) => r.status === "rejected").length,
      },
    };
  });

/** Billing approves (pays out / credits) or declines a refund request. */
export const decideRefundRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    refund_id: string;
    action: "approve" | "reject";
    as_credit?: boolean;
    refund_account_id?: string | null;
    method?: string | null;
    reference?: string | null;
    notes?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    if (!(await isBilling(context as Ctx))) {
      throw new Error("Only billing (finance, operations manager or master admin) can process a refund.");
    }
    const db = await admin();
    const { data: refund } = await db.from("refunds").select("*").eq("id", data.refund_id).maybeSingle();
    if (!refund) throw new Error("Refund request not found");
    if (refund.status !== "requested") throw new Error("This refund request has already been dealt with.");

    const { data: cust } = await db.from("customers")
      .select("id, account_number, company_name").eq("id", refund.customer_id).maybeSingle();
    const amount = n(refund.amount);
    const now = new Date().toISOString();

    if (data.action === "reject") {
      if (!data.notes?.trim()) throw new Error("Give a reason for declining the request");
      await db.from("refunds").update({
        status: "rejected", reviewed_by: context.userId, reviewed_at: now, review_notes: data.notes.trim(),
      } as any).eq("id", refund.id);

      await recordCustomerEvent(db, {
        customer_id: refund.customer_id, account_number: refund.account_number,
        event_type: "refund_rejected",
        title: `Refund declined: ${refund.currency} ${amount.toFixed(2)}`,
        description: data.notes.trim(),
        module: "billing", entity_type: "refund", entity_id: refund.id,
        actor_id: context.userId,
      });
      await recordAudit(db, {
        action: "refund_rejected", module: "billing", entity_type: "refunds", entity_id: refund.id,
        customer_id: refund.customer_id, new_value: { notes: data.notes.trim() }, actor_id: context.userId,
      });
      await notify(db, [refund.requested_by], "refund_rejected",
        `Refund declined · ${cust?.company_name ?? refund.account_number}`,
        data.notes.trim(), "/payments?tab=refunds");
      return { ok: true, status: "rejected" };
    }

    if (refund.payment_id) {
      const { data: pay } = await db.from("payments").select("id, amount").eq("id", refund.payment_id).maybeSingle();
      if (pay) {
        const prior = await alreadyRefunded(db, pay.id, refund.id);
        if (prior + amount > n(pay.amount) + 0.005) {
          throw new Error(`Refund exceeds the payment. Already refunded ${prior.toFixed(2)} of ${n(pay.amount).toFixed(2)}`);
        }
      }
    }

    const accountId = data.refund_account_id || refund.refund_account_id || null;
    await db.from("refunds").update({
      status: data.as_credit ? "credited" : "processed",
      refunded_at: now,
      refund_account_id: accountId,
      method: data.method?.trim() || refund.method,
      reference: data.reference?.trim() || refund.reference,
      reviewed_by: context.userId, reviewed_at: now,
      review_notes: data.notes?.trim() || null,
    } as any).eq("id", refund.id);

    if (data.as_credit) {
      await db.from("customer_credits").insert({
        customer_id: refund.customer_id, account_number: refund.account_number,
        amount, currency: refund.currency, kind: "credit",
        source_payment_id: refund.payment_id || null, source_invoice_id: refund.invoice_id || null,
        note: `Refund converted to account credit${refund.reason ? ` — ${refund.reason}` : ""}`,
        created_by: context.userId,
      } as any);
    }

    await recordCustomerEvent(db, {
      customer_id: refund.customer_id, account_number: refund.account_number,
      event_type: "refund_issued",
      title: `Refund ${data.as_credit ? "credited" : "paid"}: ${refund.currency} ${amount.toFixed(2)}`,
      description: refund.reason || null,
      module: "billing", entity_type: "refund", entity_id: refund.id,
      new_value: { amount, as_credit: Boolean(data.as_credit) },
      major: true,
      actor_id: context.userId,
    });
    await recordAudit(db, {
      action: "refund_approved", module: "billing", entity_type: "refunds", entity_id: refund.id,
      customer_id: refund.customer_id, new_value: { amount, as_credit: Boolean(data.as_credit) },
      actor_id: context.userId,
    });
    await notify(db, [refund.requested_by], "refund_approved",
      `Refund approved · ${cust?.company_name ?? refund.account_number}`,
      `${refund.currency} ${amount.toFixed(2)} ${data.as_credit ? "issued as account credit" : "paid out"}`,
      "/payments?tab=refunds");

    return { ok: true, status: data.as_credit ? "credited" : "processed" };
  });
