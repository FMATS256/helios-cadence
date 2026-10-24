import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACCOUNT_WORKSPACE_ROLES, canRecoverPortal, ownPortfolioOnly, recoveryTargetAllowed } from "./account-workspace.shared";

async function workspaceRoles(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (error) throw new Error("Unable to verify account permissions");
  const roles: string[] = (data ?? []).map((r: any) => r.role);
  if (!roles.some((r) => ACCOUNT_WORKSPACE_ROLES.includes(r))) throw new Error("Account workspace access required");
  return roles;
}

export const getAccountWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id?: string }) => input)
  .handler(async ({ data, context }) => {
    const roles = await workspaceRoles(context);
    let query = context.supabase.from("customers").select("id,account_number,company_name,status,account_type,account_manager_id,primary_email,primary_phone").is("archived_at", null).order("company_name");
    // A single Customer 360 read preserves existing staff visibility. Portfolio defaults are owner-scoped.
    if (data.customer_id) query = query.eq("id", data.customer_id);
    else if (ownPortfolioOnly(roles)) query = query.eq("account_manager_id", context.userId);
    const { data: customers, error } = await query;
    if (error) throw new Error("Unable to load client accounts");
    const ids = (customers ?? []).map((c) => c.id);
    if (!ids.length) return { customers: [], users: [], tickets: [], renewals: [], canRecover: canRecoverPortal(roles), isMaster: roles.includes("master_admin") };
    const [tickets, renewals] = await Promise.all([
      context.supabase.from("tickets").select("id,ticket_number,customer_id,subject,status,priority,created_at").in("customer_id", ids).is("archived_at", null).not("status", "in", "(resolved,closed)").order("created_at", { ascending: false }),
      context.supabase.from("subscriptions").select("id,customer_id,plan_name,next_renewal,status,amount,currency").in("customer_id", ids).eq("status", "active").order("next_renewal"),
    ]);
    if (tickets.error || renewals.error) throw new Error("Unable to load account activity");
    // Only expose client identity metadata after explicit staff authorization; no credentials or sessions.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error: userError } = await supabaseAdmin.from("profiles").select("id,customer_id,full_name,email,status").in("customer_id", ids);
    if (userError) throw new Error("Unable to load portal access");
    return { customers: customers ?? [], users: users ?? [], tickets: tickets.data ?? [], renewals: renewals.data ?? [], canRecover: canRecoverPortal(roles), isMaster: roles.includes("master_admin") };
  });

export const sendClientPortalRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string; user_id: string; reason: string }) => {
    if (!input.reason?.trim() || input.reason.length > 500) throw new Error("Provide a support reason (up to 500 characters)");
    return input;
  })
  .handler(async ({ data, context }) => {
    const roles = await workspaceRoles(context);
    if (!canRecoverPortal(roles)) throw new Error("Only authorized support staff can send recovery links");
    const { data: customer, error } = await context.supabase.from("customers").select("id,account_number").eq("id", data.customer_id).is("archived_at", null).single();
    if (error || !customer) throw new Error("Client account unavailable");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profile, targetRoles] = await Promise.all([
      supabaseAdmin.from("profiles").select("customer_id,email").eq("id", data.user_id).single(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id),
    ]);
    if (profile.error || targetRoles.error || !profile.data?.email || !recoveryTargetAllowed(customer.id, profile.data, (targetRoles.data ?? []).map((r) => r.role))) throw new Error("Recovery is only available for this account's client-only portal users");
    const { getRequest } = await import("@tanstack/react-start/server");
    const origin = new URL(getRequest().url).origin;
    const { error: sendError } = await supabaseAdmin.auth.resetPasswordForEmail(profile.data.email, { redirectTo: `${origin}/reset-password` });
    if (sendError) throw new Error("Recovery email could not be sent. Please try later.");
    const { recordCustomerEvent } = await import("./customer-events.server");
    await recordCustomerEvent(supabaseAdmin, { customer_id: customer.id, account_number: customer.account_number, event_type: "portal_recovery_sent", title: "Portal recovery email requested", description: data.reason.trim(), module: "support", entity_type: "profiles", entity_id: data.user_id, actor_id: context.userId, actor_email: context.claims.email ?? null });
    return { ok: true };
  });