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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Try invite; if user exists, look them up
    let userId: string | undefined;
    const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.full_name ?? null },
    });
    if (invite.data?.user) userId = invite.data.user.id;
    else {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      userId = users.users.find((u) => u.email === data.email)?.id;
    }
    if (!userId) throw new Error(invite.error?.message ?? "Could not resolve user");
    await supabaseAdmin.from("profiles").update({ customer_id: data.customer_id }).eq("id", userId);
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
    await supabaseAdmin.from("profiles").update({ customer_id: null }).eq("id", data.user_id);
    return { ok: true };
  });
