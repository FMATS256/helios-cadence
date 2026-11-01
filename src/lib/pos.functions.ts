// Mini POS — over-the-counter sales of hardware, routers, switches and stock.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertStaff(ctx: Ctx) {
  const { data, error } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const mine = new Set<string>((data || []).map((r: any) => String(r.role)));
  if (mine.has("master_admin")) return mine;
  const allowed = ["operations_manager", "finance", "sales", "inventory", "procurement", "account_manager", "customer_success"];
  if (!allowed.some((r) => mine.has(r))) throw new Error("Forbidden: sales, finance or inventory role required");
  return mine;
}

async function actorName(ctx: Ctx): Promise<string | null> {
  const { data } = await ctx.supabase.from("profiles").select("full_name, email").eq("id", ctx.userId).maybeSingle();
  return data?.full_name || data?.email || null;
}

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Finance roles that may record money and reconcile POS sales (mirrors is_billing_staff). */
export function isBilling(roles: Set<string>) {
  return roles.has("master_admin") || roles.has("finance") || roles.has("operations_manager");
}

async function assertBilling(ctx: Ctx) {
  const roles = await assertStaff(ctx);
  if (!isBilling(roles)) throw new Error("Only Finance can reconcile POS sales");
  return roles;
}

/** Everything the POS screen needs: sellable stock, recent sales, tills, customers, KPIs. */
export const getPosWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await assertStaff(context as Ctx);
    const canReconcile = isBilling(roles);
    const db = context.supabase as any;
    const [itemsR, salesR, accountsR, customersR, closeoutsR] = await Promise.all([
      db.from("inventory_items").select("*").is("archived_at", null).order("name"),
      db.from("pos_sales").select("*, pos_sale_items(*)").order("created_at", { ascending: false }).limit(200),
      db.from("cash_accounts").select("id, name, kind, currency, is_default").order("is_default", { ascending: false }).order("name"),
      db.from("customers").select("id, company_name, account_number").order("company_name").limit(1000),
      db.from("pos_closeouts").select("*").order("business_date", { ascending: false }).limit(60),
    ]);
    if (itemsR.error) throw new Error(itemsR.error.message);
    if (salesR.error) throw new Error(salesR.error.message);

    const items: any[] = itemsR.data ?? [];
    const sales: any[] = salesR.data ?? [];
    const live = sales.filter((s) => s.status !== "void");

    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const sum = (rows: any[]) => rows.reduce((s, r) => s + num(r.total), 0);
    const costOf = (s: any) => (s.pos_sale_items || []).reduce((t: number, l: any) => t + num(l.unit_cost) * num(l.quantity), 0);

    const today = live.filter((s) => new Date(s.created_at) >= startOfDay);
    const month = live.filter((s) => new Date(s.created_at) >= monthStart);

    const unitsToday = today.reduce((t, s) => t + (s.pos_sale_items || []).reduce((x: number, l: any) => x + num(l.quantity), 0), 0);

    return {
      can_reconcile: canReconcile,
      items,
      sales,
      accounts: accountsR.data ?? [],
      customers: customersR.data ?? [],
      closeouts: closeoutsR.data ?? [],
      stats: {
        salesToday: today.length,
        revenueToday: sum(today),
        unitsToday,
        revenueMonth: sum(month),
        profitMonth: month.reduce((t, s) => t + (num(s.total) - costOf(s)), 0),
        stockValue: items.reduce((t, i) => t + num(i.quantity) * num(i.unit_cost), 0),
        retailValue: items.reduce((t, i) => t + num(i.quantity) * num(i.sale_price), 0),
        lowStock: items.filter((i) => num(i.quantity) <= num(i.reorder_level)).length,
        outOfStock: items.filter((i) => num(i.quantity) <= 0).length,
        sellable: items.filter((i) => i.is_sellable !== false).length,
      },
    };
  });

export type PosLineInput = { item_id?: string | null; sku?: string | null; name: string; quantity: number; unit_price: number };

