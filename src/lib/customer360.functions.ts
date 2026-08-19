import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertStaff, isFinanceOrAdmin, admin, loadCustomer, num, monthly, advanceDate,
  ageingBucket, KYC_REQUIREMENTS, kycProfileFor, serviceLineOf, sendRawEmail,
  loadOpenInvoices, allocateOldestFirst, creditBalanceOf, loadPayableServices,
  resumeSuspendedForCustomer,
} from "./customer360.server";
import { recordCustomerEvent, MAJOR_EVENT_TYPES } from "./customer-events.server";

const rows = <T,>(r: { data: T[] | null }) => (r.data ?? []) as T[];

/* =========================================================================
 * BILLING WORKSPACE
 * =======================================================================*/
export const getCustomerBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);
    const cid = cust.id;

    const [invR, payR, subR, svcR, refR, credR, noteR, allocR] = await Promise.all([
      db.from("invoices").select("*").eq("customer_id", cid).is("archived_at", null).order("issue_date", { ascending: false }),
      db.from("payments").select("*").eq("customer_id", cid).order("paid_at", { ascending: false }),
      db.from("subscriptions").select("*").eq("customer_id", cid).order("created_at", { ascending: false }),
      db.from("cloud_services").select("*").eq("customer_id", cid).is("archived_at", null),
      db.from("refunds").select("*").eq("customer_id", cid).order("created_at", { ascending: false }),
      db.from("customer_credits").select("*").eq("customer_id", cid).order("created_at", { ascending: false }),
      db.from("customer_notes").select("*").eq("customer_id", cid).eq("note_type", "billing").order("created_at", { ascending: false }),
      db.from("payment_allocations").select("*, invoices(invoice_number), payments(customer_id, paid_at, method, reference)").order("created_at", { ascending: false }).limit(500),
    ]);

    const invoices = rows<any>(invR);
    const payments = rows<any>(payR);
    const subscriptions = rows<any>(subR);
    const services = rows<any>(svcR);
    const refunds = rows<any>(refR);
    const credits = rows<any>(credR);
    const notes = rows<any>(noteR);
    const paymentIds = new Set(payments.map((p) => p.id));
    const allocations = rows<any>(allocR).filter((a) => paymentIds.has(a.payment_id));

    // paid per invoice, from allocations
    const paidByInvoice = new Map<string, number>();
    for (const a of allocations) {
      paidByInvoice.set(a.invoice_id, (paidByInvoice.get(a.invoice_id) ?? 0) + num(a.amount));
    }

    const enrichedInvoices = invoices.map((i) => {
      const paid = paidByInvoice.get(i.id) ?? (i.status === "paid" ? num(i.total) : 0);
      const balance = Math.max(0, num(i.total) - paid);
      const overdue = balance > 0.005 && i.due_date ? new Date(i.due_date).getTime() < Date.now() : false;
      return { ...i, paid_amount: paid, balance, is_overdue: overdue, ageing: balance > 0.005 ? ageingBucket(i.due_date) : "settled" };
    });

    const open = enrichedInvoices.filter((i) => i.balance > 0.005 && i.status !== "void");
    const outstanding = open.reduce((s, i) => s + i.balance, 0);
    const ageing = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 } as Record<string, number>;
    for (const i of open) ageing[i.ageing] = (ageing[i.ageing] ?? 0) + i.balance;

    const creditBalance = credits.reduce((s, c) => s + num(c.amount), 0);
    const advanceTotal = credits.filter((c) => c.kind === "advance").reduce((s, c) => s + num(c.amount), 0);

    const mrrSubs = subscriptions.filter((s) => s.status === "active");
    const mrr = mrrSubs.reduce((s, x) => s + monthly(x.amount, x.billing_cycle), 0)
      + services.filter((s) => s.status === "active").reduce((s, x) => s + num(x.monthly_cost), 0);

    const recurring = [
      ...mrrSubs.map((s) => ({
        kind: "subscription", id: s.id, label: s.plan_name, description: s.description,
        amount: num(s.amount), currency: s.currency || "USD", cycle: s.billing_cycle,
        monthly: monthly(s.amount, s.billing_cycle), next_renewal: s.next_renewal, status: s.status,
        auto_renew: s.auto_renew,
      })),
      ...services.filter((s) => s.status === "active").map((s) => ({
        kind: "service", id: s.id, label: s.service_name, description: s.vendor || s.service_type,
        amount: num(s.monthly_cost), currency: "USD", cycle: "monthly",
        monthly: num(s.monthly_cost), next_renewal: s.renewal_date, status: s.status, auto_renew: true,
      })),
    ].sort((a, b) => b.monthly - a.monthly);

    const upcomingRenewals = recurring
      .filter((r) => r.next_renewal)
      .map((r) => ({ ...r, days: Math.round((new Date(r.next_renewal!).getTime() - Date.now()) / 86_400_000) }))
      .filter((r) => r.days <= 120)
      .sort((a, b) => a.days - b.days);

    const nextInvoiceDate = upcomingRenewals.length ? upcomingRenewals[0].next_renewal : null;
    const nextDue = open
      .filter((i) => i.due_date)
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0] ?? null;
    const lastPayment = payments.find((p) => p.status !== "failed") ?? null;
    const failedPayments = payments.filter((p) => ["failed", "declined", "reversed"].includes(String(p.status)));

    const alerts: Array<{ level: "danger" | "warning" | "info"; text: string }> = [];
    const overdueList = open.filter((i) => i.is_overdue);
    if (overdueList.length) alerts.push({ level: "danger", text: `${overdueList.length} overdue invoice${overdueList.length === 1 ? "" : "s"} totalling ${overdueList.reduce((s, i) => s + i.balance, 0).toFixed(2)}` });
    if (ageing.d90_plus > 0) alerts.push({ level: "danger", text: `${ageing.d90_plus.toFixed(2)} sitting beyond 90 days` });
    if (failedPayments.length) alerts.push({ level: "warning", text: `${failedPayments.length} failed payment attempt${failedPayments.length === 1 ? "" : "s"}` });
    if (creditBalance > 0) alerts.push({ level: "info", text: `Credit balance of ${creditBalance.toFixed(2)} available to allocate` });
    if (!recurring.length) alerts.push({ level: "warning", text: "No active recurring charges on this account" });
    const dueSoon = upcomingRenewals.filter((r) => r.days >= 0 && r.days <= 7);
    if (dueSoon.length) alerts.push({ level: "info", text: `${dueSoon.length} renewal${dueSoon.length === 1 ? "" : "s"} within 7 days` });

    const serviceBillingStatus = recurring.map((r) => {
      const unpaid = open.filter((i) => (i.notes ?? "").includes(r.label) || i.status === "overdue").length;
      return {
        id: r.id, kind: r.kind, label: r.label, status: r.status,
        monthly: r.monthly, currency: r.currency, next_renewal: r.next_renewal,
        billing_state: unpaid > 0 && outstanding > 0 ? "arrears" : "current",
      };
    });

    return {
      customer: cust,
      summary: {
        outstanding,
        creditBalance,
        advanceTotal,
        walletBalance: creditBalance,
        mrr,
        arr: mrr * 12,
        recurringCount: recurring.length,
        nextInvoiceDate,
        nextPaymentDue: nextDue ? { id: nextDue.id, invoice_number: nextDue.invoice_number, due_date: nextDue.due_date, balance: nextDue.balance, currency: nextDue.currency } : null,
        lastPayment: lastPayment ? { id: lastPayment.id, amount: num(lastPayment.amount), currency: lastPayment.currency, paid_at: lastPayment.paid_at, method: lastPayment.method, receipt_number: lastPayment.receipt_number } : null,
        invoiceCounts: {
          paid: enrichedInvoices.filter((i) => i.balance <= 0.005 && i.status !== "void").length,
          partial: enrichedInvoices.filter((i) => i.paid_amount > 0.005 && i.balance > 0.005).length,
          unpaid: enrichedInvoices.filter((i) => i.paid_amount <= 0.005 && i.balance > 0.005).length,
          overdue: overdueList.length,
          total: enrichedInvoices.length,
        },
        totalRefunded: refunds.filter((r) => r.status !== "cancelled").reduce((s, r) => s + num(r.amount), 0),
        totalPaid: payments.filter((p) => p.status !== "failed").reduce((s, p) => s + num(p.amount), 0),
      },
      ageing,
      invoices: enrichedInvoices,
      payments,
      allocations,
      refunds,
      credits,
      notes,
      recurring,
      upcomingRenewals,
      failedPayments,
      serviceBillingStatus,
      alerts,
      canSeeCost: await isFinanceOrAdmin(context),
    };
  });

