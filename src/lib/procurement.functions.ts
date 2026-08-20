// Procurement, vendor management and multi-currency server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { latestRateMap, toBase } from "./currency.shared";

type Ctx = { supabase: any; userId: string };

async function assertProcurement(ctx: Ctx) {
  const { data, error } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const mine = new Set((data || []).map((r: any) => r.role));
  if (mine.has("master_admin")) return;
  if (!["procurement", "finance", "operations_manager", "inventory"].some((r) => mine.has(r))) {
    throw new Error("Forbidden: procurement, inventory or finance role required");
  }
}

/* ---------------- Currency ---------------- */

export const listExchangeRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("exchange_rates").select("*")
      .order("currency").order("effective_date", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data || [];
    return { rates: rows, latest: latestRateMap(rows) };
  });

export const upsertExchangeRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { currency: string; rate: number; effective_date?: string; source?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertProcurement(context as Ctx);
    const currency = data.currency.trim().toUpperCase();
    if (currency.length < 3) throw new Error("Currency code must be 3 letters");
    if (!(Number(data.rate) > 0)) throw new Error("Rate must be greater than zero");
    const { data: row, error } = await context.supabase
      .from("exchange_rates")
      .upsert({
        base_currency: "USD",
        currency,
        rate: Number(data.rate),
        effective_date: data.effective_date || new Date().toISOString().slice(0, 10),
        source: data.source || "manual",
        created_by: context.userId,
      }, { onConflict: "base_currency,currency,effective_date" })
      .select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteExchangeRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertProcurement(context as Ctx);
    const { error } = await context.supabase.from("exchange_rates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Workspace aggregator ---------------- */

export const getProcurementWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [vendorsR, posR, itemsR, ratesR, expR] = await Promise.all([
      context.supabase.from("vendors").select("*").order("name"),
      context.supabase
        .from("purchase_orders")
        .select("*, vendors(id,name,currency), customers(id,company_name,account_number)")
        .order("order_date", { ascending: false }).limit(500),
      context.supabase.from("purchase_order_items").select("*").limit(3000),
      context.supabase.from("exchange_rates").select("*"),
      context.supabase.from("expenses").select("id, vendor_id, amount, currency, status, expense_date").limit(2000),
    ]);
    if (vendorsR.error) throw new Error(vendorsR.error.message);
    if (posR.error) throw new Error(posR.error.message);

    const vendors: any[] = vendorsR.data ?? [];
    const orders: any[] = posR.data ?? [];
    const items: any[] = itemsR.data ?? [];
    const rates = latestRateMap(ratesR.data ?? []);
    const expenses: any[] = expR.data ?? [];

    const itemsByPo: Record<string, any[]> = {};
    for (const it of items) (itemsByPo[it.po_id] ||= []).push(it);

    const spendByVendor: Record<string, number> = {};
    for (const o of orders) {
      const base = toBase(Number(o.total || 0), o.currency, rates);
      o.items = itemsByPo[o.id] ?? [];
      o.total_base = base;
      if (o.vendor_id && o.status !== "cancelled") spendByVendor[o.vendor_id] = (spendByVendor[o.vendor_id] ?? 0) + base;
    }
    for (const e of expenses) {
      if (e.vendor_id) spendByVendor[e.vendor_id] = (spendByVendor[e.vendor_id] ?? 0) + toBase(Number(e.amount || 0), e.currency, rates);
    }

    const enrichedVendors = vendors.map((v) => ({
      ...v,
      spend_base: spendByVendor[v.id] ?? 0,
      open_orders: orders.filter((o) => o.vendor_id === v.id && !["received", "cancelled"].includes(o.status)).length,
    }));

    const open = orders.filter((o) => !["received", "cancelled"].includes(o.status));
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    return {
      vendors: enrichedVendors,
      orders,
      rates,
      rateRows: ratesR.data ?? [],
      stats: {
        vendorCount: vendors.length,
        activeVendors: vendors.filter((v) => v.status === "active").length,
        openOrders: open.length,
        openValue: open.reduce((s, o) => s + o.total_base, 0),
        awaitingApproval: orders.filter((o) => o.status === "submitted").length,
        monthSpend: orders.filter((o) => o.order_date >= monthStart && o.status !== "cancelled")
          .reduce((s, o) => s + o.total_base, 0),
        overdueDeliveries: open.filter((o) => o.expected_date && new Date(o.expected_date).getTime() < now).length,
        currencies: Object.keys(rates).length,
      },
    };
  });

/* ---------------- Vendors ---------------- */