/** Ring up a sale: validates stock, decrements inventory, banks the cash and audits. */
export const createPosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    lines: PosLineInput[];
    customer_id?: string | null;
    walkin_name?: string | null;
    walkin_phone?: string | null;
    discount?: number;
    tax?: number;
    currency?: string;
    payment_method?: string;
    amount_paid?: number;
    account_id?: string | null;
    notes?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const db = context.supabase as any;

    const lines = (data.lines || []).filter((l) => l && l.name && num(l.quantity) > 0);
    if (!lines.length) throw new Error("Add at least one item to the cart");

    // Load current stock for every catalogue line and validate availability.
    const ids = lines.map((l) => l.item_id).filter(Boolean) as string[];
    let stock: Record<string, any> = {};
    if (ids.length) {
      const { data: rows, error } = await db.from("inventory_items").select("id, name, sku, quantity, unit_cost").in("id", ids);
      if (error) throw new Error(error.message);
      stock = Object.fromEntries((rows ?? []).map((r: any) => [r.id, r]));
      for (const l of lines) {
        if (!l.item_id) continue;
        const row = stock[l.item_id];
        if (!row) throw new Error(`Item no longer exists: ${l.name}`);
        if (num(row.quantity) < num(l.quantity)) {
          throw new Error(`Insufficient stock for ${row.name} — ${num(row.quantity)} on hand, ${num(l.quantity)} requested`);
        }
      }
    }

    const subtotal = lines.reduce((s, l) => s + num(l.quantity) * num(l.unit_price), 0);
    const discount = Math.max(0, num(data.discount));
    const tax = Math.max(0, num(data.tax));
    const total = Math.max(0, subtotal - discount + tax);
    const amountPaid = data.amount_paid == null ? total : num(data.amount_paid);
    if (amountPaid + 0.0001 < total) throw new Error("Amount tendered is less than the sale total");

    const now = new Date();
    const prefix = `POS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const { count } = await db.from("pos_sales").select("id", { count: "exact", head: true }).like("sale_number", `${prefix}%`);
    const saleNumber = `${prefix}-${String((count ?? 0) + 1).padStart(4, "0")}`;

    let accountNumber: string | null = null;
    if (data.customer_id) {
      const { data: c } = await db.from("customers").select("account_number").eq("id", data.customer_id).maybeSingle();
      accountNumber = c?.account_number ?? null;
    }

    const { data: sale, error: saleErr } = await db.from("pos_sales").insert({
      sale_number: saleNumber,
      customer_id: data.customer_id || null,
      account_number: accountNumber,
      walkin_name: data.customer_id ? null : (data.walkin_name?.trim() || "Walk-in customer"),
      walkin_phone: data.walkin_phone?.trim() || null,
      subtotal, discount, tax, total,
      currency: data.currency || "USD",
      payment_method: data.payment_method || "cash",
      amount_paid: amountPaid,
      change_due: Math.max(0, amountPaid - total),
      account_id: data.account_id || null,
      status: "completed",
      notes: data.notes?.trim() || null,
      sold_by: context.userId,
      sold_by_name: await actorName(context as Ctx),
    }).select("*").single();
    if (saleErr) throw new Error(saleErr.message);

    const itemRows = lines.map((l) => ({
      sale_id: sale.id,
      item_id: l.item_id || null,
      sku: l.sku || (l.item_id ? stock[l.item_id]?.sku : null) || null,
      name: l.name,
      quantity: num(l.quantity),
      unit_price: num(l.unit_price),
      unit_cost: l.item_id ? num(stock[l.item_id]?.unit_cost) : 0,
      line_total: num(l.quantity) * num(l.unit_price),
    }));
    const { error: itemsErr } = await db.from("pos_sale_items").insert(itemRows);
    if (itemsErr) {
      await db.from("pos_sales").delete().eq("id", sale.id);
      throw new Error(itemsErr.message);
    }

    // Decrement stock
    for (const l of lines) {
      if (!l.item_id) continue;
      const remaining = num(stock[l.item_id].quantity) - num(l.quantity);
      await db.from("inventory_items").update({ quantity: remaining }).eq("id", l.item_id);
    }

    // Money is not banked here: the sale waits in Finance's reconciliation queue,
    // where Finance records (or matches) the payment, invoice and ledger entry.
    const invoiceId: string | null = null;
    const invoiceNumber: string | null = null;
    const paymentId: string | null = null;

    await db.from("audit_log").insert({
      actor_id: context.userId,
      action: "pos_sale_created",
      entity_type: "pos_sales",
      entity_id: sale.id,
      account_number: accountNumber,
      module: "pos",
      new_value: { sale_number: saleNumber, total, lines: itemRows.length, payment_method: data.payment_method || "cash" },
    });

    if (data.customer_id) {
      await db.from("customer_timeline").insert({
        customer_id: data.customer_id,
        event_type: "pos_sale",
        title: `Counter sale ${saleNumber}`,
        description: `${itemRows.length} item(s) sold for ${(data.currency || "USD")} ${total.toFixed(2)}`,
        created_by: context.userId,
      }).then(() => null, () => null);
    }

    return { ...sale, invoice_id: invoiceId, invoice_number: invoiceNumber, payment_id: paymentId, pos_sale_items: itemRows };
  });

/** Void a sale — returns stock to the shelf and reverses the till deposit. */
export const voidPosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    const roles = await assertStaff(context as Ctx);
    const db = context.supabase as any;
    const { data: sale, error } = await db.from("pos_sales").select("*, pos_sale_items(*)").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    if (sale.status === "void") throw new Error("Sale is already voided");
    const reconciled = sale.reconciliation_status === "reconciled";
    if (reconciled && !isBilling(roles)) {
      throw new Error("Finance has already reconciled this sale — ask Finance to void it");
    }

    for (const l of sale.pos_sale_items || []) {
      if (!l.item_id) continue;
      const { data: item } = await db.from("inventory_items").select("quantity").eq("id", l.item_id).maybeSingle();
      if (item) await db.from("inventory_items").update({ quantity: num(item.quantity) + num(l.quantity) }).eq("id", l.item_id);
    }

    // Money was only recorded once Finance reconciled the sale, so only then reverse it.
    if (reconciled && sale.account_id) {
      await db.from("cash_movements").insert({
        account_id: sale.account_id,
        kind: "withdrawal",
        amount: num(sale.total),
        currency: sale.currency || "USD",
        occurred_at: new Date().toISOString(),
        reference: sale.sale_number,
        notes: `Void of POS sale ${sale.sale_number}${data.reason ? ` — ${data.reason}` : ""}`,
        created_by: context.userId,
      });
    }

    // Reverse the generated invoice / payment so finance stays in balance.
    if (reconciled && sale.payment_id) {
      await db.from("payment_allocations").delete().eq("payment_id", sale.payment_id);
      await db.from("payments").update({ status: "voided", notes: `Voided with POS sale ${sale.sale_number}` }).eq("id", sale.payment_id);
    }
    if (reconciled && sale.invoice_id) {
      await db.from("invoices").update({ status: "void", paid_at: null, notes: `Voided with POS sale ${sale.sale_number}` }).eq("id", sale.invoice_id);
    }
    if (reconciled) {
      const { data: je } = await db.from("journal_entries").select("id").eq("source_type", "pos_sale").eq("source_id", sale.id).maybeSingle();
      if (je?.id) {
        const { data: jl } = await db.from("journal_lines").select("account_code, debit, credit, description, customer_id").eq("entry_id", je.id);
        const { postJournalEntry } = await import("./ledger.server");
        await postJournalEntry(db, {
          source_type: "pos_sale_void", source_id: sale.id, source_ref: sale.sale_number,
          entry_date: new Date().toISOString().slice(0, 10),
          memo: `Reversal of POS sale ${sale.sale_number}`, currency: sale.currency || "USD",
          customer_id: sale.customer_id ?? null,
          lines: (jl ?? []).map((l: any) => ({ ...l, debit: num(l.credit), credit: num(l.debit) })),
        }, context.userId);
      }
    }

    const { data: updated, error: upErr } = await db.from("pos_sales").update({
      status: "void",
      voided_at: new Date().toISOString(),
      notes: [sale.notes, data.reason ? `Voided: ${data.reason}` : "Voided"].filter(Boolean).join(" · "),
    }).eq("id", data.id).select("*").single();
    if (upErr) throw new Error(upErr.message);

    await db.from("audit_log").insert({
      actor_id: context.userId,
      action: "pos_sale_voided",
      entity_type: "pos_sales",
      entity_id: sale.id,
      account_number: sale.account_number,
      module: "pos",
      old_value: { status: sale.status, total: sale.total },
      new_value: { status: "void", reason: data.reason ?? null },
    });

    return updated;
  });

/** Quick stock maintenance from the POS screen: pricing and restocks. */
export const updatePosItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string; sku: string; name: string; category?: string; quantity?: number;
    reorder_level?: number; unit_cost?: number; sale_price?: number; is_sellable?: boolean;
    location?: string; supplier?: string; barcode?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const db = context.supabase as any;
    if (!data.sku?.trim()) throw new Error("SKU is required");
    if (!data.name?.trim()) throw new Error("Name is required");
    const payload = {
      sku: data.sku.trim().toUpperCase(),
      name: data.name.trim(),
      category: data.category?.trim() || null,
      quantity: num(data.quantity),
      reorder_level: num(data.reorder_level),
      unit_cost: num(data.unit_cost),
      sale_price: num(data.sale_price),
      is_sellable: data.is_sellable !== false,
      location: data.location?.trim() || null,
      supplier: data.supplier?.trim() || null,
      barcode: data.barcode?.trim() || null,
    };
    const q = data.id
      ? db.from("inventory_items").update(payload).eq("id", data.id).select("*").single()
      : db.from("inventory_items").insert({ ...payload, created_by: context.userId }).select("*").single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

/* ------------------------------------------------------------------ *
 * Bulk stock intake — paste/upload many items at once. Existing SKUs
 * are restocked (quantity added) and repriced; new SKUs are created.
 * ------------------------------------------------------------------ */
export type BulkStockRow = {
  sku: string; name?: string | null; category?: string | null; quantity?: number;
  unit_cost?: number; sale_price?: number; reorder_level?: number; barcode?: string | null;
  location?: string | null; supplier?: string | null;
};

export const bulkUpsertPosItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rows: BulkStockRow[]; mode?: "add" | "set" }) => d)
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const db = context.supabase as any;
    const mode = data.mode === "set" ? "set" : "add";
    const rows = (data.rows || [])
      .map((r) => ({ ...r, sku: String(r.sku ?? "").trim().toUpperCase() }))
      .filter((r) => r.sku);
    if (!rows.length) throw new Error("No valid rows — every line needs a SKU");

    const { data: existing, error } = await db
      .from("inventory_items").select("id, sku, name, quantity, unit_cost, sale_price").in("sku", rows.map((r) => r.sku));
    if (error) throw new Error(error.message);
    const bySku: Record<string, any> = Object.fromEntries((existing ?? []).map((r: any) => [r.sku, r]));

    let created = 0, restocked = 0, unitsAdded = 0;
    for (const r of rows) {
      const qty = num(r.quantity);
      const cur = bySku[r.sku];
      if (cur) {
        const nextQty = mode === "add" ? num(cur.quantity) + qty : qty;
        const patch: any = { quantity: nextQty };
        if (r.name?.trim()) patch.name = r.name.trim();
        if (r.category?.trim()) patch.category = r.category.trim();
        if (r.unit_cost != null) patch.unit_cost = num(r.unit_cost);
        if (r.sale_price != null) patch.sale_price = num(r.sale_price);
        if (r.reorder_level != null) patch.reorder_level = num(r.reorder_level);
        if (r.barcode?.trim()) patch.barcode = r.barcode.trim();
        if (r.location?.trim()) patch.location = r.location.trim();
        if (r.supplier?.trim()) patch.supplier = r.supplier.trim();
        const { error: e } = await db.from("inventory_items").update(patch).eq("id", cur.id);
        if (e) throw new Error(`${r.sku}: ${e.message}`);
        restocked += 1;
        unitsAdded += mode === "add" ? qty : 0;
      } else {
        const { error: e } = await db.from("inventory_items").insert({
          sku: r.sku,
          name: r.name?.trim() || r.sku,
          category: r.category?.trim() || null,
          quantity: qty,
          reorder_level: num(r.reorder_level),
          unit_cost: num(r.unit_cost),
          sale_price: num(r.sale_price),
          is_sellable: true,
          barcode: r.barcode?.trim() || null,
          location: r.location?.trim() || null,
          supplier: r.supplier?.trim() || null,
          created_by: context.userId,
        });
        if (e) throw new Error(`${r.sku}: ${e.message}`);
        created += 1;
        unitsAdded += qty;
      }
    }

    await db.from("audit_log").insert({
      actor_id: context.userId,
      action: "pos_stock_bulk_upload",
      entity_type: "inventory_items",
      module: "pos",
      new_value: { rows: rows.length, created, restocked, units_added: unitsAdded, mode },
    });

    return { created, restocked, units: unitsAdded };
  });

/* ------------------------------------------------------------------ *
 * Daily closeout (Z-report)
 * ------------------------------------------------------------------ */
function dayBounds(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}

async function buildCloseout(db: any, date: string) {
  const { start, end } = dayBounds(date);
  const { data: sales, error } = await db
    .from("pos_sales")
    .select("*, pos_sale_items(*)")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at");
  if (error) throw new Error(error.message);

  const live = (sales ?? []).filter((s: any) => s.status !== "void");
  const voided = (sales ?? []).filter((s: any) => s.status === "void");

  const gross = live.reduce((t: number, s: any) => t + num(s.subtotal), 0);
  const discounts = live.reduce((t: number, s: any) => t + num(s.discount), 0);
  const tax = live.reduce((t: number, s: any) => t + num(s.tax), 0);
  const net = live.reduce((t: number, s: any) => t + num(s.total), 0);
  const cost = live.reduce((t: number, s: any) =>
    t + (s.pos_sale_items || []).reduce((x: number, l: any) => x + num(l.unit_cost) * num(l.quantity), 0), 0);
  const units = live.reduce((t: number, s: any) =>
    t + (s.pos_sale_items || []).reduce((x: number, l: any) => x + num(l.quantity), 0), 0);

  const methods: Record<string, { count: number; amount: number }> = {};
  for (const s of live) {
    const k = String(s.payment_method || "cash");
    methods[k] = methods[k] || { count: 0, amount: 0 };
    methods[k]!.count += 1;
    methods[k]!.amount += num(s.total);
  }

  const topSellers: Record<string, { name: string; qty: number; revenue: number }> = {};
  for (const s of live) {
    for (const l of s.pos_sale_items || []) {
      const k = l.sku || l.name;
      topSellers[k] = topSellers[k] || { name: l.name, qty: 0, revenue: 0 };
      topSellers[k]!.qty += num(l.quantity);
      topSellers[k]!.revenue += num(l.line_total);
    }
  }

  return {
    date,
    sales_count: live.length,
    voided_count: voided.length,
    units,
    gross_sales: gross,
    discounts,
    tax,
    net_sales: net,
    cost_of_sales: cost,
    gross_profit: net - cost,
    expected_cash: methods["cash"]?.amount ?? 0,
    methods,
    top_sellers: Object.values(topSellers).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    sales: live,
  };
}

/** Live Z-report preview for a business date. */
export const getPosCloseout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { date?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const date = data.date || new Date().toISOString().slice(0, 10);
    return buildCloseout(context.supabase as any, date);
  });

/** Close the day: snapshot the Z-report, record cash variance and audit it. */
export const closePosDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { date?: string; counted_cash?: number; account_id?: string | null; notes?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const roles = await assertStaff(context as Ctx);
    const db = context.supabase as any;
    const date = data.date || new Date().toISOString().slice(0, 10);

    const { data: already } = await db.from("pos_closeouts").select("id").eq("business_date", date).maybeSingle();
    if (already) throw new Error(`${date} has already been closed out`);

    const z = await buildCloseout(db, date);
    const counted = num(data.counted_cash);
    const variance = counted - z.expected_cash;

    const { data: row, error } = await db.from("pos_closeouts").insert({
      business_date: date,
      account_id: data.account_id || null,
      sales_count: z.sales_count,
      units_sold: z.units,
      gross_sales: z.gross_sales,
      discounts: z.discounts,
      tax: z.tax,
      net_sales: z.net_sales,
      cost_of_sales: z.cost_of_sales,
      gross_profit: z.gross_profit,
      expected_cash: z.expected_cash,
      counted_cash: counted,
      variance,
      method_breakdown: z.methods,
      notes: data.notes?.trim() || null,
      closed_by: context.userId,
      closed_by_name: await actorName(context as Ctx),
    }).select("*").single();
    if (error) throw new Error(error.message);

    await db.from("pos_sales")
      .update({ closeout_id: row.id })
      .in("id", z.sales.map((s: any) => s.id).length ? z.sales.map((s: any) => s.id) : ["00000000-0000-0000-0000-000000000000"]);

    // Cash variance is posted only by Finance (here, or later when Finance reviews the day).
    if (isBilling(roles) && data.account_id && Math.abs(variance) > 0.005) {
      await db.from("cash_movements").insert({
        account_id: data.account_id,
        kind: variance > 0 ? "deposit" : "withdrawal",
        amount: Math.abs(variance),
        currency: "USD",
        occurred_at: new Date().toISOString(),
        reference: `CLOSE-${date}`,
        notes: `POS closeout variance for ${date}`,
        created_by: context.userId,
      });
    }

    await db.from("audit_log").insert({
      actor_id: context.userId,
      action: "pos_day_closed",
      entity_type: "pos_closeouts",
      entity_id: row.id,
      module: "pos",
      new_value: { date, sales: z.sales_count, net_sales: z.net_sales, expected_cash: z.expected_cash, counted, variance },
    });

    return row;
  });

/* ------------------------------------------------------------------ *
 * Invoice PDF — rendered by the quotation engine and streamed through
 * the server (the engine endpoint needs the API key).
 * ------------------------------------------------------------------ */

export const getPosSalePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sale_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const db = context.supabase as any;

    const { data: sale, error } = await db
      .from("pos_sales")
      .select("*, pos_sale_items(*)")
      .eq("id", data.sale_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sale) throw new Error("Sale not found");

    let customer: any = null;
    if (sale.customer_id) {
      const { data: c } = await db
        .from("customers")
        .select("company_name, account_number, primary_email, primary_phone, billing_address")
        .eq("id", sale.customer_id)
        .maybeSingle();
      customer = c;
    }
    let invoiceNumber: string | null = null;
    let issueDate: string | null = null;
    if (sale.invoice_id) {
      const { data: inv } = await db
        .from("invoices")
        .select("invoice_number, issue_date, status")
        .eq("id", sale.invoice_id)
        .maybeSingle();
      invoiceNumber = inv?.invoice_number ?? null;
      issueDate = inv?.issue_date ?? null;
    }

    const rep = await actorName(context as Ctx);
    const currency = sale.currency || "USD";
    const lines: any[] = sale.pos_sale_items ?? [];
    const items = lines.map((l, i) => {
      const quantity = num(l.quantity) || 1;
      const price = num(l.unit_price);
      return {
        id: String(l.id ?? i + 1),
        name: l.sku ? `${l.name} (${l.sku})` : (l.name ?? "Item"),
        description: l.sku ? `${l.name} (${l.sku})` : (l.name ?? "Item"),
        quantity,
        qty: quantity,
        unitPrice: price,
        price,
        vat: 0,
        taxRate: 0,
        total: num(l.line_total) || quantity * price,
      };
    });
    const subtotal = items.reduce((s, it) => s + (it.total ?? 0), 0);
    const tax = num(sale.tax);
    const reference = invoiceNumber || sale.sale_number;

    const party = {
      name: customer?.company_name || sale.walkin_name || "Walk-in client",
      email: customer?.primary_email || sale.walkin_email || "",
      phone: customer?.primary_phone || sale.walkin_phone || "",
      address: customer?.billing_address || "",
      reference: customer?.account_number || sale.account_number || "WALK-IN",
    };

    const payload: any = {
      type: "invoice",
      docType: "invoice",
      reference,
      externalId: String(sale.id),
      externalClientId: sale.customer_id ? String(sale.customer_id) : "",
      title: `Invoice ${reference}`,
      currency,
      status: "final",
      notes: [sale.notes, `Paid by ${sale.payment_method || "cash"} — counter sale ${sale.sale_number}`]
        .filter(Boolean)
        .join("\n"),
      customerName: party.name,
      customerEmail: party.email,
      customerAddress: party.address,
      customerAccount: party.reference,
      account: party.reference,
      customer: party,
      buyer: party,
      items,
      totals: { subtotal: subtotal - num(sale.discount), tax, total: num(sale.total) },
      salesRep: rep ?? "IMT Solutions",
      sales_rep: rep ?? "IMT Solutions",
      preparedBy: rep ?? "IMT Solutions",
      agent: rep ?? "IMT Solutions",
      metadata: {
        source: "IMT POS",
        sale_number: sale.sale_number,
        invoice_number: invoiceNumber,
        issue_date: issueDate ?? String(sale.created_at ?? "").slice(0, 10),
        paid: true,
        payment_method: sale.payment_method || "cash",
        discount: num(sale.discount),
      },
    };

    const { quoteStudio } = await import("./quote-studio.server");
    const res = await quoteStudio.renderPdf(payload, {
      userId: context.userId,
      userName: rep ?? undefined,
    });
    if (!res.ok) throw new Error(res.error);

    let binary = "";
    const bytes = res.data.bytes;
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return {
      filename: `${reference || "invoice"}.pdf`.replace(/[^\w.-]+/g, "-"),
      base64: btoa(binary),
    };
  });

/* ------------------------------------------------------------------ *
 * Finance reconciliation — sales staff ring up sales; Finance confirms
 * the money by recording the payment or matching one already received.
 * ------------------------------------------------------------------ */

/** Pending/disputed sales plus candidate payments Finance can match them to. */
export const getPosReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertBilling(context as Ctx);
    const db = context.supabase as any;
    const [salesR, linkedR, paysR, closeR] = await Promise.all([
      db.from("pos_sales").select("*, pos_sale_items(*)").neq("status", "void")
        .in("reconciliation_status", ["pending", "disputed"]).order("created_at", { ascending: true }).limit(300),
      db.from("pos_sales").select("payment_id").not("payment_id", "is", null),
      db.from("payments").select("id, amount, currency, method, reference, paid_at, status, customer_id, account_number, receipt_number")
        .neq("status", "voided").order("paid_at", { ascending: false }).limit(400),
      db.from("pos_closeouts").select("*").is("finance_reviewed_at", null).order("business_date", { ascending: false }).limit(60),
    ]);
    if (salesR.error) throw new Error(salesR.error.message);
    const linked = new Set((linkedR.data ?? []).map((r: any) => r.payment_id));
    const payments = (paysR.data ?? []).filter((p: any) => !linked.has(p.id));
    const sales = (salesR.data ?? []).map((s: any) => {
      const t = new Date(s.created_at).getTime();
      const suggestions = payments.filter((p: any) =>
        Math.abs(num(p.amount) - num(s.total)) < 0.01 &&
        String(p.currency || "USD").toUpperCase() === String(s.currency || "USD").toUpperCase() &&
        (!s.customer_id || !p.customer_id || p.customer_id === s.customer_id) &&
        Math.abs(new Date(p.paid_at || 0).getTime() - t) <= 7 * 86_400_000,
      ).slice(0, 5);
      return { ...s, suggestions };
    });
    return { sales, payments, closeouts: closeR.data ?? [] };
  });

export const reconcilePosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; mode: "record" | "match" | "dispute"; account_id?: string | null; payment_id?: string | null; note?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertBilling(context as Ctx);
    const db = context.supabase as any;
    const { data: sale, error } = await db.from("pos_sales").select("*, pos_sale_items(*)").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    if (sale.status === "void") throw new Error("Voided sales cannot be reconciled");
    if (sale.reconciliation_status === "reconciled") throw new Error("Sale is already reconciled");
    const who = await actorName(context as Ctx);
    const note = data.note?.trim() || null;
    const total = num(sale.total);
    const currency = String(sale.currency || "USD").toUpperCase();
    let paymentId: string | null = null;
    let invoiceId: string | null = sale.invoice_id ?? null;
    let accountId: string | null = sale.account_id ?? null;

    if (data.mode === "dispute") {
      if (!note) throw new Error("Add a note explaining what doesn't match");
      const { data: row, error: e } = await db.from("pos_sales").update({ reconciliation_status: "disputed", reconciliation_note: note }).eq("id", sale.id).select("*").single();
      if (e) throw new Error(e.message);
      await db.from("audit_log").insert({ actor_id: context.userId, action: "pos_sale_disputed", entity_type: "pos_sales", entity_id: sale.id, module: "pos", new_value: { note } });
      return row;
    }

    if (data.mode === "match") {
      if (!data.payment_id) throw new Error("Choose the payment this sale was paid with");
      const { data: pay, error: pe } = await db.from("payments").select("*").eq("id", data.payment_id).single();
      if (pe) throw new Error(pe.message);
      if (pay.status === "voided") throw new Error("That payment is voided");
      if (Math.abs(num(pay.amount) - total) >= 0.01) throw new Error(`Payment amount ${num(pay.amount).toFixed(2)} does not equal sale total ${total.toFixed(2)}`);
      if (String(pay.currency || "USD").toUpperCase() !== currency) throw new Error("Payment currency differs from the sale");
      if (sale.customer_id && pay.customer_id && pay.customer_id !== sale.customer_id) throw new Error("Payment belongs to a different client");
      const { data: used } = await db.from("pos_sales").select("sale_number").eq("payment_id", pay.id).maybeSingle();
      if (used) throw new Error(`Payment is already matched to ${used.sale_number}`);
      paymentId = pay.id;
    } else {
      // Record: Finance banks the money now — cash movement, payment (for clients) and ledger.
      accountId = data.account_id || null;
      if (!accountId) throw new Error("Choose the till or bank account the money went into");
      const { data: acct, error: ae } = await db.from("cash_accounts").select("id, name, kind, currency").eq("id", accountId).single();
      if (ae) throw new Error(ae.message);
      const when = new Date(sale.created_at).toISOString();
      const { error: cmErr } = await db.from("cash_movements").insert({
        account_id: accountId, kind: "deposit", amount: total, currency, occurred_at: when,
        reference: sale.sale_number, notes: `POS sale ${sale.sale_number} (reconciled by Finance)`, created_by: context.userId,
      });
      if (cmErr) throw new Error(cmErr.message);

      if (sale.customer_id) {
        const issue = when.slice(0, 10);
        const { data: inv, error: invErr } = await db.from("invoices").insert({
          customer_id: sale.customer_id, account_number: sale.account_number,
          invoice_number: `INV-${String(sale.sale_number).replace(/^POS-/, "")}`,
          status: "draft", currency, subtotal: num(sale.subtotal) - num(sale.discount), tax: num(sale.tax), total,
          issue_date: issue, due_date: issue, notes: `Counter sale ${sale.sale_number}`, created_by: context.userId,
        }).select("id").single();
        if (invErr) throw new Error(invErr.message);
        invoiceId = inv.id;
        await db.from("invoice_line_items").insert((sale.pos_sale_items || []).map((l: any, i: number) => ({
          invoice_id: inv.id, description: l.sku ? `${l.name} (${l.sku})` : l.name,
          quantity: l.quantity, unit_price: l.unit_price, tax_rate: 0, position: i,
        })));
        const { data: pay, error: payErr } = await db.from("payments").insert({
          customer_id: sale.customer_id, account_number: sale.account_number, invoice_id: inv.id,
          amount: total, currency, method: sale.payment_method || "cash", status: "completed",
          paid_at: when, reference: sale.sale_number, service_context: "pos",
          notes: `Counter sale ${sale.sale_number}`, created_by: context.userId,
        }).select("id").single();
        if (payErr) throw new Error(payErr.message);
        paymentId = pay.id;
        await db.from("payment_allocations").insert({ payment_id: pay.id, invoice_id: inv.id, amount: total });
      }

      const [{ latestRateMap, toBase }, { postJournalEntry, cashAccountCode }] = await Promise.all([
        import("@/lib/currency.shared"), import("./ledger.server"),
      ]);
      const { data: rateRows } = await db.from("exchange_rates").select("currency, rate, effective_date").order("effective_date", { ascending: false }).limit(400);
      const rates = latestRateMap((rateRows ?? []) as any);
      const usd = Math.round(toBase(total, currency, rates) * 100) / 100;
      const usdTax = Math.round(toBase(num(sale.tax), currency, rates) * 100) / 100;
      const cost = (sale.pos_sale_items || []).reduce((t: number, l: any) => t + num(l.unit_cost) * num(l.quantity), 0);
      await postJournalEntry(db, {
        source_type: "pos_sale", source_id: sale.id, source_ref: sale.sale_number, entry_date: when.slice(0, 10),
        memo: `POS sale ${sale.sale_number} · ${acct.name}`, currency, fx_rate: rates[currency] ?? 1,
        customer_id: sale.customer_id ?? null,
        lines: [
          { account_code: cashAccountCode(acct.kind, sale.payment_method), debit: usd, credit: 0, description: `Banked into ${acct.name}` },
          { account_code: "4100", debit: 0, credit: usd - usdTax, description: "Hardware sales" },
          { account_code: "2200", debit: 0, credit: usdTax, description: "Tax collected" },
          { account_code: "5000", debit: cost, credit: 0, description: "Cost of goods sold" },
          { account_code: "1200", debit: 0, credit: cost, description: "Stock issued" },
        ],
      }, context.userId);
    }

    const { data: row, error: upErr } = await db.from("pos_sales").update({
      reconciliation_status: "reconciled", reconciled_at: new Date().toISOString(), reconciled_by: context.userId,
      reconciled_by_name: who, reconciliation_note: note, payment_id: paymentId, invoice_id: invoiceId, account_id: accountId,
    }).eq("id", sale.id).select("*").single();
    if (upErr) throw new Error(upErr.message);
    await db.from("audit_log").insert({
      actor_id: context.userId, action: "pos_sale_reconciled", entity_type: "pos_sales", entity_id: sale.id,
      account_number: sale.account_number, module: "pos",
      new_value: { mode: data.mode, payment_id: paymentId, account_id: accountId, total, note },
    });
    return row;
  });

/** Finance signs off a closed trading day and, if needed, posts the counted-cash variance. */
export const reviewPosCloseout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; account_id?: string | null; note?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertBilling(context as Ctx);
    const db = context.supabase as any;
    const { data: close, error } = await db.from("pos_closeouts").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    if (close.finance_reviewed_at) throw new Error("This day is already reviewed");
    const { count } = await db.from("pos_sales").select("id", { count: "exact", head: true })
      .eq("closeout_id", close.id).neq("status", "void").neq("reconciliation_status", "reconciled");
    if ((count ?? 0) > 0) throw new Error(`${count} sale(s) from this day still need reconciling`);
    const variance = num(close.variance);
    const accountId = data.account_id || close.account_id;
    if (Math.abs(variance) > 0.005) {
      if (!accountId) throw new Error("Choose the till to post the cash variance to");
      const { data: posted } = await db.from("cash_movements").select("id").eq("reference", `CLOSE-${close.business_date}`).maybeSingle();
      if (!posted) {
        await db.from("cash_movements").insert({
          account_id: accountId, kind: variance > 0 ? "deposit" : "withdrawal", amount: Math.abs(variance),
          currency: close.currency || "USD", occurred_at: new Date().toISOString(), reference: `CLOSE-${close.business_date}`,
          notes: `POS closeout variance for ${close.business_date}`, created_by: context.userId,
        });
      }
    }
    const { data: row, error: e } = await db.from("pos_closeouts").update({
      finance_reviewed_at: new Date().toISOString(), finance_reviewed_by: context.userId,
      finance_reviewed_by_name: await actorName(context as Ctx), finance_review_note: data.note?.trim() || null,
      account_id: accountId,
    }).eq("id", close.id).select("*").single();
    if (e) throw new Error(e.message);
    await db.from("audit_log").insert({ actor_id: context.userId, action: "pos_closeout_reviewed", entity_type: "pos_closeouts", entity_id: close.id, module: "pos", new_value: { variance, account_id: accountId } });
    return row;
  });