/* =========================================================================
 * PACKAGE CHANGE — updates the existing active package, never duplicates it
 * =======================================================================*/
export const changeCustomerPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    subscription_id?: string | null;
    plan_name: string;
    description?: string;
    amount: number;
    billing_cycle: string;
    currency?: string;
    reason?: string;
    effective_on?: string;
    generate_invoice?: boolean;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    if (!data.plan_name?.trim()) throw new Error("Package name is required");
    if (!Number.isFinite(Number(data.amount)) || Number(data.amount) < 0) throw new Error("Package price must be a positive number");
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);

    const { data: existingAll } = await db
      .from("subscriptions").select("*").eq("customer_id", cust.id).order("created_at", { ascending: false });
    const active = (existingAll ?? []).filter((s: any) => s.status === "active");
    const line = serviceLineOf(data.plan_name, data.description);

    // Target: the explicitly chosen subscription, otherwise the active package
    // on the same service line. Only when neither exists do we create one.
    let target: any = null;
    if (data.subscription_id) {
      target = (existingAll ?? []).find((s: any) => s.id === data.subscription_id) ?? null;
      if (!target) throw new Error("Subscription not found on this account");
    } else {
      target = active.find((s: any) => serviceLineOf(s.plan_name, s.description) === line) ?? null;
    }

    const effective = data.effective_on || new Date().toISOString().slice(0, 10);
    let result: any;
    let changeType: string;

    if (target) {
      const patch = {
        plan_name: data.plan_name.trim(),
        description: data.description?.trim() || null,
        amount: Number(data.amount),
        billing_cycle: data.billing_cycle,
        currency: data.currency || target.currency || "USD",
        status: "active",
        updated_at: new Date().toISOString(),
      };
      const { data: updated, error } = await db.from("subscriptions").update(patch as any).eq("id", target.id).select("*").single();
      if (error) throw new Error(error.message);
      result = updated;
      const before = monthly(target.amount, target.billing_cycle);
      const after = monthly(patch.amount, patch.billing_cycle);
      changeType = after > before ? "upgrade" : after < before ? "downgrade" : "change";
      await db.from("subscription_history").insert({
        subscription_id: target.id,
        customer_id: cust.id,
        account_number: cust.account_number,
        change_type: changeType,
        from_plan: target.plan_name, to_plan: patch.plan_name,
        from_amount: num(target.amount), to_amount: patch.amount,
        from_cycle: target.billing_cycle, to_cycle: patch.billing_cycle,
        from_status: target.status, to_status: "active",
        effective_on: effective,
        reason: data.reason?.trim() || null,
        changed_by: context.userId,
      } as any);
    } else {
      const next = advanceDate(new Date(effective), data.billing_cycle).toISOString().slice(0, 10);
      const { data: created, error } = await db.from("subscriptions").insert({
        customer_id: cust.id,
        account_number: cust.account_number,
        plan_name: data.plan_name.trim(),
        description: data.description?.trim() || null,
        amount: Number(data.amount),
        currency: data.currency || "USD",
        billing_cycle: data.billing_cycle,
        status: "active",
        started_on: effective,
        next_renewal: next,
        auto_renew: true,
        created_by: context.userId,
      } as any).select("*").single();
      if (error) throw new Error(error.message);
      result = created;
      changeType = "new";
      await db.from("subscription_history").insert({
        subscription_id: created.id,
        customer_id: cust.id,
        account_number: cust.account_number,
        change_type: "new",
        to_plan: created.plan_name, to_amount: num(created.amount),
        to_cycle: created.billing_cycle, to_status: "active",
        effective_on: effective,
        reason: data.reason?.trim() || null,
        changed_by: context.userId,
      } as any);
    }

    let invoice: any = null;
    if (data.generate_invoice) {
      const subtotal = Number(data.amount);
      const { data: inv, error: invErr } = await db.from("invoices").insert({
        customer_id: cust.id,
        account_number: cust.account_number,
        status: "sent",
        issue_date: effective,
        due_date: advanceDate(new Date(effective), "monthly").toISOString().slice(0, 10),
        currency: data.currency || "USD",
        subtotal, tax: 0, total: subtotal,
        notes: `${changeType === "new" ? "New package" : "Package change"}: ${data.plan_name}`,
        created_by: context.userId,
      } as any).select("*").single();
      if (!invErr && inv) {
        invoice = inv;
        await db.from("invoice_line_items").insert({
          invoice_id: inv.id,
          description: `${data.plan_name} (${data.billing_cycle})`,
          quantity: 1, unit_price: subtotal, tax_rate: 0, position: 0,
        } as any);
      }
    }

    await recordCustomerEvent(db, {
      customer_id: cust.id,
      account_number: cust.account_number,
      event_type: changeType === "new" ? "service_activated" : "package_changed",
      title: changeType === "new"
        ? `Package activated: ${result.plan_name}`
        : `Package ${changeType}: ${target?.plan_name ?? ""} → ${result.plan_name}`,
      description: data.reason?.trim() || null,
      module: "subscriptions",
      entity_type: "subscription",
      entity_id: result.id,
      old_value: target ? { plan_name: target.plan_name, amount: num(target.amount), billing_cycle: target.billing_cycle, status: target.status } : null,
      new_value: { plan_name: result.plan_name, amount: num(result.amount), billing_cycle: result.billing_cycle, status: result.status, invoice_id: invoice?.id ?? null },
      actor_id: context.userId,
      metadata: { change_type: changeType, service_line: line },
    });

    return { subscription: result, change_type: changeType, invoice, replaced: Boolean(target) };
  });

/** Package/subscription change history for the account. */
export const getPackageHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const { data: hist } = await db.from("subscription_history").select("*")
      .eq("customer_id", data.customer_id).order("created_at", { ascending: false }).limit(200);
    return hist ?? [];
  });

/* =========================================================================
 * SERVICE LIFECYCLE — suspend / resume / cancel with cascade
 * =======================================================================*/
