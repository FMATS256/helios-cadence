import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  asset_id: z.string().uuid(),
  amount: z.number().finite().positive().max(1_000_000),
  currency: z.enum(["USD", "ZWG", "ZAR"]).default("USD"),
  billing_cycle: z.enum(["monthly", "quarterly", "annual"]),
  start_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

/**
 * Turns an installed system's maintenance contract into a subscription so it
 * flows through the existing Finance recurring billing run, Customer 360 and
 * the client portal. Finance still runs/approves billing (separation of duties).
 */
export const createMaintenanceContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => schema.parse(v))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: asset } = await db.from("assets").select("id,customer_id,account_number,asset_type,make,model,site_name,subscription_id").eq("id", data.asset_id).maybeSingle();
    if (!asset) throw new Error("Equipment not found");
    if (!asset.customer_id) throw new Error("Assign the equipment to a client before adding a maintenance contract");
    if (asset.subscription_id) return { subscription_id: asset.subscription_id, existing: true };
    const label = [asset.make, asset.model].filter(Boolean).join(" ") || asset.asset_type;
    const { data: sub, error } = await db.from("subscriptions").insert({
      customer_id: asset.customer_id, account_number: asset.account_number,
      plan_name: `${asset.asset_type} maintenance`,
      description: `${label}${asset.site_name ? ` · ${asset.site_name}` : ""}`,
      amount: data.amount, currency: data.currency, billing_cycle: data.billing_cycle,
      status: "active", started_on: data.start_on, next_renewal: data.start_on, auto_renew: true,
      notes: `maintenance-contract asset:${asset.id}`, created_by: context.userId,
    } as any).select("id").single();
    if (error || !sub) throw new Error("Maintenance contract could not be saved");
    const { error: linkErr } = await db.from("assets").update({ subscription_id: sub.id } as any).eq("id", asset.id);
    if (linkErr) throw new Error("Contract saved but could not be linked to the equipment");
    return { subscription_id: sub.id, existing: false };
  });
