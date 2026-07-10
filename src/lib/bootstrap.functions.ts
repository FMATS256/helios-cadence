[email protected]mport { createServerFn } from "@tanstack/react-start";

[email protected]onst MASTER_EMAIL = "[email protected]";
[email protected]onst MASTER_PASSWORD = "ImtMaster!2026";
[email protected]onst MASTER_NAME = "Master Administrator";

/**
[email protected]* Ensures the hardcoded Master Administrator account exists.
[email protected]* Idempotent — safe to call on every auth page load.
[email protected]* Returns the fixed credentials so the login card can show them.
[email protected]*/
[email protected]xport const ensureMasterAdmin = createServerFn({ method: "POST" }).handler(async () => {
[email protected] const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

[email protected] // Look up existing user by email
[email protected] const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
[email protected]   page: 1,
[email protected]   perPage: 200,
[email protected] });
[email protected] if (listErr) throw new Error(listErr.message);

[email protected] let user = list.users.find((u) => u.email?.toLowerCase() === MASTER_EMAIL);

[email protected] if (!user) {
[email protected]   const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
[email protected]     email: MASTER_EMAIL,
[email protected]     password: MASTER_PASSWORD,
[email protected]     email_confirm: true,
[email protected]     user_metadata: { full_name: MASTER_NAME },
[email protected]   });
[email protected]   if (createErr) throw new Error(createErr.message);
[email protected]   user = created.user!;
[email protected] } else {
[email protected]   // Keep the password aligned with the hardcoded value so support can always sign in.
[email protected]   await supabaseAdmin.auth.admin.updateUserById(user.id, {
[email protected]     password: MASTER_PASSWORD,
[email protected]     email_confirm: true,
[email protected]     user_metadata: { full_name: MASTER_NAME },
[email protected]   });
[email protected] }

[email protected] // Ensure profile row
[email protected] await supabaseAdmin.from("profiles").upsert(
[email protected]   { id: user!.id, email: MASTER_EMAIL, full_name: MASTER_NAME },
[email protected]   { onConflict: "id" },
[email protected] );

[email protected] // Ensure master_admin role
[email protected] await supabaseAdmin
[email protected]   .from("user_roles")
[email protected]   .upsert({ user_id: user!.id, role: "master_admin" as const }, { onConflict: "user_id,role" });

[email protected] return { email: MASTER_EMAIL, password: MASTER_PASSWORD };
});