export const setServiceState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    action: "suspend" | "resume" | "cancel";
    scope?: "account" | "subscription";
    subscription_id?: string;
    reason?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);
    const scope = data.scope || "account";
    const touched: Record<string, number> = {};

    const bump = (k: string, n: number) => { if (n) touched[k] = (touched[k] ?? 0) + n; };

    if (scope === "subscription") {
      if (!data.subscription_id) throw new Error("Select a service first");
      const { data: sub } = await db.from("subscriptions").select("*").eq("id", data.subscription_id).maybeSingle();
      if (!sub || sub.customer_id !== cust.id) throw new Error("That service does not belong to this customer");
      const status = data.action === "suspend" ? "paused" : data.action === "resume" ? "active" : "cancelled";
      if (data.action === "resume" && sub.status === "cancelled") throw new Error("Cancelled services cannot be resumed — create a new package instead");
      const { error } = await db.from("subscriptions").update({
        status, auto_renew: data.action === "cancel" ? false : sub.auto_renew, updated_at: new Date().toISOString(),
      } as any).eq("id", sub.id);
      if (error) throw new Error(error.message);
      bump("subscriptions", 1);
      await db.from("subscription_history").insert({
        subscription_id: sub.id, customer_id: cust.id, account_number: cust.account_number,
        change_type: data.action, from_plan: sub.plan_name, to_plan: sub.plan_name,
        from_status: sub.status, to_status: status, reason: data.reason?.trim() || null,
        changed_by: context.userId,
      } as any);
    } else {
      const subStatus = data.action === "suspend" ? "paused" : data.action === "resume" ? "active" : "cancelled";
      const fromStatus = data.action === "resume" ? "paused" : "active";
      const svcStatus = data.action === "suspend" ? "suspended" : data.action === "resume" ? "active" : "cancelled";

      const subQ = db.from("subscriptions").update({ status: subStatus, updated_at: new Date().toISOString() } as any)
        .eq("customer_id", cust.id).eq("status", fromStatus).select("id");
      const others = [
        ["cloud_services", "status"],
        ["web_hosting_accounts", "status"],
        ["voip_accounts", "status"],
        ["starlink_accounts", "status"],
        ["cloud_storage_accounts", "status"],
        ["managed_nas_accounts", "status"],
      ] as const;
      const otherQs = others.map(([table]) =>
        db.from(table).update({ status: svcStatus, updated_at: new Date().toISOString() } as any)
          .eq("customer_id", cust.id)
          .eq("status", data.action === "resume" ? "suspended" : "active")
          .select("id"),
      );
      const [subRes, ...otherRes] = await Promise.all([subQ, ...otherQs]);
      bump("subscriptions", (subRes as any)?.data?.length ?? 0);
      otherRes.forEach((r: any, i) => bump(others[i][0], r?.data?.length ?? 0));

      await db.from("customers").update({
        status: data.action === "suspend" ? "suspended" : data.action === "cancel" ? "churned" : "active",
      } as any).eq("id", cust.id);
    }

    const verb = data.action === "suspend" ? "suspended" : data.action === "resume" ? "resumed" : "cancelled";
    await recordCustomerEvent(db, {
      customer_id: cust.id,
      account_number: cust.account_number,
      event_type: `service_${verb}`,
      title: scope === "account" ? `Account ${verb}` : `Service ${verb}`,
      description: data.reason?.trim() || null,
      module: "services",
      entity_type: scope === "account" ? "customer" : "subscription",
      entity_id: scope === "account" ? cust.id : data.subscription_id ?? null,
      old_value: { status: cust.status },
      new_value: { action: data.action, scope, touched },
      actor_id: context.userId,
    });

    return { ok: true, touched };
  });

/* =========================================================================
 * REFUNDS + CREDITS
 * =======================================================================*/
export const recordRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    payment_id?: string | null;
    invoice_id?: string | null;
    amount: number;
    currency?: string;
    method?: string;
    reference?: string;
    reason?: string;
    as_credit?: boolean;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Refund amount must be greater than zero");
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);

    if (data.payment_id) {
      const { data: pay } = await db.from("payments").select("id, customer_id, amount").eq("id", data.payment_id).maybeSingle();
      if (!pay || pay.customer_id !== cust.id) throw new Error("That payment does not belong to this customer");
      const { data: prior } = await db.from("refunds").select("amount").eq("payment_id", pay.id).neq("status", "cancelled");
      const refunded = (prior ?? []).reduce((s: number, r: any) => s + num(r.amount), 0);
      if (refunded + amount > num(pay.amount) + 0.005) {
        throw new Error(`Refund exceeds the payment. Already refunded ${refunded.toFixed(2)} of ${num(pay.amount).toFixed(2)}`);
      }
    }

    const { data: refund, error } = await db.from("refunds").insert({
      customer_id: cust.id,
      account_number: cust.account_number,
      payment_id: data.payment_id || null,
      invoice_id: data.invoice_id || null,
      amount,
      currency: data.currency || "USD",
      method: data.method || null,
      reference: data.reference?.trim() || null,
      reason: data.reason?.trim() || null,
      status: data.as_credit ? "credited" : "processed",
      refunded_at: new Date().toISOString(),
      created_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);

    if (data.as_credit) {
      await db.from("customer_credits").insert({
        customer_id: cust.id, account_number: cust.account_number,
        amount, currency: data.currency || "USD", kind: "credit",
        source_payment_id: data.payment_id || null, source_invoice_id: data.invoice_id || null,
        note: `Refund converted to account credit${data.reason ? ` — ${data.reason}` : ""}`,
        created_by: context.userId,
      } as any);
    }

    await recordCustomerEvent(db, {
      customer_id: cust.id, account_number: cust.account_number,
      event_type: "refund_issued",
      title: `Refund issued: ${(data.currency || "USD")} ${amount.toFixed(2)}`,
      description: data.reason?.trim() || null,
      module: "billing", entity_type: "refund", entity_id: refund.id,
      new_value: { amount, as_credit: Boolean(data.as_credit), payment_id: data.payment_id ?? null },
      actor_id: context.userId,
    });
    return refund;
  });

export const addCustomerCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string; amount: number; currency?: string; kind?: string; note?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount === 0) throw new Error("Credit amount is required");
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);
    const { data: row, error } = await db.from("customer_credits").insert({
      customer_id: cust.id, account_number: cust.account_number,
      amount, currency: data.currency || "USD", kind: data.kind || "credit",
      note: data.note?.trim() || null, created_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);
    await recordCustomerEvent(db, {
      customer_id: cust.id, account_number: cust.account_number,
      event_type: "credit_added",
      title: `${amount > 0 ? "Credit added" : "Credit used"}: ${(data.currency || "USD")} ${Math.abs(amount).toFixed(2)}`,
      description: data.note?.trim() || null,
      module: "billing", entity_type: "customer_credit", entity_id: row.id,
      new_value: { amount, kind: data.kind || "credit" },
      actor_id: context.userId, major: false,
    });
    return row;
  });

export const addBillingNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string; body: string; pinned?: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    if (!data.body?.trim()) throw new Error("Note cannot be empty");
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);
    const { data: row, error } = await db.from("customer_notes").insert({
      customer_id: cust.id, account_number: cust.account_number,
      body: data.body.trim(), note_type: "billing", pinned: Boolean(data.pinned),
      author_id: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

/* =========================================================================
 * TIMELINE + AUDIT
 * =======================================================================*/
export const getCustomerHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string; account_number: string; full?: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const [tlR, auditR] = await Promise.all([
      db.from("customer_timeline").select("*").eq("customer_id", data.customer_id)
        .order("created_at", { ascending: false }).limit(data.full ? 500 : 120),
      data.full
        ? db.from("audit_log").select("*").eq("account_number", data.account_number)
          .order("created_at", { ascending: false }).limit(300)
        : Promise.resolve({ data: [] }),
    ]);
    const timeline = rows<any>(tlR);
    const actorIds = [...new Set(timeline.map((t) => t.actor_id).filter(Boolean))];
    let actors: Record<string, string> = {};
    if (actorIds.length) {
      const { data: profiles } = await db.from("profiles").select("id, full_name, email").in("id", actorIds);
      actors = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]));
    }
    return {
      major: timeline.filter((t) => MAJOR_EVENT_TYPES.includes(t.event_type) || (t.metadata as any)?.major !== false)
        .map((t) => ({ ...t, actor_name: t.actor_id ? actors[t.actor_id] ?? null : null })),
      all: timeline.map((t) => ({ ...t, actor_name: t.actor_id ? actors[t.actor_id] ?? null : null })),
      audit: rows<any>(auditR as any),
    };
  });

