import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = [
  "master_admin","operations_manager","finance","sales","account_manager",
  "technical_support","cloud_engineer","cyber_security","noc","inventory",
  "procurement","customer_success","read_only","custom"
] as const;
export type AppRole = typeof ROLES[number];
export const ALL_ROLES = ROLES;

async function assertMaster(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId).eq("role","master_admin").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: master admin only");
}

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertMaster(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw new Error(error.message);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id,role");
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id,full_name,email,department,status");
    const roleMap = new Map<string, string[]>();
    (roles || []).forEach((r: any) => {
      if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, []);
      roleMap.get(r.user_id)!.push(r.role);
    });
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    return users.users.map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      banned_until: (u as any).banned_until ?? null,
      profile: profileMap.get(u.id) ?? null,
      roles: roleMap.get(u.id) ?? [],
    }));
  });

export const myRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data || []).map((r: any) => r.role as AppRole);
  });

export const assignRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; role: AppRole; action: "add" | "remove" }) => input)
  .handler(async ({ data, context }) => {
    await assertMaster(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.action === "add") {
      await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role, granted_by: context.userId });
    } else {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", data.role);
    }
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId, action: `role_${data.action}`, entity_type: "user", entity_id: data.user_id,
      new_value: { role: data.role },
    });
    return { ok: true };
  });

export const setUserActiveState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; active: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertMaster(context);
    if (data.user_id === context.userId && !data.active) throw new Error("You cannot deactivate your own master account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ status: data.active ? "active" : "inactive" }).eq("id", data.user_id);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: data.active ? "user_reactivated" : "user_deactivated",
      entity_type: "user",
      entity_id: data.user_id,
      new_value: { active: data.active },
    });
    return { ok: true };
  });

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; full_name?: string; initial_role?: AppRole }) => input)
  .handler(async ({ data, context }) => {
    await assertMaster(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.full_name ?? null },
    });
    if (error) throw new Error(error.message);
    if (data.initial_role && created.user) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", created.user.id).eq("role","read_only");
      await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: data.initial_role, granted_by: context.userId });
    }
    return { ok: true, user_id: created.user?.id };
  });

export const recentAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertMaster(context);
    const { data, error } = await context.supabase
      .from("audit_log").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return data;
  });
