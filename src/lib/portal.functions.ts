// Customer Cloud Portal server functions.
// All state-changing calls run under requireSupabaseAuth. Workspace access is verified
// via has_workspace_role() which also returns true for IMT staff (any role).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProviderName, PowerAction } from "./providers/types";

type Role = "owner" | "admin" | "developer" | "viewer";
const RANK: Record<Role, number> = { viewer: 1, developer: 2, admin: 3, owner: 4 };

async function assertAccess(
  ctx: { supabase: any; userId: string },
  workspaceId: string,
  min: Role = "viewer",
): Promise<{ isStaff: boolean; role: Role | null }> {
  const { data, error } = await ctx.supabase.rpc("has_workspace_role", {
    _user: ctx.userId,
    _workspace: workspaceId,
    _min: min,
  });
  if (error || !data) throw new Error("Forbidden: no access to this workspace");
  const { data: mem } = await ctx.supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const { data: isStaff } = await ctx.supabase.rpc("has_any_role", { _user_id: ctx.userId });
  return { isStaff: !!isStaff, role: (mem?.role as Role) ?? null };
}

async function audit(
  ctx: any,
  workspaceId: string,
  action: string,
  resource_kind?: string,
  resource_id?: string,
  detail: Record<string, unknown> = {},
) {
  const { data: isStaff } = await ctx.supabase.rpc("has_any_role", { _user_id: ctx.userId });
  await ctx.supabase.from("workspace_audit_log").insert({
    workspace_id: workspaceId,
    actor_user_id: ctx.userId,
    actor_kind: isStaff ? "staff_override" : "customer",
    action,
    resource_kind: resource_kind ?? null,
    resource_id: resource_id ?? null,
    detail,
  });
}

// -------------------- Workspace context --------------------
export const getWorkspaceContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { slug: string; workspaceKey: string }) => v)
  .handler(async ({ data, context }) => {
    const { data: ws, error } = await context.supabase
      .from("cloud_workspaces")
      .select("*, customers(id, account_number, company_name, primary_email)")
      .eq("slug", data.slug)
      .eq("workspace_key", data.workspaceKey)
      .maybeSingle();
    if (error) throw error;
    if (!ws) throw new Error("Workspace not found");
    const access = await assertAccess(context, ws.id, "viewer");
    return { workspace: ws, myRole: access.role, isStaff: access.isStaff };
  });

export const listMyWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: memberships } = await context.supabase
      .from("workspace_members")
      .select("workspace_id, role, cloud_workspaces(*, customers(company_name, account_number))")
      .eq("user_id", context.userId);
    return memberships ?? [];
  });

// -------------------- Servers --------------------
export const listWorkspaceServers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { workspaceId: string }) => v)
  .handler(async ({ data, context }) => {
    await assertAccess(context, data.workspaceId);
    const { data: links, error } = await context.supabase
      .from("workspace_servers")
      .select("id, display_name, customer_notes, cloud_servers(*)")
      .eq("workspace_id", data.workspaceId);
    if (error) throw error;
    // Abstract provider from response.
    return (links ?? []).map((l: any) => ({
      link_id: l.id,
      display_name: l.display_name ?? l.cloud_servers?.name,
      customer_notes: l.customer_notes,
      server: l.cloud_servers ? sanitizeServer(l.cloud_servers) : null,
    }));
  });

export const getWorkspaceServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { workspaceId: string; serverId: string }) => v)
  .handler(async ({ data, context }) => {
    await assertAccess(context, data.workspaceId);
    const { data: link, error } = await context.supabase
      .from("workspace_servers")
      .select("id, display_name, customer_notes, cloud_servers(*)")
      .eq("workspace_id", data.workspaceId)
      .eq("server_id", data.serverId)
      .maybeSingle();
    if (error) throw error;
    if (!link || !link.cloud_servers) throw new Error("Server not found in this workspace");
    return {
      link_id: link.id,
      display_name: link.display_name ?? link.cloud_servers.name,
      customer_notes: link.customer_notes,
      server: sanitizeServer(link.cloud_servers),
    };
  });

function sanitizeServer(row: any) {
  // Never leak provider identity or provider_server_id to customers.
  const {
    provider: _p,
    provider_server_id: _pid,
    ...rest
  } = row;
  return { ...rest, infrastructure: "IMT Cloud" };
}

// -------------------- Power actions --------------------
export const workspaceServerPower = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { workspaceId: string; serverId: string; action: PowerAction }) => v)
  .handler(async ({ data, context }) => {
    await assertAccess(context, data.workspaceId, "developer");
    const { data: link } = await context.supabase
      .from("workspace_servers")
      .select("cloud_servers(id, provider, provider_server_id)")
      .eq("workspace_id", data.workspaceId)
      .eq("server_id", data.serverId)
      .maybeSingle();
    const srv: any = link?.cloud_servers;
    if (!srv) throw new Error("Server not found");
    const { getProvider } = await import("@/lib/providers/registry.server");
    await getProvider(srv.provider as ProviderName).powerAction(srv.provider_server_id, data.action);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nextState = data.action === "off" ? "off" : data.action === "on" ? "on" : "on";
    await supabaseAdmin
      .from("cloud_servers")
      .update({ power_state: nextState, updated_at: new Date().toISOString() })
      .eq("id", srv.id);
    await audit(context, data.workspaceId, `server_${data.action}`, "server", data.serverId, {});
    return { ok: true, power_state: nextState };
  });