/* =========================================================================
 * COMMUNICATION CENTER
 * =======================================================================*/
export const getCustomerConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const [commR, contactsR] = await Promise.all([
      db.from("communications").select("*").eq("customer_id", data.customer_id)
        .order("sent_at", { ascending: false }).limit(300),
      db.from("customer_contacts").select("id, name, email, phone, is_primary, contact_type")
        .eq("customer_id", data.customer_id).is("archived_at", null),
    ]);
    const items = rows<any>(commR);
    const threads = new Map<string, any[]>();
    for (const c of items) {
      const key = c.thread_id || c.parent_id || c.id;
      if (!threads.has(key)) threads.set(key, []);
      threads.get(key)!.push(c);
    }
    return {
      items,
      contacts: rows<any>(contactsR),
      threads: [...threads.entries()].map(([id, messages]) => ({
        id,
        subject: messages[messages.length - 1]?.subject || "(no subject)",
        channel: messages[0]?.channel,
        last_at: messages[0]?.sent_at ?? messages[0]?.created_at,
        count: messages.length,
        messages: messages.slice().sort((a, b) =>
          new Date(a.sent_at ?? a.created_at).getTime() - new Date(b.sent_at ?? b.created_at).getTime()),
      })).sort((a, b) => new Date(b.last_at ?? 0).getTime() - new Date(a.last_at ?? 0).getTime()),
      counts: {
        email: items.filter((i) => i.channel === "email").length,
        note: items.filter((i) => i.channel === "note").length,
        sms: items.filter((i) => i.channel === "sms").length,
        whatsapp: items.filter((i) => i.channel === "whatsapp").length,
        call: items.filter((i) => i.channel === "call").length,
        inbound: items.filter((i) => i.direction === "inbound").length,
      },
    };
  });

export const sendCustomerMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    channel: "email" | "note";
    recipient?: string;
    subject: string;
    body: string;
    thread_id?: string | null;
    parent_id?: string | null;
    is_internal?: boolean;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    if (!data.subject?.trim()) throw new Error("Subject is required");
    if (!data.body?.trim()) throw new Error("Message body is required");
    if (data.body.length > 20000) throw new Error("Message is too long");
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);

    const recipient = data.recipient?.trim() || cust.primary_email || null;
    let status = "logged";
    if (data.channel === "email" && !data.is_internal) {
      if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) throw new Error("A valid recipient email is required");
      const res = await sendRawEmail({ to: recipient, subject: data.subject.trim(), body: data.body.trim() });
      status = res.sent ? "sent" : `failed:${res.reason ?? "unknown"}`;
      if (!res.sent && res.reason === "email_not_configured") throw new Error("Email sending is not configured on this environment");
    }

    const { data: row, error } = await db.from("communications").insert({
      customer_id: cust.id,
      account_number: cust.account_number,
      channel: data.channel,
      direction: "outbound",
      subject: data.subject.trim(),
      body: data.body.trim(),
      recipient,
      sender: null,
      status,
      is_internal: Boolean(data.is_internal),
      thread_id: data.thread_id || null,
      parent_id: data.parent_id || null,
      sent_at: new Date().toISOString(),
      created_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);

    if (!data.thread_id) {
      await db.from("communications").update({ thread_id: row.id } as any).eq("id", row.id);
    }

    await recordCustomerEvent(db, {
      customer_id: cust.id, account_number: cust.account_number,
      event_type: "communication_sent",
      title: `${data.is_internal ? "Internal note" : data.channel === "email" ? "Email sent" : "Communication logged"}: ${data.subject.trim()}`,
      module: "communications", entity_type: "communication", entity_id: row.id,
      new_value: { channel: data.channel, recipient, status },
      actor_id: context.userId,
      major: !data.is_internal,
    });
    return { ...row, thread_id: row.thread_id ?? row.id };
  });

/* =========================================================================
 * KYC DOCUMENTS
 * =======================================================================*/
export const getCustomerDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);
    const profile = kycProfileFor(cust.account_type);
    const requirements = KYC_REQUIREMENTS[profile];
    const { data: docs } = await db.from("customer_documents").select("*")
      .eq("customer_id", cust.id).order("created_at", { ascending: false });
    const now = Date.now();
    const decorate = (d: any) => {
      const exp = d.expires_at ? new Date(d.expires_at).getTime() : null;
      const days = exp == null ? null : Math.floor((exp - now) / 86_400_000);
      return { ...d, expiry_days: days, expired: days != null && days < 0, expiring_soon: days != null && days >= 0 && days <= 30 };
    };
    const list = (docs ?? []).map(decorate) as any[];
    const usable = (d: any) => (d.status === "verified" || d.status === "uploaded") && !d.expired;
    const checklist = requirements.map((r) => {
      const matches = list.filter((d) => d.doc_key === r.key);
      return { ...r, documents: matches, satisfied: matches.some(usable) };
    });
    return {
      profile,
      account_type: cust.account_type,
      checklist,
      others: list.filter((d) => !requirements.some((r) => r.key === d.doc_key)),
      completion: Math.round(
        (checklist.filter((c) => c.satisfied).length / Math.max(1, checklist.length)) * 100,
      ),
      missingRequired: checklist.filter((c) => c.required && !c.satisfied).map((c) => c.label),
      expiringSoon: list.filter((d) => d.expiring_soon).map((d) => ({ id: d.id, label: d.doc_label, expires_at: d.expires_at })),
      expired: list.filter((d) => d.expired).map((d) => ({ id: d.id, label: d.doc_label, expires_at: d.expires_at })),
      verifiedCount: list.filter((d) => d.status === "verified").length,
      totalCount: list.length,
    };
  });


export const saveCustomerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    doc_key: string;
    doc_label: string;
    category?: string;
    file_path?: string | null;
    file_name?: string | null;
    mime_type?: string | null;
    file_size?: number | null;
    issued_on?: string | null;
    expires_at?: string | null;
    notes?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    if (!data.doc_key || !data.doc_label) throw new Error("Document type is required");
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);
    const { data: row, error } = await db.from("customer_documents").insert({
      customer_id: cust.id,
      account_number: cust.account_number,
      doc_key: data.doc_key,
      doc_label: data.doc_label,
      category: data.category?.trim() || "kyc",
      file_path: data.file_path || null,
      file_name: data.file_name || null,
      mime_type: data.mime_type || null,
      file_size: data.file_size ?? null,
      status: data.file_path ? "uploaded" : "pending",
      issued_on: data.issued_on || null,
      expires_at: data.expires_at || null,
      notes: data.notes?.trim() || null,
      uploaded_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);
    await recordCustomerEvent(db, {
      customer_id: cust.id, account_number: cust.account_number,
      event_type: "document_uploaded",
      title: `Document uploaded: ${data.doc_label}`,
      module: "kyc", entity_type: "customer_document", entity_id: row.id,
      new_value: { doc_key: data.doc_key, file_name: data.file_name ?? null },
      actor_id: context.userId,
    });
    return row;
  });

