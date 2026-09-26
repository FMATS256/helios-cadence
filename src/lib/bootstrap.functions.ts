import { createServerFn } from "@tanstack/react-start";

const MASTER_NAME = "Farai Matare";

export const ensureMasterAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const masterEmail = process.env.IMT_MASTER_ADMIN_EMAIL;
  const masterPassword = process.env.IMT_MASTER_ADMIN_PASSWORD;

  if (!masterEmail || !masterPassword) {
    throw new Error("Master administrator credentials are not configured");
  }

  const normalizedMasterEmail = masterEmail.toLowerCase();
  const findMasterUser = async () => {
    for (let page = 1; page <= 20; page += 1) {
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (listErr) throw new Error(listErr.message);

      const found = list.users.find((u) => u.email?.toLowerCase() === normalizedMasterEmail);
      if (found || list.users.length < 200) return found ?? null;
    }

    return null;
  };

  let user = await findMasterUser();

  if (!user) {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: masterEmail,
      password: masterPassword,
      email_confirm: true,
      user_metadata: { full_name: MASTER_NAME },
    });

    if (createErr) {
      user = await findMasterUser();
      if (!user) throw new Error(createErr.message);
    } else {
      user = created.user!;
    }
  } else {
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: masterPassword,
      email_confirm: true,
      user_metadata: { full_name: MASTER_NAME },
    });
    if (updateErr) throw new Error(updateErr.message);
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
