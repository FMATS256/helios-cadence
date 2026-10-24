import { temporaryPassword, usernameBase } from "./portal-login.shared";

/**
 * Creates a client-only portal login for a new account's primary email.
 * Returns credentials to include in the welcome email, or null when a login already exists.
 */
export async function provisionPortalLogin(db: any, customer: { id: string; company_name: string; account_number: string; primary_email: string | null }) {
  const email = customer.primary_email?.trim().toLowerCase();
  if (!email) return null;
  const { data: existing } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (existing) return null; // never reset or reuse someone's existing (possibly staff) login
  const base = usernameBase(customer.company_name, customer.account_number);
  let username = base;
  for (let i = 0; i < 20; i++) {
    const { data: taken } = await db.from("profiles").select("id").ilike("username", username).maybeSingle();
    if (!taken) break;
    username = `${base}${i + 2}`;
  }
  const password = temporaryPassword();
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: customer.company_name } });
  if (error || !created?.user) throw new Error(error?.message ?? "Portal login could not be created");
  const id = created.user.id;
  // New sign-ins default to a staff read-only role; client logins must hold no staff roles.
  const { error: roleError } = await db.from("user_roles").delete().eq("user_id", id);
  const { error: linkError } = await db.from("profiles").update({ customer_id: customer.id, username }).eq("id", id);
  if (roleError || linkError) {
    await db.auth.admin.deleteUser(id);
    throw new Error("Portal login could not be linked");
  }
  return { username, password, email };
}
