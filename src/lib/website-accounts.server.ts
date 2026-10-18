import { websiteAccountSchema } from "./website-accounts.shared";

export async function openWebsiteAccount(request: Request) {
const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const key = process.env.IMT_EMAIL_API_KEY;
if (!key) return reply({ ok: false, error: "Website connection is not configured" }, 503);
const raw = await request.text();
if (raw.length > 20_000) return reply({ ok: false, error: "Application is too large" }, 413);
const { createHmac, timingSafeEqual, createHash } = await import("node:crypto");
const signature = (request.headers.get("x-imt-signature") ?? "").trim().replace(/^sha256=/i, "").toLowerCase();
const expected = createHmac("sha256", key).update(raw).digest("hex");
const supplied = Buffer.from(signature);
const calculated = Buffer.from(expected);
if (supplied.length !== calculated.length || !timingSafeEqual(supplied, calculated)) return reply({ ok: false, error: "Invalid signature" }, 401);
let payload: unknown;
try { payload = JSON.parse(raw); } catch { return reply({ ok: false, error: "Invalid JSON" }, 400); }
const parsed = websiteAccountSchema.safeParse(payload);
if (!parsed.success) return reply({ ok: false, error: "Invalid account application", issues: parsed.error.issues }, 400);
const { preferredRolesFor } = await import("@/lib/account-managers.shared");
const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
// Canonical validated input makes retries insensitive to JSON key order.
const fingerprint = createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
const { data, error } = await supabaseAdmin.rpc("open_website_account" as any, {
  p_application: parsed.data,
  p_fingerprint: fingerprint,
  p_preferred_roles: preferredRolesFor(parsed.data.category),
} as any);
if (error) {
  if (error.message.includes("APPLICATION_CONFLICT")) return reply({ ok: false, error: "This application ID was already used with different details" }, 409);
  if (error.message.includes("NO_ACTIVE_MANAGER")) return reply({ ok: false, error: "No active account manager is available; please contact IMT" }, 503);
  console.error("Website account opening failed", error.code, error.message);
  return reply({ ok: false, error: "Account could not be opened; retry with the same application ID" }, 500);
}
const result = data as { replayed?: boolean; account_number: string } | null;
if (!result) return reply({ ok: false, error: "Account opening was not confirmed" }, 500);
const { data: customer } = await supabaseAdmin.from("customers").select("id").eq("account_number", result.account_number).maybeSingle();
if (customer) {
  const { sendCustomerWelcome } = await import("./customer-welcome.server");
  await sendCustomerWelcome(supabaseAdmin, customer.id);
}
return reply({ ok: true, ...result }, result.replayed ? 200 : 201);
}
