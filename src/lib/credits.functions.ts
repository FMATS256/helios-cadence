/**
 * Account credit application — billing side.
 * ==========================================
 * Account managers *request* that credit sitting on a customer's account be
 * applied (see requestCreditApplication in customer360.functions). Billing acts
 * on the request here with one click: the credit is allocated to the invoice,
 * the invoice status is recomputed by the allocation triggers, the credit
 * balance drops, suspended services resume and everything is logged.
 *
 * Separation of duties: only billing (finance / operations manager /
 * master admin) can execute an application.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const r2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;
type Ctx = { supabase: any; userId: string };

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Payments of this customer that still have money not tied to an invoice. */
async function unappliedPayments(sb: any, customerId: string) {
  const { data: pays } = await sb
    .from("payments")
    .select("id, amount, currency, method, reference, receipt_number, paid_at, status")
    .eq("customer_id", customerId)
    .not("status", "in", "(void,cancelled,failed)")
    .order("paid_at", { ascending: true });
  const list = (pays ?? []) as any[];
  if (!list.length) return [];
  const { data: allocs } = await sb
    .from("payment_allocations")
    .select("payment_id, amount")
    .in("payment_id", list.map((p) => p.id));
  const used = new Map<string, number>();
  for (const a of (allocs ?? []) as any[]) {
    used.set(a.payment_id, (used.get(a.payment_id) ?? 0) + Number(a.amount || 0));
  }
  return list
    .map((p) => ({ ...p, unapplied: r2(Number(p.amount || 0) - (used.get(p.id) ?? 0)) }))
    .filter((p) => p.unapplied > 0.005);
}

/* =============================== REQUEST QUEUE =============================== */

/** Open credit-application requests from account managers, newest first. */
export const listCreditRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => input ?? {})
  .handler(async ({ context }) => {
    const { isBillingStaff, loadOpenInvoices, creditBalanceOf } = await import("./customer360.server");
    const { data: hasRole } = await (context as Ctx).supabase.rpc("has_any_role", { _user_id: (context as Ctx).userId });
    if (!hasRole) throw new Error("Staff role required");
    const sb = await db();

    const [reqR, doneR, profR] = await Promise.all([
      sb.from("customer_timeline")
        .select("id, customer_id, account_number, title, description, metadata, actor_id, created_at")
        .eq("event_type", "credit_application_requested")
        .order("created_at", { ascending: false })
        .limit(200),
      sb.from("customer_timeline")
        .select("customer_id, created_at")
        .eq("event_type", "credit_applied")
        .order("created_at", { ascending: false })
        .limit(500),
      sb.from("profiles").select("id, full_name, email"),
    ]);

    const requests = (reqR.data ?? []) as any[];
    const applied = (doneR.data ?? []) as any[];
    const people = new Map(((profR.data ?? []) as any[]).map((p) => [p.id, p]));
    const lastApplied = new Map<string, string>();
    for (const a of applied) {
      const prev = lastApplied.get(a.customer_id);
      if (!prev || String(a.created_at) > prev) lastApplied.set(a.customer_id, String(a.created_at));
    }

    const custIds = Array.from(new Set(requests.map((r) => r.customer_id)));
    const { data: custRows } = custIds.length
      ? await sb.from("customers").select("id, company_name, account_number, currency").in("id", custIds)
      : { data: [] as any[] };
    const custById = new Map(((custRows ?? []) as any[]).map((c) => [c.id, c]));

    const balances = new Map<string, number>();
    const openInvoices = new Map<string, any[]>();
    await Promise.all(custIds.map(async (id) => {
      const [bal, open] = await Promise.all([creditBalanceOf(sb, id), loadOpenInvoices(sb, id)]);
      balances.set(id, bal);
      openInvoices.set(id, open);
    }));

    const seen = new Set<string>();
    const out = requests.map((r) => {
      const meta = (r.metadata ?? {}) as any;
      const done = lastApplied.get(r.customer_id);
      const credit = balances.get(r.customer_id) ?? 0;
      const settled = (!!done && done > String(r.created_at)) || credit <= 0.005;
      const cust = custById.get(r.customer_id);
      const dup = seen.has(r.customer_id);
      if (!settled) seen.add(r.customer_id);
      const who = people.get(r.actor_id) as any;
      const open = openInvoices.get(r.customer_id) ?? [];
      return {
        id: r.id,
        customer_id: r.customer_id,
        account_number: r.account_number ?? cust?.account_number ?? null,
        company_name: cust?.company_name ?? "—",
        requested_at: r.created_at,
        requested_by_name: who?.full_name ?? who?.email ?? "—",
        amount: r2(meta.amount ?? 0),
        currency: meta.currency || cust?.currency || "USD",
        disposition: meta.disposition ?? "new_invoice",
        service_label: meta.service_label ?? null,
        note: meta.note ?? null,
        instruction: r.description ?? null,
        credit_available: credit,
        open_invoices: open.map((i: any) => ({
          id: i.id, invoice_number: i.invoice_number, balance: i.balance,
          currency: i.currency, due_date: i.due_date, is_overdue: i.is_overdue,
        })),
        /** ready = there is credit and at least one invoice to settle */
        ready: !settled && credit > 0.005 && open.length > 0,
        status: settled ? "settled" : dup ? "superseded" : "open",
      };
    });

    return {
      requests: out,
      canManage: await isBillingStaff(context as any),
      stats: {
        open: out.filter((r) => r.status === "open").length,
        ready: out.filter((r) => r.ready).length,
        value: r2(out.filter((r) => r.status === "open").reduce((s, r) => s + r.amount, 0)),
      },
    };
  });

