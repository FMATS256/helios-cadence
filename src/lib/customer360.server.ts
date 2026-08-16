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

/** Free-form transactional email used by the Communication Center. */
export async function sendRawEmail(opts: {
  to: string; subject: string; body: string; replyTo?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { sent: false, reason: "email_not_configured" };
  const { sendLovableEmail, EmailAPIError } = await import("@lovable.dev/email-js");
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2933;white-space:pre-wrap">${
    opts.body.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string))
  }</div>`;
  try {
    await sendLovableEmail(
      {
        to: opts.to,
        from: `IMT Solutions <noreply@notify.notifications.imtsolutions.co.zw>`,
        sender_domain: "notify.notifications.imtsolutions.co.zw",
        subject: opts.subject,
        html,
        text: opts.body,
        purpose: "transactional",
        label: "customer-communication",
        idempotency_key: crypto.randomUUID(),
        reply_to: opts.replyTo,
      },
      { apiKey, sendUrl: process.env.LOVABLE_SEND_URL },
    );
    return { sent: true };
  } catch (error: any) {
    if (error instanceof EmailAPIError && error.code === "recipient_suppressed") {
      return { sent: false, reason: "recipient_suppressed" };
    }
    console.error("[sendRawEmail]", error?.message ?? error);
    return { sent: false, reason: error?.message ?? "send_failed" };
  }
}

/* =========================================================================
 * PAYMENT ENGINE (Block 3) — shared by the Record Payment workspace
 * =======================================================================*/

export type OpenInvoice = {
  id: string; invoice_number: string; total: number; paid: number; balance: number;
  currency: string; status: string; issue_date: string | null; due_date: string | null;
  is_overdue: boolean; ageing: string; days_overdue: number;
};

/** Every unsettled invoice with its true allocated/paid figure. */
export async function loadOpenInvoices(db: any, customerId: string): Promise<OpenInvoice[]> {
  const { data: invs } = await db
    .from("invoices")
    .select("id, invoice_number, total, currency, status, issue_date, due_date")
    .eq("customer_id", customerId)
    .is("archived_at", null)
    .not("status", "in", "(void,cancelled)")
    .order("due_date", { ascending: true });
  const list = (invs ?? []) as any[];
  if (!list.length) return [];
  const { data: allocs } = await db
    .from("payment_allocations")
    .select("invoice_id, amount")
    .in("invoice_id", list.map((i) => i.id));
  const paidBy = new Map<string, number>();
  for (const a of (allocs ?? []) as any[]) {
    paidBy.set(a.invoice_id, (paidBy.get(a.invoice_id) ?? 0) + num(a.amount));
  }
  return list
    .map((i) => {
      const paid = paidBy.get(i.id) ?? 0;
      const balance = Math.round((num(i.total) - paid) * 100) / 100;
      const days = i.due_date ? Math.floor((Date.now() - new Date(i.due_date).getTime()) / 86_400_000) : 0;
      return {
        id: i.id, invoice_number: i.invoice_number, total: num(i.total), paid, balance,
        currency: i.currency || "USD", status: i.status,
        issue_date: i.issue_date ?? null, due_date: i.due_date ?? null,
        is_overdue: balance > 0.005 && days > 0,
        ageing: balance > 0.005 ? ageingBucket(i.due_date) : "settled",
        days_overdue: balance > 0.005 && days > 0 ? days : 0,
      } as OpenInvoice;
    })
    .filter((i) => i.balance > 0.005);
}

/** Oldest-due-first allocation of a sum across open invoices. */
export function allocateOldestFirst(invoices: OpenInvoice[], amount: number) {
  let left = Math.round(num(amount) * 100) / 100;
  const out: Array<{ invoice_id: string; invoice_number: string; amount: number }> = [];
  const ordered = [...invoices].sort((a, b) => {
    const ad = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });
  for (const inv of ordered) {
    if (left <= 0.005) break;
    const take = Math.round(Math.min(left, inv.balance) * 100) / 100;
    if (take <= 0) continue;
    out.push({ invoice_id: inv.id, invoice_number: inv.invoice_number, amount: take });
    left = Math.round((left - take) * 100) / 100;
  }
  return { allocations: out, unallocated: Math.max(0, left) };
}

export async function creditBalanceOf(db: any, customerId: string) {
  const { data } = await db.from("customer_credits").select("amount").eq("customer_id", customerId);
  return Math.round(((data ?? []) as any[]).reduce((s, c) => s + num(c.amount), 0) * 100) / 100;
}

/** Recurring lines a payment can be tagged against, plus their suspension state. */
export async function loadPayableServices(db: any, customerId: string) {
  const [subR, svcR] = await Promise.all([
    db.from("subscriptions").select("*").eq("customer_id", customerId).neq("status", "cancelled").order("created_at", { ascending: false }),
    db.from("cloud_services").select("*").eq("customer_id", customerId).is("archived_at", null).neq("status", "cancelled"),
  ]);
  const subs = ((subR as any)?.data ?? []).map((s: any) => ({
    kind: "subscription" as const, id: s.id, label: s.plan_name,
    description: s.description ?? null, status: s.status,
    amount: num(s.amount), currency: s.currency || "USD", cycle: s.billing_cycle || "monthly",
    monthly: monthly(s.amount, s.billing_cycle), next_renewal: s.next_renewal ?? null,
    line: serviceLineOf(s.plan_name, s.description),
    suspended: s.status === "paused" || s.status === "suspended",
  }));
  const svcs = ((svcR as any)?.data ?? []).map((s: any) => ({
    kind: "service" as const, id: s.id, label: s.service_name || s.plan || "Cloud service",
    description: s.vendor ?? s.service_type ?? null, status: s.status,
    amount: num(s.monthly_cost), currency: "USD", cycle: "monthly",
    monthly: num(s.monthly_cost), next_renewal: s.renewal_date ?? null,
    line: serviceLineOf(s.service_name, s.service_type, s.vendor),
    suspended: s.status === "suspended",
  }));
  return [...subs, ...svcs].sort((a, b) => b.monthly - a.monthly);
}

const SERVICE_TABLES = [
  "cloud_services", "web_hosting_accounts", "voip_accounts",
  "starlink_accounts", "cloud_storage_accounts", "managed_nas_accounts",
] as const;

/**
 * Business rule: once an account has no overdue balance left, suspended
 * services come back automatically. Returns what was restored.
 */
export async function resumeSuspendedForCustomer(db: any, customerId: string) {
  const touched: Record<string, number> = {};
  const subRes: any = await db.from("subscriptions")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("customer_id", customerId).eq("status", "paused").select("id, plan_name");
  if (subRes?.data?.length) touched["subscriptions"] = subRes.data.length;
  const others = await Promise.all(
    SERVICE_TABLES.map((t) =>
      db.from(t).update({ status: "active", updated_at: new Date().toISOString() })
        .eq("customer_id", customerId).eq("status", "suspended").select("id"),
    ),
  );
  others.forEach((r: any, i) => { if (r?.data?.length) touched[SERVICE_TABLES[i]] = r.data.length; });

  // Provider-side restore: hosting accounts living on WHM must also be
  // unsuspended in cPanel, otherwise the site stays down after payment.
  if (touched["web_hosting_accounts"]) {
    try {
      const { unsuspendHostingForCustomer } = await import("./hosting.server");
      const pushed = await unsuspendHostingForCustomer(db, customerId);
      if (pushed) touched["whm_unsuspended"] = pushed;
    } catch (e) {
      console.error("[resumeSuspendedForCustomer] WHM restore failed", e);
    }
  }
  // Cloud storage suspension bookkeeping clears with the resume.
  try {
    await db.from("cloud_storage_accounts")
      .update({ suspended_at: null, suspend_reason: null })
      .eq("customer_id", customerId).is("archived_at", null).eq("status", "active");
  } catch (e) { console.error("[resumeSuspendedForCustomer] storage clear failed", e); }

  const total = Object.values(touched).reduce((s, n) => s + n, 0);
  return { touched, total };
}