export const setDocumentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    document_id: string;
    status?: "pending" | "uploaded" | "verified" | "rejected";
    notes?: string;
    issued_on?: string | null;
    expires_at?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const { data: doc } = await db.from("customer_documents").select("*").eq("id", data.document_id).maybeSingle();
    if (!doc) throw new Error("Document not found");
    const status = data.status ?? doc.status;
    if (status === "rejected" && !(data.notes?.trim() || doc.notes)) {
      throw new Error("A rejection reason is required");
    }
    const patch: Record<string, unknown> = {
      status,
      notes: data.notes?.trim() ?? doc.notes,
      verified_by: status === "verified" ? context.userId : null,
      verified_at: status === "verified" ? new Date().toISOString() : null,
    };
    if (data.issued_on !== undefined) patch.issued_on = data.issued_on || null;
    if (data.expires_at !== undefined) patch.expires_at = data.expires_at || null;
    const { data: row, error } = await db.from("customer_documents").update(patch as any)
      .eq("id", data.document_id).select("*").single();
    if (error) throw new Error(error.message);
    await recordCustomerEvent(db, {
      customer_id: doc.customer_id, account_number: doc.account_number,
      event_type: "status_changed",
      title: `Document ${status}: ${doc.doc_label}`,
      description: data.notes?.trim() || null,
      module: "kyc", entity_type: "customer_document", entity_id: doc.id,
      old_value: { status: doc.status, expires_at: doc.expires_at },
      new_value: { status, expires_at: data.expires_at ?? doc.expires_at },
      actor_id: context.userId, major: status === "rejected",
    });
    return row;
  });


export const deleteCustomerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { document_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const { data: doc } = await db.from("customer_documents").select("*").eq("id", data.document_id).maybeSingle();
    if (!doc) throw new Error("Document not found");
    if (doc.file_path) await db.storage.from("customer-documents").remove([doc.file_path]);
    const { error } = await db.from("customer_documents").delete().eq("id", data.document_id);
    if (error) throw new Error(error.message);
    await recordCustomerEvent(db, {
      customer_id: doc.customer_id, account_number: doc.account_number,
      event_type: "status_changed",
      title: `Document removed: ${doc.doc_label}`,
      module: "kyc", entity_type: "customer_document", entity_id: doc.id,
      old_value: { status: doc.status, file_name: doc.file_name }, new_value: null,
      actor_id: context.userId, major: false,
    });
    return { ok: true };
  });

/** Short-lived signed URL so staff can open a private KYC file. */
export const getDocumentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { document_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const { data: doc } = await db.from("customer_documents").select("file_path").eq("id", data.document_id).maybeSingle();
    if (!doc?.file_path) throw new Error("No file attached to this document");
    const { data: signed, error } = await db.storage.from("customer-documents").createSignedUrl(doc.file_path, 300);
    if (error) throw new Error(error.message);
    return { url: signed?.signedUrl };
  });

/** Billing attachments — receipts, invoices, quotations, statements, POPs. */
export const getBillingAttachments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);
    const { data: docs } = await db.from("customer_documents").select("*")
      .eq("customer_id", cust.id).eq("category", "billing")
      .order("created_at", { ascending: false });
    return (docs ?? []) as any[];
  });


/* =========================================================================
 * EQUIPMENT & ASSETS
 * =======================================================================*/
export const getCustomerEquipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const [assignedR, poolR] = await Promise.all([
      db.from("assets").select("*").eq("customer_id", data.customer_id).is("archived_at", null).order("created_at", { ascending: false }),
      db.from("assets").select("id, asset_tag, asset_type, make, model, serial_number, status")
        .is("customer_id", null).is("archived_at", null).limit(200),
    ]);
    const assignedRaw = rows<any>(assignedR);
    let history: any[] = [];
    if (assignedRaw.length) {
      const { data: ev } = await db.from("asset_lifecycle_events").select("*")
        .in("asset_id", assignedRaw.map((a) => a.id)).order("occurred_at", { ascending: false }).limit(300);
      history = ev ?? [];
    }
    const byAsset = new Map<string, any[]>();
    for (const ev of history) {
      const list = byAsset.get(ev.asset_id) ?? [];
      list.push(ev);
      byAsset.set(ev.asset_id, list);
    }
    const labelFor = (a: any) => [a.asset_tag, a.asset_type, a.serial_number].filter(Boolean).join(" · ");
    const assigned = assignedRaw.map((a) => {
      const evs = byAsset.get(a.id) ?? [];
      const assignEvents = evs.filter((e) => ["assigned", "reassigned", "deployed"].includes(String(e.event_type)));
      const days = a.warranty_expires ? Math.floor((new Date(a.warranty_expires).getTime() - Date.now()) / 86_400_000) : null;
      return {
        ...a,
        assigned_on: assignEvents.length ? assignEvents[assignEvents.length - 1].occurred_at : a.created_at,
        last_movement: evs[0]?.occurred_at ?? null,
        events: evs,
        warranty_days: days,
        warranty_state: days == null ? "unknown" : days < 0 ? "expired" : days <= 60 ? "expiring" : "covered",
      };
    });
    return {
      assigned,
      pool: rows<any>(poolR),
      history: history.map((h) => ({
        ...h,
        asset_label: labelFor(assignedRaw.find((a) => a.id === h.asset_id) ?? {}),
      })),
      stats: {
        total: assigned.length,
        inService: assigned.filter((a) => ["active", "deployed", "in_use", "in_service"].includes(String(a.status).toLowerCase())).length,
        underWarranty: assigned.filter((a) => a.warranty_state === "covered" || a.warranty_state === "expiring").length,
        warrantyExpiring: assigned.filter((a) => a.warranty_state === "expiring").length,
      },
    };
  });

/** Reassign / update an assigned asset — technician, location, status, warranty. */
export const updateEquipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    asset_id: string;
    assigned_to?: string | null;
    location?: string | null;
    status?: string;
    warranty_expires?: string | null;
    notes?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const { data: asset } = await db.from("assets").select("*").eq("id", data.asset_id).maybeSingle();
    if (!asset) throw new Error("Equipment not found");
    if (!asset.customer_id) throw new Error("This equipment is not assigned to a customer");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.assigned_to !== undefined) patch.assigned_to = data.assigned_to?.trim() || null;
    if (data.location !== undefined) patch.location = data.location?.trim() || null;
    if (data.status) patch.status = data.status;
    if (data.warranty_expires !== undefined) patch.warranty_expires = data.warranty_expires || null;
    if (data.notes) patch.notes = data.notes.trim();

    const { data: updated, error } = await db.from("assets").update(patch as any)
      .eq("id", data.asset_id).select("*").single();
    if (error) throw new Error(error.message);

    const technicianChanged = data.assigned_to !== undefined && (data.assigned_to?.trim() || null) !== asset.assigned_to;
    await db.from("asset_lifecycle_events").insert({
      asset_id: asset.id,
      event_type: technicianChanged ? "reassigned" : data.status && data.status !== asset.status ? "status_changed" : "updated",
      occurred_at: new Date().toISOString(),
      notes: [
        technicianChanged ? `Handler: ${asset.assigned_to ?? "unassigned"} → ${data.assigned_to?.trim() || "unassigned"}` : null,
        data.status && data.status !== asset.status ? `Status: ${asset.status} → ${data.status}` : null,
        data.location !== undefined && (data.location?.trim() || null) !== asset.location ? `Location: ${data.location?.trim() || "—"}` : null,
        data.notes?.trim() || null,
      ].filter(Boolean).join(" · ") || "Record updated",
      created_by: context.userId,
    } as any);

    await recordCustomerEvent(db, {
      customer_id: asset.customer_id, account_number: asset.account_number ?? "",
      event_type: technicianChanged ? "equipment_reassigned" : "status_changed",
      title: `Equipment updated: ${asset.asset_type}${asset.serial_number ? ` · ${asset.serial_number}` : ""}`,
      description: data.notes?.trim() || null,
      module: "assets", entity_type: "asset", entity_id: asset.id,
      old_value: { assigned_to: asset.assigned_to, status: asset.status, location: asset.location, warranty_expires: asset.warranty_expires },
      new_value: { assigned_to: updated.assigned_to, status: updated.status, location: updated.location, warranty_expires: updated.warranty_expires },
      actor_id: context.userId,
      major: technicianChanged,
    });
    return updated;
  });


