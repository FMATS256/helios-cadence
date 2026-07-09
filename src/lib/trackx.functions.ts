import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TRACKX_URL = "https://dztnkdwwergbgrjisapr.supabase.co/functions/v1/admin-api";

async function assertStaff(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const roles = (data || []).map((r: any) => r.role);
  const allowed = ["master_admin", "operations_manager", "sales", "finance", "account_manager", "customer_success"];
  if (!roles.some((r: string) => allowed.includes(r))) {
    throw new Error("Forbidden: staff role required");
  }
}

async function trackx(action: string, params: Record<string, any> = {}) {
  const secret = process.env.IMT_ADMIN_SECRET;
  if (!secret) throw new Error("IMT_ADMIN_SECRET not configured");
  const res = await fetch(TRACKX_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": secret },
    body: JSON.stringify({ action, ...params }),
  });
  const text = await res.text();
  let body: any;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    throw new Error(body?.error || body?.message || `Trackx ${action} failed (${res.status})`);
  }
  return body;
}

export const trackxCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { action: string; params?: Record<string, any> }) => d)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    return trackx(data.action, data.params ?? {});
  });
