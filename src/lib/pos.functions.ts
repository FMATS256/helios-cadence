// Mini POS — over-the-counter sales of hardware, routers, switches and stock.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertStaff(ctx: Ctx) {
  const { data, error } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const mine = new Set((data || []).map((r: any) => r.role));
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

/** Everything the POS screen needs: sellable stock, recent sales, tills, customers, KPIs. */
export const getPosWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as Ctx);
    const db = context.supabase as any;
    const [itemsR, salesR, accountsR, customersR] = await Promise.all([
      db.from("inventory_items").select("*").is("archived_at", null).order("name"),
      db.from("pos_sales").select("*, pos_sale_items(*)").order("created_at", { ascending: false }).limit(200),
      db.from("cash_accounts").select("id, name, kind, currency, is_default").order("is_default", { ascending: false }).order("name"),
      db.from("customers").select("id, company_name, account_number").order("company_name").limit(1000),
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
      items,
      sales,
      accounts: accountsR.data ?? [],
      customers: customersR.data ?? [],
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

    // Bank the money in the selected till / account
    if (data.account_id) {
      await db.from("cash_movements").insert({
        account_id: data.account_id,
        kind: "deposit",
        amount: total,
        currency: data.currency || "USD",
        occurred_at: now.toISOString(),
        reference: saleNumber,
        notes: `POS sale ${saleNumber}`,
        created_by: context.userId,
      });
    }

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

    return { ...sale, pos_sale_items: itemRows };
  });

/** Void a sale — returns stock to the shelf and reverses the till deposit. */
export const voidPosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const db = context.supabase as any;
    const { data: sale, error } = await db.from("pos_sales").select("*, pos_sale_items(*)").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    if (sale.status === "void") throw new Error("Sale is already voided");

    for (const l of sale.pos_sale_items || []) {
      if (!l.item_id) continue;
      const { data: item } = await db.from("inventory_items").select("quantity").eq("id", l.item_id).maybeSingle();
      if (item) await db.from("inventory_items").update({ quantity: num(item.quantity) + num(l.quantity) }).eq("id", l.item_id);
    }

    if (sale.account_id) {
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