export const assignEquipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    asset_id?: string;
    /** create-and-assign path */
    asset_type?: string;
    asset_tag?: string;
    make?: string;
    model?: string;
    serial_number?: string;
    warranty_expires?: string | null;
    purchase_date?: string | null;
    location?: string;
    assigned_to?: string;
    notes?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);
    let asset: any;
    let reassigned = false;

    if (data.asset_id) {
      const { data: existing } = await db.from("assets").select("*").eq("id", data.asset_id).maybeSingle();
      if (!existing) throw new Error("Equipment not found");
      reassigned = Boolean(existing.customer_id) && existing.customer_id !== cust.id;
      const { data: updated, error } = await db.from("assets").update({
        customer_id: cust.id,
        account_number: cust.account_number,
        assigned_to: data.assigned_to?.trim() || existing.assigned_to,
        location: data.location?.trim() || existing.location,
        status: "deployed",
        updated_at: new Date().toISOString(),
      } as any).eq("id", data.asset_id).select("*").single();
      if (error) throw new Error(error.message);
      asset = updated;
    } else {
      if (!data.asset_type?.trim()) throw new Error("Equipment type is required");
      const { data: created, error } = await db.from("assets").insert({
        customer_id: cust.id,
        account_number: cust.account_number,
        asset_type: data.asset_type.trim(),
        asset_tag: data.asset_tag?.trim() || null,
        make: data.make?.trim() || null,
        model: data.model?.trim() || null,
        serial_number: data.serial_number?.trim() || null,
        warranty_expires: data.warranty_expires || null,
        purchase_date: data.purchase_date || null,
        location: data.location?.trim() || null,
        assigned_to: data.assigned_to?.trim() || null,
        status: "deployed",
        notes: data.notes?.trim() || null,
        created_by: context.userId,
      } as any).select("*").single();
      if (error) throw new Error(error.message);
      asset = created;
    }

    await db.from("asset_lifecycle_events").insert({
      asset_id: asset.id,
      event_type: reassigned ? "reassigned" : "assigned",
      occurred_at: new Date().toISOString(),
      notes: `${reassigned ? "Reassigned" : "Assigned"} to ${cust.company_name}${data.assigned_to ? ` · handler ${data.assigned_to}` : ""}${data.notes ? ` — ${data.notes}` : ""}`,
      created_by: context.userId,
    } as any);

    await recordCustomerEvent(db, {
      customer_id: cust.id, account_number: cust.account_number,
      event_type: reassigned ? "equipment_reassigned" : "equipment_assigned",
      title: `${reassigned ? "Equipment reassigned" : "Equipment assigned"}: ${asset.asset_type}${asset.serial_number ? ` · ${asset.serial_number}` : ""}`,
      description: data.notes?.trim() || null,
      module: "assets", entity_type: "asset", entity_id: asset.id,
      new_value: { asset_type: asset.asset_type, serial_number: asset.serial_number, assigned_to: asset.assigned_to },
      actor_id: context.userId,
    });
    return asset;
  });

export const releaseEquipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { asset_id: string; status?: string; notes?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const { data: asset } = await db.from("assets").select("*").eq("id", data.asset_id).maybeSingle();
    if (!asset) throw new Error("Equipment not found");
    const { error } = await db.from("assets").update({
      customer_id: null, account_number: null, assigned_to: null,
      status: data.status || "spare", updated_at: new Date().toISOString(),
    } as any).eq("id", data.asset_id);
    if (error) throw new Error(error.message);
    await db.from("asset_lifecycle_events").insert({
      asset_id: asset.id, event_type: "released", occurred_at: new Date().toISOString(),
      notes: data.notes?.trim() || "Returned to stock", created_by: context.userId,
    } as any);
    if (asset.customer_id) {
      await recordCustomerEvent(db, {
        customer_id: asset.customer_id, account_number: asset.account_number ?? "",
        event_type: "equipment_reassigned",
        title: `Equipment returned: ${asset.asset_type}${asset.serial_number ? ` · ${asset.serial_number}` : ""}`,
        description: data.notes?.trim() || null,
        module: "assets", entity_type: "asset", entity_id: asset.id,
        old_value: { customer_id: asset.customer_id, status: asset.status },
        new_value: { customer_id: null, status: data.status || "spare" },
        actor_id: context.userId,
      });
    }
    return { ok: true };
  });

/* =========================================================================
 * CONTRACT + STATEMENT
 * =======================================================================*/
