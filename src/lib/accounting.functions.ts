// Chart of accounts, double-entry general ledger posting, trial balance and balance sheet.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { latestRateMap, toBase } from "@/lib/currency.shared";

type Ctx = { supabase: any; userId: string };

async function roleSet(ctx: Ctx): Promise<Set<string>> {
  const { data, error } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  return new Set((data || []).map((r: any) => r.role));
}

async function assertFinance(ctx: Ctx) {
  const mine = await roleSet(ctx);
  if (mine.has("master_admin")) return;
  if (!["finance", "operations_manager"].some((r) => mine.has(r))) {
    throw new Error("Forbidden: finance or operations role required");
  }
}

const num = (v: any) => Number(v || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (d: any) => (d ? String(d).slice(0, 10) : new Date().toISOString().slice(0, 10));

/** Map a free-text expense category onto an account code. */
export function expenseAccountCode(category?: string | null): string {
  const c = String(category || "").toLowerCase();
  const hit = (...w: string[]) => w.some((x) => c.includes(x));
  if (hit("provider", "upstream", "bandwidth", "wholesale", "cost of sale", "hardware", "stock", "inventory")) return "5000";
  if (hit("salary", "wage", "payroll", "staff")) return "6100";
  if (hit("rent", "utility", "electric", "water", "power")) return "6200";
  if (hit("internet", "connectivity", "data", "airtime", "link")) return "6250";
  if (hit("marketing", "advert", "promo", "branding")) return "6300";
  if (hit("travel", "fuel", "transport", "vehicle", "toll")) return "6400";
  if (hit("repair", "maintenance", "service kit")) return "6450";
  if (hit("bank", "charge", "interest", "fee")) return "6500";
  if (hit("software", "licence", "license", "subscription", "saas")) return "6550";
  if (hit("legal", "audit", "consult", "professional", "accounting")) return "6600";
  return "6900";
}

type Line = { account_code: string; debit: number; credit: number; description?: string | null; customer_id?: string | null; vendor_id?: string | null };
type Draft = {
  source_type: string; source_id: string; source_ref?: string | null; entry_date: string; memo: string;
  currency: string; fx_rate: number; customer_id?: string | null; lines: Line[];
};

/** Chart of accounts, ledger entries, trial balance, balance sheet and income statement. */
export const getAccounting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context as Ctx);
    const sb = context.supabase;

    const [accountsRes, entriesRes, linesRes, custRes] = await Promise.all([
      sb.from("chart_of_accounts").select("*").order("code"),
      sb.from("journal_entries").select("*").order("entry_date", { ascending: false }).order("entry_no", { ascending: false }).limit(1500),
      sb.from("journal_lines").select("*").limit(8000),
      sb.from("customers").select("id, company_name, account_number").limit(3000),
    ]);
    for (const r of [accountsRes, entriesRes, linesRes]) if (r.error) throw new Error(r.error.message);

    const accounts: any[] = accountsRes.data ?? [];
    const entries: any[] = entriesRes.data ?? [];
    const lines: any[] = linesRes.data ?? [];
    const custById = new Map((custRes.data ?? []).map((c: any) => [c.id, c]));

    const acctByCode = new Map(accounts.map((a) => [a.code, a]));
    const linesByEntry: Record<string, any[]> = {};
    for (const l of lines) (linesByEntry[l.entry_id] ??= []).push(l);

    const journal = entries.map((e) => ({
      ...e,
      customer: e.customer_id ? (custById.get(e.customer_id)?.company_name ?? null) : null,
      lines: (linesByEntry[e.id] ?? []).map((l) => ({
        ...l,
        account_name: acctByCode.get(l.account_code)?.name ?? l.account_code,
      })),
    }));

    // ---- Trial balance ---------------------------------------------------
    const totals: Record<string, { debit: number; credit: number }> = {};
    for (const l of lines) {
      const t = (totals[l.account_code] ??= { debit: 0, credit: 0 });
      t.debit += num(l.debit); t.credit += num(l.credit);
    }
    const trialBalance = accounts.map((a) => {
      const t = totals[a.code] ?? { debit: 0, credit: 0 };
      const signed = a.normal_balance === "credit" ? t.credit - t.debit : t.debit - t.credit;
      return {
        code: a.code, name: a.name, type: a.type, category: a.category,
        normal_balance: a.normal_balance,
        debit: r2(t.debit), credit: r2(t.credit),
        debit_balance: r2(Math.max(0, t.debit - t.credit)),
        credit_balance: r2(Math.max(0, t.credit - t.debit)),
        balance: r2(signed),
      };
    });
    const tbTotals = trialBalance.reduce(
      (s, r) => ({ debit: s.debit + r.debit, credit: s.credit + r.credit, dr: s.dr + r.debit_balance, cr: s.cr + r.credit_balance }),
      { debit: 0, credit: 0, dr: 0, cr: 0 },
    );

    const sumType = (type: string) => trialBalance.filter((r) => r.type === type).reduce((s, r) => s + r.balance, 0);
    const income = r2(sumType("income"));
    const expense = r2(sumType("expense"));
    const netProfit = r2(income - expense);

    const groupOf = (type: string) => {
      const rows = trialBalance.filter((r) => r.type === type && Math.abs(r.balance) > 0.009);
      const groups = Object.values(
        rows.reduce((acc: Record<string, any>, r) => {
          const key = r.category || "Other";
          acc[key] = acc[key] ?? { category: key, total: 0, rows: [] as any[] };
          acc[key].total += r.balance; acc[key].rows.push(r);
          return acc;
        }, {}),
      ) as any[];
      return groups.sort((a, b) => String(a.category).localeCompare(String(b.category)));
    };

    const assets = r2(sumType("asset"));
    const liabilities = r2(sumType("liability"));
    const equityPosted = r2(sumType("equity"));
    const equity = r2(equityPosted + netProfit);

    const balanceSheet = {
      assets: { groups: groupOf("asset"), total: assets },
      liabilities: { groups: groupOf("liability"), total: liabilities },
      equity: {
        groups: groupOf("equity"),
        posted: equityPosted,
        currentEarnings: netProfit,
        total: equity,
      },
      check: r2(assets - (liabilities + equity)),
    };

    const incomeStatement = {
      income: groupOf("income"), expense: groupOf("expense"),
      totalIncome: income, totalExpense: expense, netProfit,
      margin: income > 0 ? r2((netProfit / income) * 100) : 0,
    };

    return {
      accounts, journal, trialBalance, tbTotals, balanceSheet, incomeStatement,
      stats: {
        accounts: accounts.length,
        entries: entries.length,
        posted: r2(tbTotals.debit),
        balanced: Math.abs(tbTotals.debit - tbTotals.credit) < 0.05,
        assets, liabilities, equity, netProfit,
      },
      lastPostedAt: entries[0]?.created_at ?? null,
    };
  });

