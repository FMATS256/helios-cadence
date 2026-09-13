// Money workspace — banking & reconciliation, payables, ledger, financial reports,
// multi-branch rollups and project finance. All figures normalised to USD base.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { latestRateMap, toBase } from "@/lib/currency.shared";

type Ctx = { supabase: any; userId: string };

async function roles(ctx: Ctx): Promise<Set<string>> {
  const { data, error } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  return new Set((data || []).map((r: any) => r.role));
}

async function assertFinance(ctx: Ctx) {
  const mine = await roles(ctx);
  if (mine.has("master_admin")) return;
  if (!["finance", "operations_manager"].some((r) => mine.has(r))) {
    throw new Error("Forbidden: finance or operations role required");
  }
}

const num = (v: any) => Number(v || 0);
const monthKey = (d: string | Date) => new Date(d).toISOString().slice(0, 7);

/** Everything the Money workspace renders, in one round trip. */
export const getMoneyWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context as Ctx);
    const sb = context.supabase;

    const [
      ratesRes, accountsRes, movementsRes, expensesRes, invoicesRes, paymentsRes,
      allocRes, refundsRes, creditsRes, posRes, poItemsRes, vendorsRes,
      projectsRes, branchesRes, customersRes, profilesRes, subsRes,
    ] = await Promise.all([
      sb.from("exchange_rates").select("currency, rate, effective_date").order("effective_date", { ascending: false }).limit(400),
      sb.from("cash_accounts").select("*").order("is_default", { ascending: false }).order("name"),
      sb.from("cash_movements").select("*, cash_accounts(id, name, kind)").order("occurred_at", { ascending: false }).limit(500),
      sb.from("expenses").select("*, vendors(id, name, code), cash_accounts(id, name, kind), customers(id, company_name, account_number)").order("expense_date", { ascending: false }).limit(1000),
      sb.from("invoices").select("id, invoice_number, customer_id, status, issue_date, due_date, currency, total, paid_at, archived_at").is("archived_at", null).order("issue_date", { ascending: false }).limit(2000),
      sb.from("payments").select("id, customer_id, invoice_id, amount, currency, method, reference, status, paid_at, receipt_number, reconciliation_status").order("paid_at", { ascending: false }).limit(2000),
      sb.from("payment_allocations").select("payment_id, invoice_id, amount").limit(5000),
      sb.from("refunds").select("id, customer_id, amount, currency, method, reason, status, refunded_at").order("refunded_at", { ascending: false }).limit(500),
      sb.from("customer_credits").select("id, customer_id, amount, currency, kind, note, created_at").order("created_at", { ascending: false }).limit(500),
      sb.from("purchase_orders").select("*, vendors(id, name, code, payment_terms)").order("order_date", { ascending: false }).limit(500),
      sb.from("purchase_order_items").select("po_id, description, quantity, unit_price, line_total").limit(3000),
      sb.from("vendors").select("id, name, code, currency, payment_terms, status").order("name"),
      sb.from("projects").select("*, customers(id, company_name, account_number)").is("archived_at", null).order("created_at", { ascending: false }).limit(300),
      sb.from("customer_branches").select("*").is("archived_at", null).limit(1000),
      sb.from("customers").select("id, company_name, account_number, account_manager_id, status").is("archived_at", null).limit(2000),
      sb.from("profiles").select("id, full_name, email").limit(500),
      sb.from("subscriptions").select("id, customer_id, amount, currency, billing_cycle, status, next_renewal").limit(1000),
    ]);

    for (const r of [accountsRes, invoicesRes, paymentsRes, expensesRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const rates = latestRateMap((ratesRes.data ?? []) as any);
    const usd = (amt: any, cur: any) => toBase(amt, cur, rates);

    const accounts: any[] = accountsRes.data ?? [];
    const movements: any[] = movementsRes.data ?? [];
    const expenses: any[] = expensesRes.data ?? [];
    const invoices: any[] = invoicesRes.data ?? [];
    const allPayments: any[] = paymentsRes.data ?? [];
    const payments = allPayments.filter((p) => !["void", "cancelled", "failed"].includes(String(p.status || "")));
    const allocations: any[] = allocRes.data ?? [];
    const refunds: any[] = (refundsRes.data ?? []).filter((r: any) => r.status !== "cancelled");
    const credits: any[] = creditsRes.data ?? [];
    const pos: any[] = posRes.data ?? [];
    const poItems: any[] = poItemsRes.data ?? [];
    const vendors: any[] = vendorsRes.data ?? [];
    const projects: any[] = projectsRes.data ?? [];
    const branches: any[] = branchesRes.data ?? [];
    const customers: any[] = customersRes.data ?? [];
    const profiles: any[] = profilesRes.data ?? [];
    const subs: any[] = (subsRes.data ?? []).filter((s: any) => s.status === "active");

    const custById = new Map(customers.map((c) => [c.id, c]));
    const profById = new Map(profiles.map((p) => [p.id, p]));

    // ---- Banking ---------------------------------------------------------
    const isCash = (m?: string | null) => (m ?? "").toLowerCase().includes("cash");
    const defaultCash = accounts.find((a) => a.is_default && a.kind === "cash") ?? accounts.find((a) => a.kind === "cash");

    const bankAccounts = accounts.map((a) => {
      const spent = expenses.filter((e) => e.account_id === a.id && e.status === "paid").reduce((s, e) => s + num(e.amount), 0);
      const moved = movements.filter((m) => m.account_id === a.id)
        .reduce((s, m) => s + (["withdrawal", "transfer_out"].includes(m.kind) ? -num(m.amount) : num(m.amount)), 0);
      const collected = defaultCash && a.id === defaultCash.id
        ? payments.filter((p) => isCash(p.method)).reduce((s, p) => s + num(p.amount), 0) : 0;
      return { ...a, spent, collected, balance: num(a.opening_balance) + moved + collected - spent };
    });

    const allocByPayment: Record<string, number> = {};
    for (const a of allocations) allocByPayment[a.payment_id] = (allocByPayment[a.payment_id] ?? 0) + num(a.amount);

    const unreconciled = payments
      .filter((p) => (allocByPayment[p.id] ?? 0) + 0.009 < num(p.amount))
      .map((p) => ({
        ...p,
        customer: custById.get(p.customer_id)?.company_name ?? "—",
        account_number: custById.get(p.customer_id)?.account_number ?? null,
        applied: allocByPayment[p.id] ?? 0,
        unapplied: num(p.amount) - (allocByPayment[p.id] ?? 0),
      }));

    // ---- Receivables (aging) --------------------------------------------
    const allocByInvoice: Record<string, number> = {};
    for (const a of allocations) allocByInvoice[a.invoice_id] = (allocByInvoice[a.invoice_id] ?? 0) + num(a.amount);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    const openInvoices: any[] = [];
    for (const inv of invoices) {
      if (["draft", "void", "cancelled"].includes(String(inv.status))) continue;
      const outstanding = num(inv.total) - (allocByInvoice[inv.id] ?? 0);
      if (outstanding <= 0.009) continue;
      const base = usd(outstanding, inv.currency);
      const due = inv.due_date ? new Date(inv.due_date) : null;
      const days = due ? Math.floor((today.getTime() - due.getTime()) / 86400000) : 0;
      if (days <= 0) buckets.current += base;
      else if (days <= 30) buckets.d30 += base;
      else if (days <= 60) buckets.d60 += base;
      else if (days <= 90) buckets.d90 += base;
      else buckets.d90plus += base;
      openInvoices.push({
        id: inv.id, invoice_number: inv.invoice_number, currency: inv.currency,
        outstanding, outstanding_usd: base, due_date: inv.due_date, days_overdue: Math.max(0, days),
        customer: custById.get(inv.customer_id)?.company_name ?? "—",
        account_number: custById.get(inv.customer_id)?.account_number ?? null,
        customer_id: inv.customer_id,
      });
    }
    openInvoices.sort((a, b) => b.days_overdue - a.days_overdue || b.outstanding_usd - a.outstanding_usd);

    // ---- Payables --------------------------------------------------------
    const paidByPo: Record<string, number> = {};
    for (const e of expenses) {
      if (e.purchase_order_id && e.status === "paid") {
        paidByPo[e.purchase_order_id] = (paidByPo[e.purchase_order_id] ?? 0) + usd(e.amount, e.currency);
      }
    }
    const payables = pos
      .filter((p) => !["cancelled", "draft"].includes(String(p.status)))
      .map((p) => {
        const totalUsd = usd(p.total, p.currency);
        const paid = paidByPo[p.id] ?? 0;
        const lines = poItems.filter((i) => i.po_id === p.id).length;
        return { ...p, total_usd: totalUsd, paid_usd: paid, outstanding_usd: Math.max(0, totalUsd - paid), lines };
      })
      .filter((p) => p.outstanding_usd > 0.009);

    const pendingExpenses = expenses.filter((e) => e.status === "pending");

    const payablesByVendor = Object.values(
      payables.reduce((acc: Record<string, any>, p) => {
        const key = p.vendor_id ?? "unassigned";
        const name = p.vendors?.name ?? "Unassigned vendor";
        acc[key] = acc[key] ?? { vendor_id: key, name, terms: p.vendors?.payment_terms ?? null, count: 0, outstanding_usd: 0 };
        acc[key].count += 1;
        acc[key].outstanding_usd += p.outstanding_usd;
        return acc;
      }, {}),
    ).sort((a: any, b: any) => b.outstanding_usd - a.outstanding_usd);

    // ---- Ledger ----------------------------------------------------------
    const ledger = [
      ...invoices.filter((i) => !["draft", "void"].includes(String(i.status))).map((i) => ({
        kind: "invoice", date: i.issue_date, ref: i.invoice_number,
        party: custById.get(i.customer_id)?.company_name ?? "—",
        detail: `Invoice ${String(i.status)}`, debit: usd(i.total, i.currency), credit: 0,
        currency: i.currency, amount: num(i.total),
      })),
      ...payments.map((p) => ({
        kind: "payment", date: p.paid_at, ref: p.receipt_number ?? p.reference ?? "—",
        party: custById.get(p.customer_id)?.company_name ?? "—",
        detail: `Payment received · ${p.method ?? "—"}`, debit: 0, credit: usd(p.amount, p.currency),
        currency: p.currency, amount: num(p.amount),
      })),
      ...refunds.map((r) => ({
        kind: "refund", date: r.refunded_at, ref: r.reference ?? "—",
        party: custById.get(r.customer_id)?.company_name ?? "—",
        detail: `Refund · ${r.reason ?? "—"}`, debit: usd(r.amount, r.currency), credit: 0,
        currency: r.currency, amount: num(r.amount),
      })),
      ...credits.map((c) => ({
        kind: "credit", date: c.created_at, ref: c.kind ?? "credit",
        party: custById.get(c.customer_id)?.company_name ?? "—",
        detail: c.note ?? "Customer credit", debit: 0, credit: usd(c.amount, c.currency),
        currency: c.currency, amount: num(c.amount),
      })),
      ...expenses.map((e) => ({
        kind: "expense", date: e.expense_date, ref: e.reference ?? "—",
        party: e.vendors?.name ?? e.vendor ?? "—",
        detail: `${e.category ?? "general"} · ${e.description ?? ""}`.trim(),
        debit: usd(e.amount, e.currency), credit: 0, currency: e.currency, amount: num(e.amount),
      })),
      ...movements.map((m) => ({
        kind: m.kind === "deposit" ? "cash_in" : "cash_out", date: m.occurred_at,
        ref: m.reference ?? "—", party: m.cash_accounts?.name ?? "Cash account",
        detail: `Cash ${m.kind}`, debit: m.kind === "deposit" ? 0 : usd(m.amount, m.currency),
        credit: m.kind === "deposit" ? usd(m.amount, m.currency) : 0,
        currency: m.currency, amount: num(m.amount),
      })),
    ]
      .filter((r) => !!r.date)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 600);

    // ---- Reports ---------------------------------------------------------
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    const pnl = months.map((m) => {
      const income = payments.filter((p) => p.paid_at && monthKey(p.paid_at) === m).reduce((s, p) => s + usd(p.amount, p.currency), 0);
      const refunded = refunds.filter((r) => r.refunded_at && monthKey(r.refunded_at) === m).reduce((s, r) => s + usd(r.amount, r.currency), 0);
      const spend = expenses.filter((e) => e.expense_date && monthKey(e.expense_date) === m && e.status === "paid")
        .reduce((s, e) => s + usd(e.amount, e.currency), 0);
      const invoiced = invoices.filter((i) => i.issue_date && monthKey(i.issue_date) === m && !["draft", "void"].includes(String(i.status)))
        .reduce((s, i) => s + usd(i.total, i.currency), 0);
      const net = income - refunded - spend;
      return { month: m, income, refunded, spend, invoiced, net, margin: income > 0 ? (net / income) * 100 : 0 };
    });

    const byManager = Object.values(
      invoices.reduce((acc: Record<string, any>, inv) => {
        if (["draft", "void"].includes(String(inv.status))) return acc;
        const c = custById.get(inv.customer_id);
        const key = c?.account_manager_id ?? "unassigned";
        const name = key === "unassigned" ? "Unassigned" : (profById.get(key)?.full_name ?? profById.get(key)?.email ?? "Unknown");
        acc[key] = acc[key] ?? { id: key, name, invoiced: 0, collected: 0, outstanding: 0, customers: new Set<string>() };
        acc[key].invoiced += usd(inv.total, inv.currency);
        acc[key].collected += usd(allocByInvoice[inv.id] ?? 0, inv.currency);
        acc[key].outstanding += Math.max(0, usd(num(inv.total) - (allocByInvoice[inv.id] ?? 0), inv.currency));
        acc[key].customers.add(inv.customer_id);
        return acc;
      }, {}),
    )
      .map((r: any) => ({ ...r, customers: r.customers.size }))
      .sort((a: any, b: any) => b.invoiced - a.invoiced);

    // ---- Multi-branch ----------------------------------------------------
    const branchRollup = branches.map((b) => {
      const custInvoices = invoices.filter((i) => i.customer_id === b.customer_id && !["draft", "void"].includes(String(i.status)));
      const invoiced = custInvoices.reduce((s, i) => s + usd(i.total, i.currency), 0);
      const collected = custInvoices.reduce((s, i) => s + usd(allocByInvoice[i.id] ?? 0, i.currency), 0);
      return {
        id: b.id, name: b.name, city: b.city, country: b.country, is_hq: b.is_headquarters,
        customer: custById.get(b.customer_id)?.company_name ?? "—",
        account_number: b.account_number, invoiced, collected, outstanding: Math.max(0, invoiced - collected),
      };
    }).sort((a, b) => b.outstanding - a.outstanding || b.invoiced - a.invoiced);

    const byCountry = Object.values(
      branchRollup.reduce((acc: Record<string, any>, b) => {
        const key = b.country || "Unspecified";
        acc[key] = acc[key] ?? { country: key, branches: 0, invoiced: 0, outstanding: 0 };
        acc[key].branches += 1; acc[key].invoiced += b.invoiced; acc[key].outstanding += b.outstanding;
        return acc;
      }, {}),
    ).sort((a: any, b: any) => b.invoiced - a.invoiced);

    // ---- Project finance -------------------------------------------------
    const projectFinance = projects.map((p) => {
      const from = p.start_date ?? p.created_at?.slice(0, 10) ?? "1970-01-01";
      const billed = invoices
        .filter((i) => i.customer_id === p.customer_id && !["draft", "void"].includes(String(i.status)) && String(i.issue_date ?? "") >= from)
        .reduce((s, i) => s + usd(i.total, i.currency), 0);
      const spend = expenses
        .filter((e) => e.customer_id === p.customer_id && e.status === "paid" && String(e.expense_date ?? "") >= from)
        .reduce((s, e) => s + usd(e.amount, e.currency), 0);
      const budget = usd(p.budget, "USD");
      return {
        id: p.id, code: p.project_code, name: p.name, status: p.status,
        customer: p.customers?.company_name ?? "—", account_number: p.account_number,
        start_date: p.start_date, due_date: p.due_date,
        budget, billed, spend, margin: billed - spend,
        used_pct: budget > 0 ? Math.min(999, (spend / budget) * 100) : 0,
        over_budget: budget > 0 && spend > budget,
      };
    });

    const mrr = subs.reduce((s, x) => {
      const cyc: Record<string, number> = { monthly: 1, quarterly: 1 / 3, semi_annual: 1 / 6, annual: 1 / 12, yearly: 1 / 12, weekly: 4.345, daily: 30.44, one_time: 0 };
      return s + usd(x.amount, x.currency) * (cyc[String(x.billing_cycle || "monthly")] ?? 1);
    }, 0);

    const cashInHand = bankAccounts.filter((a) => a.kind === "cash").reduce((s, a) => s + a.balance, 0);
    const bankBalance = bankAccounts.filter((a) => a.kind !== "cash").reduce((s, a) => s + a.balance, 0);
    const receivable = Object.values(buckets).reduce((s, v) => s + v, 0);
    const payableTotal = payables.reduce((s, p) => s + p.outstanding_usd, 0)
      + pendingExpenses.reduce((s, e) => s + usd(e.amount, e.currency), 0);

    return {
      rates,
      banking: { accounts: bankAccounts, movements: movements.slice(0, 200), unreconciled },
      receivables: { buckets, openInvoices: openInvoices.slice(0, 300), total: receivable },
      payables: { orders: payables, byVendor: payablesByVendor, pendingExpenses, vendors, total: payableTotal },
      ledger,
      reports: { pnl, byManager, aging: buckets },
      branches: { rows: branchRollup.slice(0, 200), byCountry },
      projects: projectFinance,
      stats: {
        cashInHand, bankBalance, receivable, payable: payableTotal, mrr,
        unreconciledCount: unreconciled.length,
        netPosition: cashInHand + bankBalance + receivable - payableTotal,
        monthIncome: pnl[pnl.length - 1]?.income ?? 0,
        monthSpend: pnl[pnl.length - 1]?.spend ?? 0,
        monthNet: pnl[pnl.length - 1]?.net ?? 0,
      },
    };
  });

