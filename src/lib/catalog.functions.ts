import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertAnyRole(ctx: Ctx, roles: string[]) {
  const { data, error } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const mine = new Set((data || []).map((r: any) => r.role));
  if (mine.has("master_admin")) return;
  if (!roles.some((r) => mine.has(r))) throw new Error("Forbidden: insufficient role");
}

export const listCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("service_catalog").select("*").order("category").order("name");
    if (error) throw new Error(error.message);
    return data || [];
  });

export const upsertCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    code: string; name: string; category: string; description?: string;
    unit_price: number; currency?: string; billing_cycle: string; is_active?: boolean;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertAnyRole(context, ["operations_manager", "finance"]);
    const payload = {
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      category: data.category.trim() || "general",
      description: data.description?.trim() || null,
      unit_price: Number(data.unit_price) || 0,
      currency: data.currency || "USD",
      billing_cycle: data.billing_cycle,
      is_active: data.is_active ?? true,
    };
    if (data.id) {
      const { error } = await context.supabase.from("service_catalog").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("service_catalog").insert({ ...payload, created_by: context.userId }).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const deleteCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAnyRole(context, ["operations_manager", "finance"]);
    const { error } = await context.supabase.from("service_catalog").update({ is_active: false }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCustomerServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("customer_services")
      .select("*, catalog:service_catalog(name,code,category)")
      .eq("customer_id", data.customer_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows || [];
  });

export const assignServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    items: { catalog_id: string; quantity: number; unit_price?: number; notes?: string }[];
  }) => input)
  .handler(async ({ data, context }) => {
    await assertAnyRole(context, ["operations_manager", "finance", "sales", "account_manager"]);
    if (!data.items?.length) return { ok: true, created: 0 };

    const { data: catalog, error: catErr } = await context.supabase
      .from("service_catalog").select("*").in("id", data.items.map((i) => i.catalog_id));
    if (catErr) throw new Error(catErr.message);
    const catMap = new Map((catalog || []).map((c: any) => [c.id, c]));

    let created = 0;
    for (const item of data.items) {
      const cat: any = catMap.get(item.catalog_id);
      if (!cat) continue;
      const unitPrice = item.unit_price ?? Number(cat.unit_price);
      const qty = Math.max(1, item.quantity || 1);

      // create subscription first
      const { data: sub, error: subErr } = await context.supabase.from("subscriptions").insert({
        customer_id: data.customer_id,
        plan_name: cat.name,
        description: cat.description || cat.code,
        amount: unitPrice * qty,
        currency: cat.currency,
        billing_cycle: cat.billing_cycle,
        status: "active",
        started_on: new Date().toISOString().slice(0, 10),
        auto_renew: true,
        notes: item.notes || null,
        created_by: context.userId,
      }).select("id").single();
      if (subErr) throw new Error(subErr.message);

      const { error: csErr } = await context.supabase.from("customer_services").insert({
        customer_id: data.customer_id,
        catalog_id: cat.id,
        quantity: qty,
        unit_price: unitPrice,
        currency: cat.currency,
        billing_cycle: cat.billing_cycle,
        status: "active",
        notes: item.notes || null,
        subscription_id: sub?.id ?? null,
        assigned_by: context.userId,
      });
      if (csErr) throw new Error(csErr.message);
      created++;
    }
    return { ok: true, created };
  });

export const removeCustomerService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAnyRole(context, ["operations_manager", "finance", "sales", "account_manager"]);
    const { data: row } = await context.supabase
      .from("customer_services").select("subscription_id").eq("id", data.id).maybeSingle();
    if (row?.subscription_id) {
      await context.supabase.from("subscriptions").update({ status: "cancelled" }).eq("id", row.subscription_id);
    }
    const { error } = await context.supabase.from("customer_services").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