/** Re-derive journal entries from every source document that has not been posted yet. */
export const postLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context as Ctx);
    const sb = context.supabase;

    const [
      ratesRes, existingRes, accountsRes, invoicesRes, paymentsRes, refundsRes,
      creditsRes, expensesRes, movementsRes, cashRes,
    ] = await Promise.all([
      sb.from("exchange_rates").select("currency, rate, effective_date").order("effective_date", { ascending: false }).limit(400),
      sb.from("journal_entries").select("source_type, source_id").not("source_id", "is", null).limit(20000),
      sb.from("chart_of_accounts").select("id, code"),
      sb.from("invoices").select("id, invoice_number, customer_id, status, issue_date, currency, total, archived_at").is("archived_at", null).limit(4000),
      sb.from("payments").select("id, customer_id, invoice_id, amount, currency, method, reference, status, paid_at, receipt_number, cash_account_id").limit(4000),
      sb.from("refunds").select("id, customer_id, amount, currency, method, reason, status, refunded_at").limit(1000),
      sb.from("customer_credits").select("id, customer_id, amount, currency, kind, note, created_at").limit(1000),
      sb.from("expenses").select("id, expense_date, category, description, amount, currency, status, reference, vendor_id, account_id, customer_id, purchase_order_id").limit(4000),
      sb.from("cash_movements").select("id, account_id, kind, amount, currency, reference, occurred_at, notes, payment_id").limit(2000),
      sb.from("cash_accounts").select("id, name, kind"),
    ]);
    for (const r of [existingRes, accountsRes, invoicesRes, paymentsRes, expensesRes]) if (r.error) throw new Error(r.error.message);

    const rates = latestRateMap((ratesRes.data ?? []) as any);
    const rateOf = (cur: any) => rates[String(cur || "USD").toUpperCase()] ?? 1;
    const usd = (amt: any, cur: any) => r2(toBase(amt, cur, rates));

    const idByCode = new Map((accountsRes.data ?? []).map((a: any) => [a.code, a.id]));
    const posted = new Set((existingRes.data ?? []).map((e: any) => `${e.source_type}:${e.source_id}`));
    const cashById = new Map((cashRes.data ?? []).map((a: any) => [a.id, a]));
    const cashCode = (accountId?: string | null, method?: string | null) => {
      const acct = accountId ? cashById.get(accountId) : null;
      if (acct) return acct.kind === "cash" ? "1000" : "1010";
      return String(method || "").toLowerCase().includes("cash") ? "1000" : "1010";
    };

    const drafts: Draft[] = [];
    const push = (d: Draft) => { if (!posted.has(`${d.source_type}:${d.source_id}`)) drafts.push(d); };

    // Invoices issued → DR receivable, CR revenue
    for (const inv of invoicesRes.data ?? []) {
      if (["draft", "void", "cancelled"].includes(String(inv.status))) continue;
      const amt = usd(inv.total, inv.currency);
      if (amt <= 0.009) continue;
      push({
        source_type: "invoice", source_id: inv.id, source_ref: inv.invoice_number,
        entry_date: day(inv.issue_date), memo: `Invoice ${inv.invoice_number ?? ""}`.trim(),
        currency: inv.currency || "USD", fx_rate: rateOf(inv.currency), customer_id: inv.customer_id,
        lines: [
          { account_code: "1100", debit: amt, credit: 0, description: "Customer receivable", customer_id: inv.customer_id },
          { account_code: "4000", debit: 0, credit: amt, description: "Service revenue", customer_id: inv.customer_id },
        ],
      });
    }

    // Payments received → DR cash/bank, CR receivable
    for (const p of paymentsRes.data ?? []) {
      if (["void", "cancelled", "failed"].includes(String(p.status || ""))) continue;
      const amt = usd(p.amount, p.currency);
      if (amt <= 0.009) continue;
      push({
        source_type: "payment", source_id: p.id, source_ref: p.receipt_number ?? p.reference ?? null,
        entry_date: day(p.paid_at), memo: `Payment received · ${p.method ?? "—"}`,
        currency: p.currency || "USD", fx_rate: rateOf(p.currency), customer_id: p.customer_id,
        lines: [
          { account_code: cashCode(p.cash_account_id, p.method), debit: amt, credit: 0, description: "Funds received", customer_id: p.customer_id },
          { account_code: "1100", debit: 0, credit: amt, description: "Receivable settled", customer_id: p.customer_id },
        ],
      });
    }

    // Refunds → DR contra revenue, CR cash/bank
    for (const rf of refundsRes.data ?? []) {
      if (String(rf.status || "") === "cancelled") continue;
      const amt = usd(rf.amount, rf.currency);
      if (amt <= 0.009) continue;
      push({
        source_type: "refund", source_id: rf.id, source_ref: null,
        entry_date: day(rf.refunded_at), memo: `Refund · ${rf.reason ?? "—"}`,
        currency: rf.currency || "USD", fx_rate: rateOf(rf.currency), customer_id: rf.customer_id,
        lines: [
          { account_code: "4900", debit: amt, credit: 0, description: "Refund to customer", customer_id: rf.customer_id },
          { account_code: cashCode(null, rf.method), debit: 0, credit: amt, description: "Funds paid out", customer_id: rf.customer_id },
        ],
      });
    }

    // Credit notes → DR contra revenue, CR customer credits held
    for (const c of creditsRes.data ?? []) {
      const amt = usd(c.amount, c.currency);
      if (amt <= 0.009) continue;
      push({
        source_type: "credit", source_id: c.id, source_ref: c.kind ?? null,
        entry_date: day(c.created_at), memo: c.note || "Customer credit",
        currency: c.currency || "USD", fx_rate: rateOf(c.currency), customer_id: c.customer_id,
        lines: [
          { account_code: "4900", debit: amt, credit: 0, description: "Credit issued", customer_id: c.customer_id },
          { account_code: "2100", debit: 0, credit: amt, description: "Credit held for customer", customer_id: c.customer_id },
        ],
      });
    }

    // Expenses → DR expense account, CR cash/bank (paid) or payable (pending/approved)
    for (const e of expensesRes.data ?? []) {
      if (["rejected", "cancelled", "void"].includes(String(e.status || ""))) continue;
      const amt = usd(e.amount, e.currency);
      if (amt <= 0.009) continue;
      const isPaid = String(e.status) === "paid";
      push({
        source_type: "expense", source_id: e.id, source_ref: e.reference ?? null,
        entry_date: day(e.expense_date), memo: `${e.category ?? "expense"} · ${e.description ?? ""}`.trim(),
        currency: e.currency || "USD", fx_rate: rateOf(e.currency), customer_id: e.customer_id,
        lines: [
          { account_code: expenseAccountCode(e.category), debit: amt, credit: 0, description: e.description ?? null, vendor_id: e.vendor_id ?? null },
          isPaid
            ? { account_code: cashCode(e.account_id, null), debit: 0, credit: amt, description: "Paid out", vendor_id: e.vendor_id ?? null }
            : { account_code: "2000", debit: 0, credit: amt, description: "Owed to supplier", vendor_id: e.vendor_id ?? null },
        ],
      });
    }

    // Cash movements → cash account against the clearing account
    for (const m of movementsRes.data ?? []) {
      // Deposits raised by a customer payment are already posted with that payment.
      if (m.payment_id) continue;
      const amt = usd(m.amount, m.currency);
      if (amt <= 0.009) continue;
      const code = cashCode(m.account_id, null);
      const out = ["withdrawal", "transfer_out"].includes(String(m.kind));
      push({
        source_type: "cash_movement", source_id: m.id, source_ref: m.reference ?? null,
        entry_date: day(m.occurred_at), memo: `Cash ${m.kind}`,
        currency: m.currency || "USD", fx_rate: rateOf(m.currency),
        lines: out
          ? [
              { account_code: "1090", debit: amt, credit: 0, description: m.notes ?? "Cash out" },
              { account_code: code, debit: 0, credit: amt, description: m.notes ?? "Cash out" },
            ]
          : [
              { account_code: code, debit: amt, credit: 0, description: m.notes ?? "Cash in" },
              { account_code: "1090", debit: 0, credit: amt, description: m.notes ?? "Cash in" },
            ],
      });
    }

    if (!drafts.length) return { created: 0, skipped: posted.size };

    let created = 0;
    for (let i = 0; i < drafts.length; i += 100) {
      const chunk = drafts.slice(i, i + 100);
      const { data: rows, error } = await sb.from("journal_entries").insert(
        chunk.map((d) => ({
          entry_date: d.entry_date, memo: d.memo.slice(0, 300), source_type: d.source_type,
          source_id: d.source_id, source_ref: d.source_ref ?? null, currency: d.currency,
          fx_rate: d.fx_rate, customer_id: d.customer_id ?? null,
          total_debit: r2(d.lines.reduce((s, l) => s + l.debit, 0)),
          total_credit: r2(d.lines.reduce((s, l) => s + l.credit, 0)),
          created_by: context.userId,
        })),
      ).select("id, source_type, source_id");
      if (error) throw new Error(error.message);

      const idBySource = new Map((rows ?? []).map((r: any) => [`${r.source_type}:${r.source_id}`, r.id]));
      const lineRows = chunk.flatMap((d) => {
        const entryId = idBySource.get(`${d.source_type}:${d.source_id}`);
        if (!entryId) return [];
        return d.lines.map((l) => ({
          entry_id: entryId, account_code: l.account_code, account_id: idByCode.get(l.account_code) ?? null,
          debit: r2(l.debit), credit: r2(l.credit), description: l.description ?? null,
          customer_id: l.customer_id ?? null, vendor_id: l.vendor_id ?? null,
        }));
      });
      const { error: lineErr } = await sb.from("journal_lines").insert(lineRows);
      if (lineErr) throw new Error(lineErr.message);
      created += rows?.length ?? 0;
    }

    return { created, skipped: posted.size };
  });

