import { createServerFn } from "@tanstack/react-start";

const MASTER_NAME = "Master Administrator";

export const ensureMasterAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const masterEmail = process.env.IMT_MASTER_ADMIN_EMAIL;
  const masterPassword = process.env.IMT_MASTER_ADMIN_PASSWORD;

  if (!masterEmail || !masterPassword) {
    throw new Error("Master administrator credentials are not configured");
  }

  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw new Error(listErr.message);

  let user = list.users.find((u) => u.email?.toLowerCase() === masterEmail.toLowerCase());

  if (!user) {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: masterEmail,
      password: masterPassword,
      email_confirm: true,
      user_metadata: { full_name: MASTER_NAME },
    });
    if (createErr) throw new Error(createErr.message);
    user = created.user!;
  } else {
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: masterPassword,
      email_confirm: true,
      user_metadata: { full_name: MASTER_NAME },
    });
  }

  await supabaseAdmin.from("profiles").upsert(
    { id: user!.id, email: masterEmail, full_name: MASTER_NAME },
    { onConflict: "id" },
  );

  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: user!.id, role: "master_admin" as const }, { onConflict: "user_id,role" });

  return { email: masterEmail, ready: true };
});
