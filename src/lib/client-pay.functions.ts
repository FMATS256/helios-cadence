import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://payments.imtsolutions.co.zw";

const startSchema = z.object({
  amount: z.number().finite().positive().max(100000),
  currency: z.enum(["USD", "ZWG"]),
  method: z.enum(["ECOCASH", "OMARI", "INNBUCKS"]),
  phone: z.string().trim().regex(/^\+?\d{9,15}$/).optional(),
  invoice_id: z.string().uuid().nullable(),
  items: z.array(z.string().trim().min(1).max(200)).max(30),
}).strict();

async function gateway(path: string, init?: RequestInit) {
  const key = process.env["PORTAL_API_KEY"];
  if (!key) throw new Error("Online payments are not configured yet");
  const res = await fetch(`${GATEWAY}${path}`, { ...init, headers: { "content-type": "application/json", "x-api-key": key, ...(init?.headers ?? {}) } });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("payments gateway", res.status, body); throw new Error(body?.error || body?.message || "The payment service is unavailable. Please try again."); }
  return body;
}

export const startClientPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => startSchema.parse(v))
  .handler(async ({ data, context }) => {
    if (data.method !== "INNBUCKS" && !data.phone) throw new Error("Enter the phone number that will approve the payment");
    const { data: cid } = await context.supabase.rpc("portal_customer_id", { _user_id: context.userId });
    if (!cid) throw new Error("Client account not linked");
    const { data: customer } = await context.supabase.from("customers").select("account_number").eq("id", cid).maybeSingle();
    if (!customer) throw new Error("Client account unavailable");
    if (data.invoice_id) {
      const { data: inv } = await context.supabase.from("invoices").select("id").eq("id", data.invoice_id).eq("customer_id", cid).maybeSingle();
      if (!inv) throw new Error("Invoice not found on your account");
    }
    const result = await gateway("/api/public/v1/payments", { method: "POST", body: JSON.stringify({
      accountNumber: customer.account_number, amount: data.amount, currency: data.currency, method: data.method,
      ...(data.method === "INNBUCKS" ? {} : { phoneNumber: data.phone }),
    }) });
    const reference = String(result?.reference ?? "");
    if (!reference) throw new Error("The payment service did not return a reference. Please try again.");
    const { error } = await context.supabase.from("client_payment_intents").insert({
      reference, customer_id: cid, user_id: context.userId, amount: data.amount, currency: data.currency,
      method: data.method, invoice_id: data.invoice_id, items: data.items, status: String(result.status ?? "PROCESSING"),
    } as any);
    if (error) console.error("intent save failed", error.message);
    return { reference, status: String(result.status ?? "PROCESSING") };
  });

/** Polls the gateway; on SUCCESS records one pending submission for Finance approval. */
export const checkClientPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ reference: z.string().trim().min(4).max(100).regex(/^[A-Za-z0-9-]+$/) }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: intent } = await context.supabase.from("client_payment_intents").select("*").eq("reference", data.reference).eq("user_id", context.userId).maybeSingle();
    if (!intent) throw new Error("Payment not found");
    const result = await gateway(`/api/public/v1/payments/${encodeURIComponent(data.reference)}`);
    const status = String(result?.status ?? "PENDING").toUpperCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("client_payment_intents").update({ status, updated_at: new Date().toISOString() } as any).eq("id", intent.id);
    if (status !== "SUCCESS" || intent.submission_id) return { status, recorded: !!intent.submission_id };

    const { recordGatewaySubmission } = await import("./client-pay.server");
    const submissionId = await recordGatewaySubmission(supabaseAdmin, intent, result);
    return { status, recorded: !!submissionId };
  });