/* ============================== ONE-CLICK APPLY ============================== */

/**
 * Apply account credit to invoices. With no invoice_id the credit settles the
 * oldest-due invoices first; with one, only that invoice is settled.
 */
export const applyCustomerCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    /** omit to use everything available (capped by invoice balances) */
    amount?: number;
    invoice_id?: string;
    note?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const {
      assertBillingStaff, loadCustomer, loadOpenInvoices, creditBalanceOf,
      allocateOldestFirst, resumeSuspendedForCustomer,
    } = await import("./customer360.server");
    await assertBillingStaff(context as any);
    const { recordCustomerEvent } = await import("./customer-events.server");
    const sb = await db();

    const cust = await loadCustomer(sb, data.customer_id);
    const available = await creditBalanceOf(sb, cust.id);
    if (available <= 0.005) throw new Error("This account has no credit left to apply");

    let open = await loadOpenInvoices(sb, cust.id);
    if (data.invoice_id) open = open.filter((i: any) => i.id === data.invoice_id);
    if (!open.length) {
      throw new Error(data.invoice_id
        ? "That invoice has nothing left to settle"
        : "There is no unpaid invoice to settle — raise an invoice first, then apply the credit");
    }

    const openTotal = r2(open.reduce((s: number, i: any) => s + Number(i.balance || 0), 0));
    const asked = Number(data.amount);
    let target = Number.isFinite(asked) && asked > 0 ? r2(asked) : Math.min(available, openTotal);
    target = r2(Math.min(target, available, openTotal));
    if (target <= 0.005) throw new Error("Nothing to apply");

    // Credit is only movable where the underlying receipt is still unapplied.
    const pays = await unappliedPayments(sb, cust.id);
    const movable = r2(pays.reduce((s, p) => s + p.unapplied, 0));
    if (movable <= 0.005) {
      throw new Error("The credit on this account is not backed by an unapplied receipt, so it cannot be allocated. Record the payment first.");
    }
    const applying = r2(Math.min(target, movable));

    const plan = allocateOldestFirst(open as any, applying).allocations;

    // Draw each invoice slice from the oldest receipts still carrying money.
    const inserts: Array<{ payment_id: string; invoice_id: string; amount: number }> = [];
    const pool = pays.map((p) => ({ id: p.id, left: p.unapplied }));
    for (const slice of plan) {
      let need = slice.amount;
      for (const p of pool) {
        if (need <= 0.005) break;
        if (p.left <= 0.005) continue;
        const take = r2(Math.min(need, p.left));
        inserts.push({ payment_id: p.id, invoice_id: slice.invoice_id, amount: take });
        p.left = r2(p.left - take);
        need = r2(need - take);
      }
    }
    if (!inserts.length) throw new Error("Could not match the credit to a receipt");

    const { error: allocErr } = await sb.from("payment_allocations").insert(inserts as any);
    if (allocErr) throw new Error(allocErr.message);

    const applied = r2(inserts.reduce((s, a) => s + a.amount, 0));
    const currency = open[0]?.currency || cust.currency || "USD";

    // Credit balance drops by what was consumed.
    await sb.from("customer_credits").insert({
      customer_id: cust.id,
      account_number: cust.account_number,
      amount: -applied,
      currency,
      kind: "applied",
      source_invoice_id: plan[0]?.invoice_id ?? null,
      note: [`Credit applied to ${plan.map((p) => p.invoice_number).join(", ")}`, data.note?.trim()].filter(Boolean).join(" · "),
      created_by: (context as Ctx).userId,
    } as any);

    const resumed = await resumeSuspendedForCustomer(sb, cust.id).catch(() => ({ total: 0, touched: {} }));

    await recordCustomerEvent(sb, {
      customer_id: cust.id,
      account_number: cust.account_number,
      event_type: "credit_applied",
      title: `Credit applied: ${currency} ${applied.toFixed(2)}`,
      description: `Settled ${plan.map((p) => `${p.invoice_number} (${currency} ${p.amount.toFixed(2)})`).join(", ")}`,
      module: "billing",
      entity_type: "customer_credit",
      entity_id: plan[0]?.invoice_id ?? null,
      new_value: { applied, invoices: plan, note: data.note?.trim() || null, services_resumed: resumed.total },
      actor_id: (context as Ctx).userId,
      major: true,
    });

    // Tell the account manager the request has been actioned.
    try {
      const { data: row } = await sb.from("customers").select("account_manager_id").eq("id", cust.id).maybeSingle();
      if (row?.account_manager_id) {
        await sb.from("notifications").insert({
          user_id: row.account_manager_id,
          kind: "credit_applied",
          title: "Account credit applied",
          body: `${currency} ${applied.toFixed(2)} of ${cust.company_name}'s credit now settles ${plan.map((p) => p.invoice_number).join(", ")}.`,
          link: `/customers/${cust.account_number}`,
        } as any);
      }
    } catch (e) {
      console.error("[applyCustomerCredit] notify", e);
    }

    return {
      ok: true,
      applied,
      currency,
      invoices: plan,
      credit_remaining: r2(available - applied),
      unmatched: r2(Math.max(0, target - applied)),
      services_resumed: resumed.total,
    };
  });