export const upsertVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string; name: string; code?: string; category?: string; contact_name?: string;
    email?: string; phone?: string; website?: string; address?: string; country?: string;
    currency?: string; payment_terms?: string; tax_number?: string; status?: string;
    rating?: number; notes?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertProcurement(context as Ctx);
    if (!data.name?.trim()) throw new Error("Vendor name is required");
    const payload: any = {
      name: data.name.trim(),
      code: data.code?.trim().toUpperCase() || null,
      category: data.category?.trim() || "general",
      contact_name: data.contact_name?.trim() || null,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      website: data.website?.trim() || null,
      address: data.address?.trim() || null,
      country: data.country?.trim() || null,
      currency: (data.currency || "USD").toUpperCase(),
      payment_terms: data.payment_terms || "net_30",
      tax_number: data.tax_number?.trim() || null,
      status: data.status || "active",
      rating: Math.min(5, Math.max(1, Number(data.rating) || 3)),
      notes: data.notes?.trim() || null,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase.from("vendors").update(payload).eq("id", data.id).select("*").single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("vendors").insert({ ...payload, created_by: context.userId }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertProcurement(context as Ctx);
    const { error } = await context.supabase.from("vendors").update({ status: "inactive" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Purchase orders ---------------- */

type POItem = { id?: string; description: string; quantity: number; unit_price: number; inventory_item_id?: string | null };

export const savePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string; vendor_id?: string | null; customer_id?: string | null; status?: string;
    order_date?: string; expected_date?: string | null; currency?: string; fx_rate?: number;
    tax?: number; notes?: string; items: POItem[];
  }) => d)
  .handler(async ({ data, context }) => {
    await assertProcurement(context as Ctx);
    const items = (data.items || []).filter((i) => i.description?.trim());
    if (!items.length) throw new Error("Add at least one line item");

    const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
    const tax = Number(data.tax) || 0;
    const currency = (data.currency || "USD").toUpperCase();

    let fx = Number(data.fx_rate) || 0;
    if (!fx) {
      const { data: rateRows } = await context.supabase
        .from("exchange_rates").select("currency, rate, effective_date").eq("currency", currency);
      fx = latestRateMap(rateRows || [])[currency] ?? 1;
    }

    const payload: any = {
      vendor_id: data.vendor_id || null,
      customer_id: data.customer_id || null,
      status: data.status || "draft",
      order_date: data.order_date || new Date().toISOString().slice(0, 10),
      expected_date: data.expected_date || null,
      currency,
      fx_rate: fx,
      subtotal,
      tax,
      total: subtotal + tax,
      notes: data.notes?.trim() || null,
    };

    let poId = data.id;
    if (poId) {
      const { error } = await context.supabase.from("purchase_orders").update(payload).eq("id", poId);
      if (error) throw new Error(error.message);
      await context.supabase.from("purchase_order_items").delete().eq("po_id", poId);
    } else {
      const { data: row, error } = await context.supabase
        .from("purchase_orders").insert({ ...payload, created_by: context.userId }).select("id").single();
      if (error) throw new Error(error.message);
      poId = row.id;
    }

    const { error: itemErr } = await context.supabase.from("purchase_order_items").insert(
      items.map((i) => ({
        po_id: poId,
        description: i.description.trim(),
        quantity: Number(i.quantity) || 1,
        unit_price: Number(i.unit_price) || 0,
        inventory_item_id: i.inventory_item_id || null,
      })),
    );
    if (itemErr) throw new Error(itemErr.message);

    return { ok: true, id: poId };
  });

export const setPurchaseOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: string }) => d)
  .handler(async ({ data, context }) => {
    await assertProcurement(context as Ctx);
    const allowed = ["draft", "submitted", "approved", "ordered", "partially_received", "received", "cancelled"];
    if (!allowed.includes(data.status)) throw new Error("Invalid status");
    const patch: any = { status: data.status };
    if (data.status === "approved") patch.approved_by = context.userId;
    if (data.status === "received") patch.received_date = new Date().toISOString().slice(0, 10);
    const { error } = await context.supabase.from("purchase_orders").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const receivePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertProcurement(context as Ctx);
    const { data: items, error } = await context.supabase
      .from("purchase_order_items").select("*").eq("po_id", data.id);
    if (error) throw new Error(error.message);

    let stocked = 0;
    for (const it of items || []) {
      await context.supabase.from("purchase_order_items").update({ received_qty: it.quantity }).eq("id", it.id);
      if (it.inventory_item_id) {
        const { data: inv } = await context.supabase
          .from("inventory_items").select("id, quantity").eq("id", it.inventory_item_id).maybeSingle();
        if (inv) {
          await context.supabase.from("inventory_items")
            .update({ quantity: Number(inv.quantity || 0) + Number(it.quantity || 0) })
            .eq("id", inv.id);
          stocked++;
        }
      }
    }
    await context.supabase.from("purchase_orders")
      .update({ status: "received", received_date: new Date().toISOString().slice(0, 10) })
      .eq("id", data.id);
    return { ok: true, stocked };
  });

export const deletePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertProcurement(context as Ctx);
    const { error } = await context.supabase.from("purchase_orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
