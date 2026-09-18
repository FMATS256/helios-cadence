/**
 * Recurring payment schedules (installment plans) per customer.
 * Billing creates a plan against an invoice (or a bare amount); each installment
 * carries its own due date and is tracked against what has actually been paid.
 * Overdue installments raise alerts through the daily reminders tick.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function ensureStaff(ctx: Ctx) {
  const { data: hasRole } = await ctx.supabase.rpc("has_any_role", { _user_id: ctx.userId });
  if (!hasRole) throw new Error("Staff role required");
}

async function ensureBilling(ctx: Ctx) {
  await ensureStaff(ctx);
  const { assertBillingStaff } = await import("./customer360.server");
  await assertBillingStaff(ctx as any);
}

const num = (v: any) => Number(v || 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

const STEP: Record<string, (d: Date, i: number) => Date> = {
  weekly: (d, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * i),
  fortnightly: (d, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14 * i),
  monthly: (d, i) => new Date(d.getFullYear(), d.getMonth() + i, d.getDate()),
  quarterly: (d, i) => new Date(d.getFullYear(), d.getMonth() + 3 * i, d.getDate()),
  annual: (d, i) => new Date(d.getFullYear() + i, d.getMonth(), d.getDate()),
};

/** Decorate installments with live overdue/paid state. */
export function decorateInstallments(list: any[]) {
  const today = new Date().toISOString().slice(0, 10);
  return list.map((it) => {
    const due = num(it.amount_due);
    const paid = num(it.amount_paid);
    const outstanding = r2(Math.max(0, due - paid));
    const settled = outstanding <= 0.005;
    const daysOverdue = !settled && it.due_date < today
      ? Math.floor((Date.now() - new Date(it.due_date).getTime()) / 86400000)
      : 0;
    return {
      ...it,
      outstanding,
      state: settled ? "paid" : daysOverdue > 0 ? "overdue" : paid > 0 ? "part paid" : "due",
      days_overdue: daysOverdue,
    };
  });
}

/** All schedules + installments for one customer. */
export const getCustomerSchedules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customer_id: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureStaff(context as Ctx);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const [schR, insR] = await Promise.all([
      db.from("payment_schedules")
        .select("*, invoices:invoice_id(id, invoice_number, total, currency)")
        .eq("customer_id", data.customer_id)
        .order("created_at", { ascending: false }),
      db.from("payment_schedule_installments")
        .select("*")
        .eq("customer_id", data.customer_id)
        .order("due_date", { ascending: true }),
    ]);
    const installments = decorateInstallments((insR.data ?? []) as any[]);
    const schedules = ((schR.data ?? []) as any[]).map((s) => {
      const mine = installments.filter((i) => i.schedule_id === s.id);
      return {
        ...s,
        installments: mine,
        scheduled: r2(mine.reduce((t, i) => t + num(i.amount_due), 0)),
        paid: r2(mine.reduce((t, i) => t + num(i.amount_paid), 0)),
        outstanding: r2(mine.reduce((t, i) => t + i.outstanding, 0)),
        overdue_amount: r2(mine.filter((i) => i.state === "overdue").reduce((t, i) => t + i.outstanding, 0)),
        overdue_count: mine.filter((i) => i.state === "overdue").length,
        next_due: mine.find((i) => i.state !== "paid") ?? null,
      };
    });
    return {
      schedules,
      totals: {
        scheduled: r2(schedules.reduce((t, s) => t + s.scheduled, 0)),
        paid: r2(schedules.reduce((t, s) => t + s.paid, 0)),
        outstanding: r2(schedules.reduce((t, s) => t + s.outstanding, 0)),
        overdue: r2(schedules.reduce((t, s) => t + s.overdue_amount, 0)),
        overdueCount: schedules.reduce((t, s) => t + s.overdue_count, 0),
      },
    };
  });

/** Every open installment across all customers (Finance overview). */
export const listInstallmentSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { limit?: number }) => d ?? {})
  .handler(async ({ data, context }) => {
    await ensureStaff(context as Ctx);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: rowsRaw } = await db.from("payment_schedule_installments")
      .select("*, customers:customer_id(id, company_name, account_number), payment_schedules:schedule_id(id, title, invoice_id)")
      .order("due_date", { ascending: true })
      .limit(data.limit ?? 500);
    const installments = decorateInstallments((rowsRaw ?? []) as any[]);
    return {
      installments,
      stats: {
        total: installments.length,
        outstanding: r2(installments.reduce((t, i) => t + i.outstanding, 0)),
        overdue: r2(installments.filter((i) => i.state === "overdue").reduce((t, i) => t + i.outstanding, 0)),
        overdueCount: installments.filter((i) => i.state === "overdue").length,
        dueThisMonth: r2(installments
          .filter((i) => i.state !== "paid" && String(i.due_date).slice(0, 7) === new Date().toISOString().slice(0, 7))
          .reduce((t, i) => t + i.outstanding, 0)),
      },
    };
  });