// -------------------- Reset root password --------------------
export const workspaceResetRootPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { workspaceId: string; serverId: string }) => v)
  .handler(async ({ data, context }) => {
    await assertAccess(context, data.workspaceId, "admin");
    const { data: link } = await context.supabase
      .from("workspace_servers")
      .select("cloud_servers(id, name, customer_id)")
      .eq("workspace_id", data.workspaceId)
      .eq("server_id", data.serverId)
      .maybeSingle();
    const srv: any = link?.cloud_servers;
    if (!srv) throw new Error("Server not found");
    // Generate a 20-char password.
    const pass = Array.from(crypto.getRandomValues(new Uint8Array(20)))
      .map((b) => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%".charAt(b % 60))
      .join("");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptSecret } = await import("@/lib/encryption.server").catch(() => ({ encryptSecret: (s: string) => s })) as any;
    await supabaseAdmin.from("credentials").insert({
      customer_id: srv.customer_id,
      name: `Root — ${srv.name}`,
      kind: "server",
      username: "root",
      secret_ciphertext: encryptSecret(pass),
      notes: "Auto-rotated via Cloud Portal",
    } as any);
    await audit(context, data.workspaceId, "server_reset_password", "server", data.serverId);
    // One-time reveal to caller only.
    return { password: pass };
  });

// -------------------- Members --------------------
export const listWorkspaceMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { workspaceId: string }) => v)
  .handler(async ({ data, context }) => {
    await assertAccess(context, data.workspaceId);
    const { data: members } = await context.supabase
      .from("workspace_members")
      .select("id, role, invited_at, accepted_at, user_id, profiles!inner(id, email, full_name)")
      .eq("workspace_id", data.workspaceId)
      .order("invited_at", { ascending: true });
    return members ?? [];
  });

export const inviteWorkspaceMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { workspaceId: string; email: string; role: Role }) => v)
  .handler(async ({ data, context }) => {
    await assertAccess(context, data.workspaceId, "admin");
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { error } = await context.supabase.from("workspace_invitations").insert({
      workspace_id: data.workspaceId,
      email: data.email.toLowerCase(),
      role: data.role,
      token,
      invited_by: context.userId,
    });
    if (error) throw error;
    await audit(context, data.workspaceId, "member_invited", "member", data.email, { role: data.role });
    return { ok: true, token };
  });

export const removeWorkspaceMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { workspaceId: string; memberId: string }) => v)
  .handler(async ({ data, context }) => {
    await assertAccess(context, data.workspaceId, "admin");
    const { error } = await context.supabase
      .from("workspace_members")
      .delete()
      .eq("id", data.memberId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw error;
    await audit(context, data.workspaceId, "member_removed", "member", data.memberId);
    return { ok: true };
  });

export const updateWorkspaceMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { workspaceId: string; memberId: string; role: Role }) => v)
  .handler(async ({ data, context }) => {
    await assertAccess(context, data.workspaceId, "admin");
    const { error } = await context.supabase
      .from("workspace_members")
      .update({ role: data.role })
      .eq("id", data.memberId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw error;
    await audit(context, data.workspaceId, "member_role_changed", "member", data.memberId, { role: data.role });
    return { ok: true };
  });

// -------------------- Audit log --------------------
export const listWorkspaceAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { workspaceId: string; limit?: number }) => v)
  .handler(async ({ data, context }) => {
    await assertAccess(context, data.workspaceId, "viewer");
    const { data: rows } = await context.supabase
      .from("workspace_audit_log")
      .select("id, workspace_id, actor_user_id, actor_kind, action, resource_kind, resource_id, detail, user_agent, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    return (rows ?? []) as Array<Record<string, any>>;
  });

// -------------------- Billing / support scoped views --------------------
export const workspaceInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { workspaceId: string }) => v)
  .handler(async ({ data, context }) => {
    await assertAccess(context, data.workspaceId);
    const { data: ws } = await context.supabase
      .from("cloud_workspaces").select("customer_id").eq("id", data.workspaceId).single();
    if (!ws) throw new Error("Workspace not found");
    const { data: rows } = await context.supabase
      .from("invoices").select("*").eq("customer_id", ws.customer_id).order("issued_on", { ascending: false });
    return (rows ?? []) as Array<Record<string, any>>;
  });

export const workspaceTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { workspaceId: string }) => v)
  .handler(async ({ data, context }) => {
    await assertAccess(context, data.workspaceId);
    const { data: ws } = await context.supabase
      .from("cloud_workspaces").select("customer_id").eq("id", data.workspaceId).single();
    const { data: rows } = await context.supabase
      .from("tickets").select("*").eq("customer_id", ws.customer_id).order("created_at", { ascending: false });
    return rows ?? [];
  });

// -------------------- Staff: workspace management --------------------
export const staffListWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isStaff } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!isStaff) throw new Error("Forbidden");
    const { data } = await context.supabase
      .from("cloud_workspaces")
      .select("*, customers(company_name, account_number), workspace_servers(count), workspace_members(count)")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const staffEnsureWorkspaceForCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { customerId: string }) => v)
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!isStaff) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return ensureWorkspace(supabaseAdmin, data.customerId);
  });
