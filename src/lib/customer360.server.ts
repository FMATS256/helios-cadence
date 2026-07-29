// Server-only helpers backing the Customer 360 workspaces.
// Kept out of *.functions.ts so those files stay thin server-fn wrappers.

export type StaffCtx = { supabase: any; userId: string };

export async function assertStaff(ctx: StaffCtx) {
  const { data: hasRole, error } = await ctx.supabase.rpc("has_any_role", { _user_id: ctx.userId });
  if (error) throw new Error(error.message);
  if (!hasRole) throw new Error("Your account needs a staff role to perform this action.");
}

export async function isFinanceOrAdmin(ctx: StaffCtx) {
  const [a, b] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "master_admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "finance" }),
  ]);
  return Boolean(a?.data) || Boolean(b?.data);
}

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function loadCustomer(db: any, customerId: string) {
  const { data, error } = await db
    .from("customers")
    .select("id, account_number, company_name, primary_email, primary_phone, status, account_type, billing_address, created_at")
    .eq("id", customerId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Customer not found");
  return data;
}

export const num = (v: any) => Number(v || 0);

/** Normalise any billing cycle to a monthly figure. */
export function monthly(amount: any, cycle?: string | null) {
  const a = num(amount);
  const c = String(cycle || "monthly").toLowerCase();
  if (c === "yearly" || c === "annual") return a / 12;
  if (c === "quarterly") return a / 3;
  if (c === "weekly") return a * 4.345;
  if (c === "daily") return a * 30;
  if (c === "one_time" || c === "once") return 0;
  return a;
}

export function advanceDate(from: Date, cycle?: string | null) {
  const d = new Date(from);
  const c = String(cycle || "monthly").toLowerCase();
  if (c === "yearly" || c === "annual") d.setFullYear(d.getFullYear() + 1);
  else if (c === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (c === "weekly") d.setDate(d.getDate() + 7);
  else if (c === "daily") d.setDate(d.getDate() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

/** Ageing bucket for an unpaid invoice, in days past due. */
export function ageingBucket(dueDate?: string | null) {
  if (!dueDate) return "current";
  const days = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90_plus";
}

/** KYC checklist, driven purely by the customer's account type. */
export const KYC_REQUIREMENTS: Record<string, Array<{ key: string; label: string; required: boolean }>> = {
  corporate: [
    { key: "certificate_of_incorporation", label: "Certificate of Incorporation", required: true },
    { key: "cr14", label: "CR14", required: true },
    { key: "proof_of_business_address", label: "Proof of Business Address", required: true },
    { key: "vat_certificate", label: "VAT Certificate", required: false },
    { key: "tax_clearance", label: "Tax Clearance", required: false },
    { key: "company_tin", label: "Company TIN", required: true },
    { key: "signed_contract", label: "Signed Contracts", required: false },
    { key: "proof_of_payment", label: "Proof of Payments", required: false },
    { key: "other_corporate", label: "Other Corporate Documents", required: false },
  ],
  individual: [
    { key: "national_id", label: "National ID / Passport", required: true },
    { key: "proof_of_residence", label: "Proof of Residence", required: true },
  ],
};

export function kycProfileFor(accountType?: string | null) {
  const t = String(accountType || "").toLowerCase();
  const individual = ["individual", "personal", "consumer", "residential", "person"].includes(t);
  return individual ? "individual" : "corporate";
}

/** The service-line key a subscription belongs to — used to stop duplicate active packages. */
export function serviceLineOf(...parts: Array<string | null | undefined>) {
  const t = parts.filter(Boolean).join(" ").toLowerCase();
  if (/(vps|cloud server|kamatera|vultr|contabo|kvm|instance)/.test(t)) return "cloud";
  if (/(hosting|cpanel|whm|website|wordpress)/.test(t)) return "hosting";
  if (/(domain|dns|registrar)/.test(t)) return "domains";
  if (/(starlink|satellite)/.test(t)) return "starlink";
  if (/(voip|sip|pbx|telephony)/.test(t)) return "voip";
  if (/(nas|synology|qnap)/.test(t)) return "nas";
  if (/(storage|s3|object store)/.test(t)) return "storage";
  if (/(backup|dr |disaster|acronis|veeam)/.test(t)) return "backup";
  if (/(m365|microsoft ?365|office ?365|exchange)/.test(t)) return "m365";
  if (/(security|antivirus|edr|soc|firewall|endpoint)/.test(t)) return "security";
  if (/(licen[sc]e|product key)/.test(t)) return "licenses";
  if (/(internet|fibre|fiber|wireless|pppoe|broadband|link)/.test(t)) return "internet";
  if (/(support|managed|sla|helpdesk|retainer)/.test(t)) return "support";
  return "other";
}