/** Create or update an account in the chart of accounts. */
export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string | null; code: string; name: string;
    type: "asset" | "liability" | "equity" | "income" | "expense";
    category?: string | null; normal_balance?: "debit" | "credit";
    description?: string | null; is_active?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context as Ctx);
    const code = data.code.trim();
    if (!/^\d{3,6}$/.test(code)) throw new Error("Account code must be 3–6 digits");
    if (!data.name.trim()) throw new Error("Account name is required");
    const patch = {
      code, name: data.name.trim(), type: data.type,
      category: data.category?.trim() || null,
      normal_balance: data.normal_balance ?? (["asset", "expense"].includes(data.type) ? "debit" : "credit"),
      description: data.description?.trim() || null,
      is_active: data.is_active ?? true,
    };
    const q = data.id
      ? context.supabase.from("chart_of_accounts").update(patch).eq("id", data.id)
      : context.supabase.from("chart_of_accounts").insert(patch);
    const { data: row, error } = await q.select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Post a balanced manual journal entry. */
export const createJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    entry_date: string; memo: string; currency?: string;
    lines: { account_code: string; debit?: number; credit?: number; description?: string | null }[];
  }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context as Ctx);
    const lines = (data.lines || [])
      .map((l) => ({ ...l, debit: r2(num(l.debit)), credit: r2(num(l.credit)) }))
      .filter((l) => l.account_code && (l.debit > 0 || l.credit > 0));
    if (lines.length < 2) throw new Error("A journal entry needs at least two lines");
    const debit = r2(lines.reduce((s, l) => s + l.debit, 0));
    const credit = r2(lines.reduce((s, l) => s + l.credit, 0));
    if (Math.abs(debit - credit) > 0.009) throw new Error(`Entry is out of balance: debits ${debit} vs credits ${credit}`);

    const { data: accounts, error: accErr } = await context.supabase.from("chart_of_accounts").select("id, code");
    if (accErr) throw new Error(accErr.message);
    const idByCode = new Map((accounts ?? []).map((a: any) => [a.code, a.id]));
    for (const l of lines) if (!idByCode.has(l.account_code)) throw new Error(`Unknown account ${l.account_code}`);

    const { data: entry, error } = await context.supabase.from("journal_entries").insert({
      entry_date: data.entry_date || new Date().toISOString().slice(0, 10),
      memo: (data.memo || "Manual journal").slice(0, 300),
      source_type: "manual", currency: (data.currency || "USD").toUpperCase(),
      total_debit: debit, total_credit: credit, created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);

    const { error: lineErr } = await context.supabase.from("journal_lines").insert(
      lines.map((l) => ({
        entry_id: entry.id, account_code: l.account_code, account_id: idByCode.get(l.account_code) ?? null,
        debit: l.debit, credit: l.credit, description: l.description?.trim() || null,
      })),
    );
    if (lineErr) throw new Error(lineErr.message);
    return entry;
  });

