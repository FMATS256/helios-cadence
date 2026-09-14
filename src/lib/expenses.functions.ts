// Expenses & Cash — petty cash / bank accounts, expense records, cash movements.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertFinance(ctx: Ctx) {
  const { data, error } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const mine = new Set((data || []).map((r: any) => r.role));
  if (mine.has("master_admin")) return;
  if (!["finance", "operations_manager"].some((r) => mine.has(r))) {
    throw new Error("Forbidden: finance or operations role required");
  }
}

/** Full workspace payload: accounts with live balances, expenses, movements, cash KPIs. */
export const getCashWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [accountsRes, expensesRes, movementsRes, paymentsRes] = await Promise.all([
      context.supabase.from("cash_accounts").select("*").order("is_default", { ascending: false }).order("name"),
      context.supabase
        .from("expenses")
        .select("*, customers(id, company_name, account_number), cash_accounts(id, name, kind)")
        .order("expense_date", { ascending: false })
        .limit(500),
      context.supabase.from("cash_movements").select("*, cash_accounts(id, name, kind)").order("occurred_at", { ascending: false }).limit(300),
      context.supabase.from("payments").select("id, amount, currency, method, paid_at, status").order("paid_at", { ascending: false }).limit(1000),
    ]);
    if (accountsRes.error) throw new Error(accountsRes.error.message);
    if (expensesRes.error) throw new Error(expensesRes.error.message);

    const accounts: any[] = accountsRes.data ?? [];
    const expenses: any[] = expensesRes.data ?? [];
    const movements: any[] = movementsRes.data ?? [];
    const payments: any[] = (paymentsRes.data ?? []).filter((p: any) => p.status !== "void" && p.status !== "cancelled");

    const isCash = (m?: string | null) => (m ?? "").toLowerCase().includes("cash");
    const defaultCash = accounts.find((a) => a.is_default && a.kind === "cash") ?? accounts.find((a) => a.kind === "cash");

    const balances = accounts.map((a) => {
      const spent = expenses
        .filter((e) => e.account_id === a.id && e.status === "paid")
        .reduce((s, e) => s + Number(e.amount || 0), 0);
      const moved = movements
        .filter((m) => m.account_id === a.id)
        .reduce((s, m) => s + (m.kind === "withdrawal" || m.kind === "transfer_out" ? -Number(m.amount || 0) : Number(m.amount || 0)), 0);
      // Cash collected from customers lands in the default cash drawer.
      const collected = defaultCash && a.id === defaultCash.id
        ? payments.filter((p) => isCash(p.method)).reduce((s, p) => s + Number(p.amount || 0), 0)
        : 0;
      return {
        ...a,
        spent,
        collected,
        balance: Number(a.opening_balance || 0) + moved + collected - spent,
      };
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const monthExpenses = expenses.filter((e) => e.expense_date >= monthStart);
    const byCategory: Record<string, number> = {};
    for (const e of monthExpenses) byCategory[e.category || "general"] = (byCategory[e.category || "general"] ?? 0) + Number(e.amount || 0);

    const cashInHand = balances.filter((a) => a.kind === "cash").reduce((s, a) => s + a.balance, 0);
    const bankBalance = balances.filter((a) => a.kind !== "cash").reduce((s, a) => s + a.balance, 0);

    return {
      accounts: balances,
      expenses,
      movements,
      stats: {
        cashInHand,
        bankBalance,
        monthSpend: monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0),
        totalSpend: expenses.reduce((s, e) => s + Number(e.amount || 0), 0),
        pendingCount: expenses.filter((e) => e.status === "pending").length,
        pendingTotal: expenses.filter((e) => e.status === "pending").reduce((s, e) => s + Number(e.amount || 0), 0),
        expenseCount: expenses.length,
        cashCollected: payments.filter((p) => isCash(p.method)).reduce((s, p) => s + Number(p.amount || 0), 0),
        byCategory,
      },
    };
  });

export const upsertExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string; expense_date: string; category: string; vendor?: string;
    description: string; amount: number; currency?: string; account_id?: string | null;
    payment_method?: string; reference?: string; status?: string; customer_id?: string | null; notes?: string;
    attachment_url?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context as Ctx);
    if (!data.description?.trim()) throw new Error("Description is required");
    if (!(Number(data.amount) > 0)) throw new Error("Amount must be greater than zero");
    const payload: any = {
      expense_date: data.expense_date,
      category: (data.category || "general").trim(),
      vendor: data.vendor?.trim() || null,
      description: data.description.trim(),
      amount: Number(data.amount),
      currency: data.currency || "USD",
      account_id: data.account_id || null,
      payment_method: data.payment_method || "cash",
      reference: data.reference?.trim() || null,
      status: data.status || "paid",
      customer_id: data.customer_id || null,
      notes: data.notes?.trim() || null,
    };
    if (data.attachment_url !== undefined) payload.attachment_url = data.attachment_url || null;

    if (data.id) {
      const { data: row, error } = await context.supabase.from("expenses").update(payload).eq("id", data.id).select("*").single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("expenses").insert({ ...payload, created_by: context.userId }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context as Ctx);
    const { error } = await context.supabase.from("expenses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertCashAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string; name: string; kind: string; currency?: string;
    opening_balance?: number; is_default?: boolean; is_active?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context as Ctx);
    if (!data.name?.trim()) throw new Error("Account name is required");
    const payload: any = {
      name: data.name.trim(),
      kind: data.kind || "cash",
      currency: data.currency || "USD",
      opening_balance: Number(data.opening_balance) || 0,
      is_default: !!data.is_default,
      is_active: data.is_active ?? true,
    };
    if (payload.is_default) {
      await context.supabase.from("cash_accounts").update({ is_default: false }).neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }
    if (data.id) {
      const { data: row, error } = await context.supabase.from("cash_accounts").update(payload).eq("id", data.id).select("*").single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("cash_accounts").insert({ ...payload, created_by: context.userId }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const recordCashMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    account_id: string; kind: "deposit" | "withdrawal"; amount: number;
    currency?: string; reference?: string; notes?: string; occurred_at?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context as Ctx);
    if (!data.account_id) throw new Error("Choose an account");
    if (!(Number(data.amount) > 0)) throw new Error("Amount must be greater than zero");
    const { data: row, error } = await context.supabase.from("cash_movements").insert({
      account_id: data.account_id,
      kind: data.kind,
      amount: Number(data.amount),
      currency: data.currency || "USD",
      occurred_at: data.occurred_at ? new Date(data.occurred_at).toISOString() : new Date().toISOString(),
      reference: data.reference?.trim() || null,
      notes: data.notes?.trim() || null,
      created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Short-lived signed link so finance staff can open an attached receipt/invoice. */
export const getExpenseReceiptUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path: string }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context as Ctx);
    const { data: signed, error } = await context.supabase.storage
      .from("finance-receipts").createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl as string };
  });