export const generateContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    title?: string;
    term_months?: number;
    start_date?: string;
    notes?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);
    const [{ data: subs }, { data: contacts }] = await Promise.all([
      db.from("subscriptions").select("*").eq("customer_id", cust.id).eq("status", "active"),
      db.from("customer_contacts").select("name, email, phone, is_primary").eq("customer_id", cust.id).is("archived_at", null),
    ]);
    const items = (subs ?? []).map((s: any) => ({
      plan_name: s.plan_name, description: s.description, amount: num(s.amount),
      currency: s.currency || "USD", billing_cycle: s.billing_cycle, monthly: monthly(s.amount, s.billing_cycle),
    }));
    const monthlyTotal = items.reduce((t: number, i: any) => t + i.monthly, 0);
    const term = data.term_months ?? 12;
    const start = data.start_date || new Date().toISOString().slice(0, 10);
    const end = (() => { const d = new Date(start); d.setMonth(d.getMonth() + term); return d.toISOString().slice(0, 10); })();
    const reference = `IMT-CTR-${cust.account_number}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

    const { data: doc } = await db.from("customer_documents").insert({
      customer_id: cust.id, account_number: cust.account_number,
      doc_key: "signed_contract", doc_label: data.title?.trim() || "Service Agreement",
      category: "contract", status: "pending",
      issued_on: start, expires_at: end,
      notes: `${reference} · ${term} month term · ${monthlyTotal.toFixed(2)}/mo${data.notes ? ` — ${data.notes}` : ""}`,
      uploaded_by: context.userId,
    } as any).select("*").single();

    await recordCustomerEvent(db, {
      customer_id: cust.id, account_number: cust.account_number,
      event_type: "contract_generated",
      title: `Contract generated: ${reference}`,
      description: `${term} month term starting ${start}`,
      module: "documents", entity_type: "customer_document", entity_id: doc?.id ?? null,
      new_value: { reference, term_months: term, monthly_total: monthlyTotal },
      actor_id: context.userId,
    });

    return {
      reference, customer: cust, contacts: contacts ?? [], items,
      monthlyTotal, annualTotal: monthlyTotal * 12,
      term_months: term, start_date: start, end_date: end,
      notes: data.notes?.trim() || null,
      document_id: doc?.id ?? null,
    };
  });

/** Full account statement: opening balance, movements, closing balance. */
export const getCustomerStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string; from?: string; to?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);
    const from = data.from ? new Date(data.from) : new Date(Date.now() - 365 * 86_400_000);
    const to = data.to ? new Date(data.to) : new Date();

    const [invR, payR, refR] = await Promise.all([
      db.from("invoices").select("id, invoice_number, issue_date, due_date, total, currency, status").eq("customer_id", cust.id).is("archived_at", null),
      db.from("payments").select("id, receipt_number, paid_at, amount, currency, method, reference, status").eq("customer_id", cust.id),
      db.from("refunds").select("id, refunded_at, amount, currency, reason, status").eq("customer_id", cust.id),
    ]);

    type Line = { date: string; kind: string; ref: string; description: string; debit: number; credit: number };
    const all: Line[] = [
      ...rows<any>(invR).filter((i) => i.status !== "void").map((i) => ({
        date: i.issue_date, kind: "invoice", ref: i.invoice_number,
        description: `Invoice ${i.invoice_number}`, debit: num(i.total), credit: 0,
      })),
      ...rows<any>(payR).filter((p) => p.status !== "failed").map((p) => ({
        date: String(p.paid_at).slice(0, 10), kind: "payment", ref: p.receipt_number || p.reference || "",
        description: `Payment received${p.method ? ` (${p.method})` : ""}`, debit: 0, credit: num(p.amount),
      })),
      ...rows<any>(refR).filter((r) => r.status !== "cancelled").map((r) => ({
        date: String(r.refunded_at ?? "").slice(0, 10), kind: "refund", ref: r.id.slice(0, 8),
        description: `Refund${r.reason ? ` — ${r.reason}` : ""}`, debit: num(r.amount), credit: 0,
      })),
    ].filter((l) => l.date).sort((a, b) => a.date.localeCompare(b.date));

    const fromIso = from.toISOString().slice(0, 10);
    const toIso = to.toISOString().slice(0, 10);
    const opening = all.filter((l) => l.date < fromIso).reduce((s, l) => s + l.debit - l.credit, 0);
    const period = all.filter((l) => l.date >= fromIso && l.date <= toIso);
    let running = opening;
    const lines = period.map((l) => { running += l.debit - l.credit; return { ...l, balance: running }; });

    return {
      customer: cust,
      from: fromIso, to: toIso,
      opening,
      closing: running,
      totalDebit: period.reduce((s, l) => s + l.debit, 0),
      totalCredit: period.reduce((s, l) => s + l.credit, 0),
      lines,
    };
  });

/** Everything needed for the PDF / Excel customer profile export. */
export const getCustomerProfileExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);
    const cid = cust.id;
    const [contacts, branches, subs, services, invoices, payments, tickets, assets, docs, projects] = await Promise.all([
      db.from("customer_contacts").select("name, role, contact_type, email, phone, is_primary").eq("customer_id", cid).is("archived_at", null),
      db.from("customer_branches").select("name, address, city, country, is_headquarters").eq("customer_id", cid).is("archived_at", null),
      db.from("subscriptions").select("plan_name, description, amount, currency, billing_cycle, status, started_on, next_renewal").eq("customer_id", cid),
      db.from("cloud_services").select("service_name, service_type, vendor, plan, seats, monthly_cost, status, renewal_date").eq("customer_id", cid).is("archived_at", null),
      db.from("invoices").select("invoice_number, issue_date, due_date, status, currency, subtotal, tax, total").eq("customer_id", cid).is("archived_at", null),
      db.from("payments").select("receipt_number, paid_at, amount, currency, method, reference, status").eq("customer_id", cid),
      db.from("tickets").select("ticket_number, subject, status, priority, created_at, resolved_at").eq("customer_id", cid).is("archived_at", null),
      db.from("assets").select("asset_tag, asset_type, make, model, serial_number, status, warranty_expires, assigned_to").eq("customer_id", cid).is("archived_at", null),
      db.from("customer_documents").select("doc_label, status, file_name, issued_on, expires_at").eq("customer_id", cid),
      db.from("projects").select("name, status, priority, start_date, due_date, budget").eq("customer_id", cid).is("archived_at", null),
    ]);
    const subRows = rows<any>(subs);
    const svcRows = rows<any>(services);
    const mrr = subRows.filter((s) => s.status === "active").reduce((t, s) => t + monthly(s.amount, s.billing_cycle), 0)
      + svcRows.filter((s) => s.status === "active").reduce((t, s) => t + num(s.monthly_cost), 0);
    return {
      customer: cust,
      generated_at: new Date().toISOString(),
      summary: { mrr, arr: mrr * 12, subscriptions: subRows.length, services: svcRows.length },
      contacts: rows<any>(contacts), branches: rows<any>(branches),
      subscriptions: subRows, services: svcRows,
      invoices: rows<any>(invoices), payments: rows<any>(payments),
      tickets: rows<any>(tickets), assets: rows<any>(assets),
      documents: rows<any>(docs), projects: rows<any>(projects),
    };
  });

/* =========================================================================
 * RECORD PAYMENT WORKSPACE (Block 3)
 * =======================================================================*/
export const getPaymentWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);
    const [openInvoices, services, credit, payR] = await Promise.all([
      loadOpenInvoices(db, cust.id),
      loadPayableServices(db, cust.id),
      creditBalanceOf(db, cust.id),
      db.from("payments").select("id,receipt_number,amount,currency,method,paid_at,status,reference,service_context,reconciliation_status")
        .eq("customer_id", cust.id).order("paid_at", { ascending: false }).limit(8),
    ]);
    const outstanding = Math.round(openInvoices.reduce((s, i) => s + i.balance, 0) * 100) / 100;
    const overdue = Math.round(openInvoices.filter((i) => i.is_overdue).reduce((s, i) => s + i.balance, 0) * 100) / 100;
    const suspended = services.filter((s) => s.suspended);
    const currency = openInvoices[0]?.currency || services[0]?.currency || "USD";
    return {
      customer: cust,
      openInvoices,
      services,
      creditBalance: credit,
      recentPayments: rows<any>(payR as any),
      outstanding,
      overdue,
      currency,
      suspendedServices: suspended.map((s) => ({ id: s.id, kind: s.kind, label: s.label, status: s.status })),
      canAutoResume: suspended.length > 0,
      mrr: Math.round(services.filter((s) => !s.suspended && s.status === "active").reduce((s, x) => s + x.monthly, 0) * 100) / 100,
      lastPayment: rows<any>(payR as any)[0] ?? null,
    };
  });

export const recordCustomerPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    amount: number;
    currency?: string;
    method?: string;
    reference?: string;
    paid_at?: string;
    notes?: string;
    /** subscription/cloud_service id or free label this payment settles */
    service_id?: string | null;
    service_label?: string | null;
    /** explicit allocations; ignored when auto_allocate is true */
    allocations?: Array<{ invoice_id: string; amount: number }>;
    auto_allocate?: boolean;
    /** consume part of the customer's credit balance in the same settlement */
    apply_credit?: number;
    /** park the unallocated remainder as an account credit (default true) */
    credit_remainder?: boolean;
    /** restore suspended services when the account clears (default true) */
    auto_resume?: boolean;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const amount = Math.round(Number(data.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount must be greater than zero");

    const db = await admin();
    const cust = await loadCustomer(db, data.customer_id);
    const currency = (data.currency || "USD").toUpperCase();
    const open = await loadOpenInvoices(db, cust.id);
    const byId = new Map(open.map((i) => [i.id, i]));

    // ---- credit portion -------------------------------------------------
    const applyCredit = Math.round(Math.max(0, Number(data.apply_credit || 0)) * 100) / 100;
    if (applyCredit > 0) {
      const balance = await creditBalanceOf(db, cust.id);
      if (applyCredit > balance + 0.005) throw new Error(`Only ${balance.toFixed(2)} of account credit is available`);
    }

    // ---- allocation plan -------------------------------------------------
    const settleTotal = Math.round((amount + applyCredit) * 100) / 100;
    let plan: Array<{ invoice_id: string; amount: number }>;
    if (data.auto_allocate !== false && !(data.allocations ?? []).length) {
      plan = allocateOldestFirst(open, settleTotal).allocations.map((a) => ({ invoice_id: a.invoice_id, amount: a.amount }));
    } else {
      plan = (data.allocations ?? []).filter((a) => a.invoice_id && Number(a.amount) > 0)
        .map((a) => ({ invoice_id: a.invoice_id, amount: Math.round(Number(a.amount) * 100) / 100 }));
      for (const a of plan) {
        const inv = byId.get(a.invoice_id);
        if (!inv) throw new Error("One of the selected invoices does not belong to this customer or is already settled");
        if (a.amount > inv.balance + 0.005) {
          throw new Error(`Allocation of ${a.amount.toFixed(2)} exceeds the ${inv.balance.toFixed(2)} balance on ${inv.invoice_number}`);
        }
      }
    }
    const planned = Math.round(plan.reduce((s, a) => s + a.amount, 0) * 100) / 100;
    if (planned > settleTotal + 0.005) throw new Error(`Allocations (${planned.toFixed(2)}) exceed the amount being settled (${settleTotal.toFixed(2)})`);

    // ---- service ownership check ----------------------------------------
    let serviceLabel = data.service_label?.trim() || null;
    if (data.service_id) {
      const services = await loadPayableServices(db, cust.id);
      const svc = services.find((s) => s.id === data.service_id);
      if (!svc) throw new Error("That service is not assigned to this customer");
      serviceLabel = svc.label;
    }

    // ---- write the payment ------------------------------------------------
    const paidAt = data.paid_at ? new Date(data.paid_at).toISOString() : new Date().toISOString();
    const { data: payment, error } = await db.from("payments").insert({
      customer_id: cust.id,
      account_number: cust.account_number,
      amount,
      currency,
      method: data.method || "cash",
      reference: data.reference?.trim() || null,
      status: "received",
      paid_at: paidAt,
      notes: data.notes?.trim() || null,
      service_context: serviceLabel,
      invoice_id: plan.length === 1 ? plan[0].invoice_id : null,
      created_by: context.userId,
    } as any).select("*").single();
    if (error) throw new Error(error.message);

    // credit consumption is booked as its own zero-cash payment so invoice
    // allocations always resolve to a real payment row
    let creditPayment: any = null;
    if (applyCredit > 0) {
      const { data: cp, error: cErr } = await db.from("payments").insert({
        customer_id: cust.id, account_number: cust.account_number,
        amount: applyCredit, currency, method: "account_credit", status: "received",
        paid_at: paidAt, reference: payment.receipt_number ? `CREDIT/${payment.receipt_number}` : null,
        notes: "Account credit applied", service_context: serviceLabel,
        created_by: context.userId,
      } as any).select("*").single();
      if (cErr) throw new Error(`Payment saved but credit could not be applied: ${cErr.message}`);
      creditPayment = cp;
      await db.from("customer_credits").insert({
        customer_id: cust.id, account_number: cust.account_number,
        amount: -applyCredit, currency, kind: "applied",
        source_payment_id: cp.id, note: `Applied to settlement ${payment.receipt_number ?? ""}`.trim(),
        created_by: context.userId,
      } as any);
    }

    // ---- allocations: cash first, then credit ----------------------------
    let cashLeft = amount;
    const cashRows: any[] = [];
    const creditRows: any[] = [];
    for (const a of plan) {
      const fromCash = Math.round(Math.min(cashLeft, a.amount) * 100) / 100;
      if (fromCash > 0.005) { cashRows.push({ payment_id: payment.id, invoice_id: a.invoice_id, amount: fromCash }); cashLeft = Math.round((cashLeft - fromCash) * 100) / 100; }
      const rest = Math.round((a.amount - fromCash) * 100) / 100;
      if (rest > 0.005 && creditPayment) creditRows.push({ payment_id: creditPayment.id, invoice_id: a.invoice_id, amount: rest });
    }
    const allocRows = [...cashRows, ...creditRows];
    if (allocRows.length) {
      const { error: aErr } = await db.from("payment_allocations").insert(allocRows);
      if (aErr) throw new Error(`Payment saved but allocation failed: ${aErr.message}`);
    }

    // ---- unallocated remainder becomes account credit --------------------
    const remainder = Math.round((amount - cashRows.reduce((s, r) => s + r.amount, 0)) * 100) / 100;
    if (remainder > 0.005 && data.credit_remainder !== false) {
      await db.from("customer_credits").insert({
        customer_id: cust.id, account_number: cust.account_number,
        amount: remainder, currency, kind: "advance",
        source_payment_id: payment.id,
        note: `Unallocated balance from receipt ${payment.receipt_number ?? ""}`.trim(),
        created_by: context.userId,
      } as any);
    }

    // ---- post-settlement state -------------------------------------------
    const after = await loadOpenInvoices(db, cust.id);
    const outstandingAfter = Math.round(after.reduce((s, i) => s + i.balance, 0) * 100) / 100;
    const overdueAfter = Math.round(after.filter((i) => i.is_overdue).reduce((s, i) => s + i.balance, 0) * 100) / 100;

    let resumed: { touched: Record<string, number>; total: number } = { touched: {}, total: 0 };
    if (data.auto_resume !== false && overdueAfter <= 0.005) {
      resumed = await resumeSuspendedForCustomer(db, cust.id);
      if (resumed.total > 0) {
        if (cust.status === "suspended") {
          await db.from("customers").update({ status: "active" } as any).eq("id", cust.id);
        }
        await recordCustomerEvent(db, {
          customer_id: cust.id, account_number: cust.account_number,
          event_type: "service_resumed",
          title: `${resumed.total} service${resumed.total === 1 ? "" : "s"} restored after payment`,
          description: `Overdue balance cleared by receipt ${payment.receipt_number ?? ""}`.trim(),
          module: "billing", entity_type: "payment", entity_id: payment.id,
          new_value: { restored: resumed.touched, receipt: payment.receipt_number },
          actor_id: context.userId,
        });
      }
    }

    const settledInvoices = plan
      .map((a) => byId.get(a.invoice_id)?.invoice_number)
      .filter(Boolean) as string[];

    await recordCustomerEvent(db, {
      customer_id: cust.id, account_number: cust.account_number,
      event_type: "payment_recorded",
      title: `Payment received: ${currency} ${amount.toFixed(2)}`,
      description: [
        serviceLabel ? `Service: ${serviceLabel}` : null,
        settledInvoices.length ? `Applied to ${settledInvoices.join(", ")}` : "Unapplied — held on account",
        applyCredit > 0 ? `Credit applied: ${applyCredit.toFixed(2)}` : null,
      ].filter(Boolean).join(" · "),
      module: "billing", entity_type: "payment", entity_id: payment.id,
      new_value: {
        amount, currency, method: payment.method, receipt: payment.receipt_number,
        allocations: allocRows.length, credit_applied: applyCredit,
        outstanding_after: outstandingAfter, resumed: resumed.total,
      },
      actor_id: context.userId,
    });

    // ---- receipt email (never blocks the transaction) ---------------------
    if (cust.primary_email) {
      try {
        const { notify } = await import("./notify.server");
        void notify("receipt", cust.primary_email, {
          companyName: cust.company_name,
          receiptNumber: payment.receipt_number,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          reference: payment.reference,
          paidAt: String(payment.paid_at).slice(0, 10),
          serviceContext: serviceLabel,
        }, `receipt-${payment.id}`);
      } catch (e: any) { console.error("[recordCustomerPayment] receipt", e?.message ?? e); }
    }

    return {
      payment,
      receipt_number: payment.receipt_number,
      allocations: allocRows.length,
      settledInvoices,
      creditApplied: applyCredit,
      creditCreated: remainder > 0.005 && data.credit_remainder !== false ? remainder : 0,
      outstandingAfter,
      overdueAfter,
      resumed,
    };
  });
