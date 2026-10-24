import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertMaster(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId).eq("role", "master_admin").maybeSingle();
  if (!data) throw new Error("Forbidden");
}

// Invite a customer contact as a portal user, or link an existing user
export const invitePortalUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { email: string; customer_id: string; full_name?: string }) => i)
  .handler(async ({ data, context }) => {
    await assertMaster(context);
    data.email = data.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Error("Enter a valid client email");
    const { data: customer, error: customerError } = await context.supabase.from("customers").select("id").eq("id", data.customer_id).is("archived_at", null).single();
    if (customerError || !customer) throw new Error("Customer unavailable");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    // Check existing identity before invitation; never silently repurpose staff or another client's login.
    const { data: existingProfiles, error: lookupError } = await supabaseAdmin.from("profiles").select("id,customer_id").ilike("email", data.email);
    if (lookupError) throw new Error("Unable to check existing access");
    const existing = existingProfiles?.[0];
    if (existing) {
      const { data: roles, error: rolesError } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", existing.id);
      if (rolesError || roles?.length) throw new Error("Staff logins cannot be linked as client-only portal users");
      if (existing.customer_id && existing.customer_id !== data.customer_id) throw new Error("Login is already linked to another client");
      const { error: linkError } = await supabaseAdmin.from("profiles").update({ customer_id: data.customer_id }).eq("id", existing.id);
      if (linkError) throw new Error("Unable to link portal access");
      return { ok: true, user_id: existing.id };
    }
    // Try invite; if user exists, look them up
    let userId: string | undefined;
    const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.full_name ?? null },
      redirectTo: `${new URL(getRequest().url).origin}/client`,
    });
    if (invite.data?.user) userId = invite.data.user.id;
    // Existing users were resolved above; never adopt an identity after an ambiguous invitation failure.
    if (!userId) throw new Error(invite.error?.message ?? "Could not resolve user");
    const { data: targetRoles, error: roleError } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    if (roleError || targetRoles?.some((r) => r.role !== "read_only")) throw new Error("Staff logins cannot be linked as client portal users");
    const { data: targetProfile } = await supabaseAdmin.from("profiles").select("customer_id").eq("id", userId).single();
    if (targetProfile?.customer_id && targetProfile.customer_id !== data.customer_id) throw new Error("Login is already linked to another client");
    const { error: linkError } = await supabaseAdmin.from("profiles").update({ customer_id: data.customer_id }).eq("id", userId);
    if (linkError) throw new Error("Unable to link portal access");
    // Remove default staff role so they're strictly portal
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "read_only");
    return { ok: true, user_id: userId };
  });

export const listPortalUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertMaster(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, customer_id, customers:customer_id(account_number, company_name)")
      .not("customer_id", "is", null);
    return data ?? [];
  });

export const unlinkPortalUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { user_id: string }) => i)
  .handler(async ({ data, context }) => {
    await assertMaster(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ customer_id: null }).eq("id", data.user_id);
    if (error) throw new Error("Unable to revoke portal access");
    return { ok: true };
  });
