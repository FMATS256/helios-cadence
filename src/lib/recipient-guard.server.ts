// Server-only recipient guards: outbound mail from staff tools may only reach
// the caller themselves or addresses already on a customer's record.

const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Addresses that belong to the signed-in staff member (login + business email). */
export async function callerAddresses(userId: string, claims?: { email?: string } | null): Promise<Set<string>> {
  const db = await admin();
  const { data } = await db.from("profiles").select("email, work_email").eq("id", userId).maybeSingle();
  return new Set([norm(claims?.email), norm((data as any)?.email), norm((data as any)?.work_email)].filter(Boolean));
}

/** Test emails may only go to the caller's own addresses. */
export async function assertOwnAddress(context: { userId: string; claims?: any }, to: string) {
  const own = await callerAddresses(context.userId, context.claims);
  if (!own.has(norm(to))) throw new Error("Test emails can only be sent to your own email address.");
}

/** Addresses on file for a customer (primary email + active contacts). */
export async function customerAddresses(customerId: string): Promise<Set<string>> {
  const db = await admin();
  const [{ data: c }, { data: contacts }] = await Promise.all([
    db.from("customers").select("primary_email").eq("id", customerId).maybeSingle(),
    db.from("customer_contacts").select("email").eq("customer_id", customerId).is("archived_at", null),
  ]);
  return new Set([norm((c as any)?.primary_email), ...((contacts ?? []) as any[]).map((r) => norm(r.email))].filter(Boolean));
}

/** Customer mail may only reach addresses on that customer's record. */
export async function assertCustomerAddresses(customerId: string | null | undefined, to: string[]) {
  if (!customerId) throw new Error("Choose the customer this email is for.");
  const allowed = await customerAddresses(customerId);
  const bad = to.filter((t) => !allowed.has(norm(t)));
  if (bad.length) throw new Error(`Not a contact on this customer's record: ${bad.join(", ")}. Add them as a contact first.`);
}
