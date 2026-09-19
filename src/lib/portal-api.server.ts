/**
 * Shared helpers for the IMT Payments Portal API (/api/public/portal/*).
 *
 * The portal is a separate application, so these endpoints are the contract
 * between the two systems. Rules that must never be relaxed:
 *  • every request carries the shared API key (x-api-key / Bearer)
 *  • an inbound payment becomes a *payment submission awaiting verification*,
 *    never a recorded payment — billing still approves it, which is what posts
 *    the money to the ledger. Separation of duties stays intact.
 *  • `external_id` makes every write idempotent: replaying a webhook returns
 *    the existing record instead of duplicating money.
 */

const enc = new TextEncoder();

export function json(body: unknown, status = 200) {
  return Response.json(body as any, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function fail(status: number, error: string, extra?: Record<string, unknown>) {
  return json({ ok: false, error, ...(extra ?? {}) }, status);
}

/** Constant-time compare so the key cannot be guessed byte by byte. */
function safeEqual(a: string, b: string) {
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Returns null when authorised, or the Response to send back when not. */
export function requireApiKey(request: Request): Response | null {
  const expected = process.env["PORTAL_API_KEY"];
  if (!expected) return fail(503, "Portal API key is not configured on the server");
  const header =
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!header || !safeEqual(header.trim(), expected)) {
    return fail(401, "Invalid or missing API key");
  }
  return null;
}

export const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

export const num = (v: any) => Number(v || 0);
export const round = (v: number) => Math.round(v * 100) / 100;

/** Gateway wording varies; normalise it to our four states. */
export function normaliseExternalStatus(raw?: string | null) {
  const s = String(raw ?? "succeeded").trim().toLowerCase();
  if (["succeeded", "success", "successful", "paid", "completed", "complete", "captured", "settled"].includes(s)) return "succeeded";
  if (["pending", "processing", "initiated", "awaiting", "submitted"].includes(s)) return "pending";
  if (["failed", "failure", "declined", "error", "rejected", "reversed", "expired"].includes(s)) return "failed";
  if (["cancelled", "canceled", "void", "voided", "abandoned"].includes(s)) return "cancelled";
  return s;
}

export async function findCustomer(sb: any, accountNumber?: string | null, customerId?: string | null) {
  if (customerId) {
    const { data } = await sb.from("customers")
      .select("id,account_number,company_name,status").eq("id", customerId).maybeSingle();
    return data ?? null;
  }
  if (!accountNumber) return null;
  const { data } = await sb.from("customers")
    .select("id,account_number,company_name,status")
    .ilike("account_number", String(accountNumber).trim())
    .maybeSingle();
  return data ?? null;
}

/** Open invoices with the amount still outstanding on each. */
export async function openInvoices(sb: any, customerId: string) {
  const { data: invoices } = await sb.from("invoices")
    .select("id,invoice_number,status,issue_date,due_date,currency,subtotal,tax,total,paid_at")
    .eq("customer_id", customerId)
    .is("archived_at", null)
    .order("due_date", { ascending: true });

  const list = (invoices ?? []).filter((i: any) => !["draft", "void", "cancelled"].includes(String(i.status)));
  if (!list.length) return [];

  const { data: allocs } = await sb.from("payment_allocations")
    .select("invoice_id,amount")
    .in("invoice_id", list.map((i: any) => i.id));

  const paid: Record<string, number> = {};
  for (const a of allocs ?? []) paid[a.invoice_id] = round((paid[a.invoice_id] ?? 0) + num(a.amount));

  const today = new Date().toISOString().slice(0, 10);
  return list.map((i: any) => {
    const settled = paid[i.id] ?? 0;
    const balance = round(num(i.total) - settled);
    return {
      id: i.id,
      invoice_number: i.invoice_number,
      status: i.status,
      issue_date: i.issue_date,
      due_date: i.due_date,
      currency: i.currency,
      total: round(num(i.total)),
      paid: settled,
      balance: Math.max(0, balance),
      overdue: balance > 0.005 && !!i.due_date && i.due_date < today,
    };
  });
}

/** Public shape of a submission — safe to hand to the portal. */
export function publicSubmission(row: any) {
  return {
    id: row.id,
    external_id: row.external_id ?? null,
    account_number: row.account_number,
    invoice_id: row.invoice_id ?? null,
    amount: round(num(row.amount)),
    currency: row.currency,
    method: row.method,
    reference: row.reference ?? null,
    payment_date: row.payment_date,
    /** pending | clarification | approved | rejected | cancelled */
    verification_status: row.status,
    gateway_status: row.external_status ?? null,
    receipt_number: row.receipt_number ?? null,
    payment_id: row.payment_id ?? null,
    review_notes: row.review_notes ?? null,
    rejection_reason: row.rejection_reason ?? null,
    reviewed_at: row.reviewed_at ?? null,
    submitted_at: row.submitted_at ?? row.created_at,
    updated_at: row.updated_at,
  };
}

/** Tell billing that money from the portal is waiting for verification. */
export async function notifyBilling(sb: any, title: string, body: string, link = "/payments?tab=submissions") {
  const { data } = await sb.from("user_roles")
    .select("user_id")
    .in("role", ["finance", "operations_manager", "master_admin"] as any);
  const ids = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
  if (!ids.length) return;
  await sb.from("notifications").insert(
    ids.map((id) => ({ user_id: id, kind: "portal_payment", title, body, link })) as any,
  );
}