/** Reverse a posted entry by mirroring its lines. */
export const reverseJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context as Ctx);
    const sb = context.supabase;
    const { data: entry, error } = await sb.from("journal_entries").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const { data: existing } = await sb.from("journal_entries").select("id").eq("reverses_entry_id", data.id).maybeSingle();
    if (existing) throw new Error("This entry has already been reversed");
    const { data: lines, error: lErr } = await sb.from("journal_lines").select("*").eq("entry_id", data.id);
    if (lErr) throw new Error(lErr.message);

    const { data: rev, error: rErr } = await sb.from("journal_entries").insert({
      entry_date: new Date().toISOString().slice(0, 10),
      memo: `Reversal of ${entry.source_ref ?? entry.memo ?? "entry"}${data.reason ? ` · ${data.reason}` : ""}`.slice(0, 300),
      source_type: "reversal", currency: entry.currency, fx_rate: entry.fx_rate,
      customer_id: entry.customer_id, reverses_entry_id: entry.id,
      total_debit: entry.total_credit, total_credit: entry.total_debit, created_by: context.userId,
    }).select("*").single();
    if (rErr) throw new Error(rErr.message);

    const { error: insErr } = await sb.from("journal_lines").insert(
      (lines ?? []).map((l: any) => ({
        entry_id: rev.id, account_code: l.account_code, account_id: l.account_id,
        debit: l.credit, credit: l.debit, description: `Reversal · ${l.description ?? ""}`.trim(),
        customer_id: l.customer_id, vendor_id: l.vendor_id,
      })),
    );
    if (insErr) throw new Error(insErr.message);
    return rev;
  });
