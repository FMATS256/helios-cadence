import { notifyBilling } from "./portal-api.server";

/**
 * Records a gateway-confirmed portal payment as a *pending* submission so
 * Finance only approves it (separation of duties). Idempotent on the gateway
 * reference via the (source, external_id) unique index.
 */
export async function recordGatewaySubmission(sb: any, intent: any, gatewayBody: unknown): Promise<string | null> {
  const { data: existing } = await sb.from("payment_submissions").select("id").eq("source", "portal").eq("external_id", intent.reference).maybeSingle();
  let id: string | null = existing?.id ?? null;
  if (!id) {
    const { data: customer } = await sb.from("customers").select("account_number,company_name").eq("id", intent.customer_id).maybeSingle();
    const { data: accounts } = await sb.from("cash_accounts").select("id,kind,is_default").eq("is_active", true);
    const account = (accounts ?? []).find((a: any) => String(a.kind ?? "").toLowerCase().startsWith("mobile")) ?? (accounts ?? []).find((a: any) => a.is_default) ?? null;
    const items: string[] = Array.isArray(intent.items) ? intent.items : [];
    const { data: row, error } = await sb.from("payment_submissions").insert({
      customer_id: intent.customer_id, account_number: customer?.account_number ?? null, invoice_id: intent.invoice_id,
      amount: intent.amount, currency: intent.currency, method: "mobile_money",
      payment_date: new Date().toISOString().slice(0, 10), reference: intent.reference, cash_account_id: account?.id ?? null,
      notes: [`Client portal ${intent.method} payment (gateway-confirmed)`, items.length ? `Paid for: ${items.join("; ")}` : null].filter(Boolean).join(" · "),
      status: "pending", source: "portal", external_id: intent.reference, external_status: "succeeded",
      external_payload: { items, gateway: gatewayBody } as any, submitted_by: intent.user_id,
    } as any).select("id").single();
    if (error) {
      const { data: again } = await sb.from("payment_submissions").select("id").eq("source", "portal").eq("external_id", intent.reference).maybeSingle();
      if (!again) { console.error("submission insert failed", error.message); return null; }
      id = again.id;
    } else {
      id = row.id;
      await sb.from("payment_submission_events").insert({ submission_id: id, action: "submitted", notes: `Portal ${intent.method} ${intent.reference} confirmed by gateway — awaiting Finance approval` } as any);
      await notifyBilling(sb, "Client portal payment awaiting approval", `${customer?.company_name ?? "Client"} paid ${intent.currency} ${Number(intent.amount).toFixed(2)}${items.length ? ` for ${items.join(", ")}` : ""}`).catch(() => {});
    }
  }
  await sb.from("client_payment_intents").update({ submission_id: id } as any).eq("id", intent.id);
  return id;
}