/** Billing creates an installment plan; installments are generated evenly. */
export const createPaymentSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    customer_id: string;
    invoice_id?: string | null;
    title: string;
    total_amount: number;
    installment_count: number;
    frequency?: string;
    start_date: string;
    currency?: string;
    notes?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await ensureBilling(context as Ctx);
    if (!data.customer_id) throw new Error("Choose a customer");
    if (!data.title?.trim()) throw new Error("Give the plan a title");
    const total = num(data.total_amount);
    const count = Math.max(1, Math.floor(num(data.installment_count) || 1));
    if (!(total > 0)) throw new Error("Total amount must be greater than zero");
    const frequency = (data.frequency || "monthly").toLowerCase();
    const step = STEP[frequency] ?? STEP.monthly;

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const currency = data.currency || "USD";

    const { data: sched, error } = await (db.from("payment_schedules") as any).insert({
      customer_id: data.customer_id,
      invoice_id: data.invoice_id || null,
      title: data.title.trim(),
      total_amount: total,
      currency,
      installment_count: count,
      frequency,
      start_date: data.start_date,
      status: "active",
      notes: data.notes?.trim() || null,
      created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);

    const base = Math.floor((total / count) * 100) / 100;
    const start = new Date(`${data.start_date}T00:00:00`);
    const installments = Array.from({ length: count }, (_, i) => {
      const amount = i === count - 1 ? r2(total - base * (count - 1)) : base;
      return {
        schedule_id: sched.id,
        customer_id: data.customer_id,
        sequence: i + 1,
        due_date: step(start, i).toISOString().slice(0, 10),
        amount_due: amount,
        amount_paid: 0,
        currency,
        status: "due",
      };
    });
    const { error: ie } = await (db.from("payment_schedule_installments") as any).insert(installments);
    if (ie) throw new Error(ie.message);

    await (db.from("customer_timeline") as any).insert({
      customer_id: data.customer_id,
      kind: "payment_schedule_created",
      title: `Payment plan: ${data.title.trim()}`,
      body: `${count} installment${count === 1 ? "" : "s"} of ${currency} ${base.toFixed(2)} (${frequency}) from ${data.start_date}.`,
      actor_id: context.userId,
    });

    return { schedule_id: sched.id, installments: installments.length };
  });

/** Billing records money received against one installment. */
export const recordInstallmentPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { installment_id: string; amount: number; payment_id?: string | null; notes?: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureBilling(context as Ctx);
    const amount = num(data.amount);
    if (!(amount > 0)) throw new Error("Amount must be greater than zero");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

    const { data: inst, error } = await db.from("payment_schedule_installments")
      .select("*").eq("id", data.installment_id).maybeSingle();
    if (error || !inst) throw new Error(error?.message ?? "Installment not found");

    const paid = r2(num(inst.amount_paid) + amount);
    const settled = paid >= num(inst.amount_due) - 0.005;
    const { error: ue } = await (db.from("payment_schedule_installments") as any).update({
      amount_paid: paid,
      status: settled ? "paid" : "part_paid",
      paid_at: settled ? new Date().toISOString() : inst.paid_at,
      payment_id: data.payment_id || inst.payment_id,
      notes: data.notes?.trim() || inst.notes,
    }).eq("id", inst.id);
    if (ue) throw new Error(ue.message);

    // Close the plan once every installment is settled.
    const { data: siblings } = await db.from("payment_schedule_installments")
      .select("amount_due, amount_paid").eq("schedule_id", inst.schedule_id);
    const allPaid = (siblings ?? []).every((s: any) => num(s.amount_paid) >= num(s.amount_due) - 0.005);
    if (allPaid) await (db.from("payment_schedules") as any).update({ status: "completed" }).eq("id", inst.schedule_id);

    await (db.from("customer_timeline") as any).insert({
      customer_id: inst.customer_id,
      kind: "installment_paid",
      title: `Installment ${inst.sequence} ${settled ? "settled" : "part paid"}`,
      body: `${inst.currency} ${amount.toFixed(2)} received against the installment due ${inst.due_date}.`,
      actor_id: context.userId,
    });

    return { ok: true, settled, amount_paid: paid, schedule_closed: allPaid };
  });

/** Cancel a plan (keeps history; stops overdue alerts). */
export const cancelPaymentSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { schedule_id: string; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureBilling(context as Ctx);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: sched } = await db.from("payment_schedules").select("*").eq("id", data.schedule_id).maybeSingle();
    if (!sched) throw new Error("Plan not found");
    const { error } = await (db.from("payment_schedules") as any)
      .update({ status: "cancelled", notes: data.reason?.trim() || sched.notes }).eq("id", data.schedule_id);
    if (error) throw new Error(error.message);
    await (db.from("payment_schedule_installments") as any)
      .update({ status: "cancelled" }).eq("schedule_id", data.schedule_id).neq("status", "paid");
    await (db.from("customer_timeline") as any).insert({
      customer_id: sched.customer_id,
      kind: "payment_schedule_cancelled",
      title: `Payment plan cancelled: ${sched.title}`,
      body: data.reason?.trim() || null,
      actor_id: context.userId,
    });
    return { ok: true };
  });