/** Settle a purchase order (fully or partially) by recording it as a paid expense. */
export const payPurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    po_id: string; amount: number; account_id?: string | null;
    payment_method?: string; reference?: string; paid_on?: string; notes?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context as Ctx);
    if (!(Number(data.amount) > 0)) throw new Error("Amount must be greater than zero");
    const { data: po, error: poErr } = await context.supabase
      .from("purchase_orders").select("*, vendors(id, name)").eq("id", data.po_id).single();
    if (poErr) throw new Error(poErr.message);

    const { data: row, error } = await context.supabase.from("expenses").insert({
      expense_date: data.paid_on || new Date().toISOString().slice(0, 10),
      category: "provider costs",
      vendor: po.vendors?.name ?? null,
      vendor_id: po.vendor_id ?? null,
      purchase_order_id: po.id,
      customer_id: po.customer_id ?? null,
      description: `Payment for ${po.po_number}`,
      amount: Number(data.amount),
      currency: po.currency || "USD",
      account_id: data.account_id || null,
      payment_method: data.payment_method || "bank transfer",
      reference: data.reference?.trim() || po.po_number,
      status: "paid",
      notes: data.notes?.trim() || null,
      created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);

    // Mark the order paid once the settled total covers it.
    const { data: settled } = await context.supabase
      .from("expenses").select("amount, status").eq("purchase_order_id", po.id);
    const paid = (settled ?? []).filter((e: any) => e.status === "paid").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    if (paid + 0.009 >= Number(po.total || 0) && po.status !== "paid") {
      await context.supabase.from("purchase_orders").update({ status: "paid" }).eq("id", po.id);
    }
    return row;
  });

/** Approve or reject a pending expense (spend authorisation). */
export const decideExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; decision: "approve" | "reject"; note?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context as Ctx);
    const patch: any = { status: data.decision === "approve" ? "paid" : "rejected" };
    if (data.note?.trim()) patch.notes = data.note.trim();
    const { data: row, error } = await context.supabase
      .from("expenses").update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });
