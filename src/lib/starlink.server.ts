export function buildStarlinkProviderPayload(input: {
  action: string;
  checkedAt?: string;
  starlinkAccountNumber?: string | null;
  kitSerial?: string | null;
  terminalId?: string | null;
  planType?: string | null;
  serviceAddress?: string | null;
}) {
  return {
    provider: "starlink",
    source: "manual-account-check",
    action: input.action,
    checked_at: input.checkedAt ?? new Date().toISOString(),
    identifiers: {
      starlink_account_number: input.starlinkAccountNumber ?? null,
      kit_serial: input.kitSerial ?? null,
      terminal_id: input.terminalId ?? null,
    },
    plan: input.planType ?? "residential",
    service_address: input.serviceAddress ?? null,
  };
}

export async function sendExternalStarlinkRecharge(payload: {
  rechargeId: string;
  accountNumber: string;
  starlinkAccountNumber?: string | null;
  kitSerial?: string | null;
  terminalId?: string | null;
  customerChargeUsd: number;
  externalPayoutUsd: number;
  marginUsd: number;
  paymentReference?: string | null;
}) {
  const webhookUrl = process.env.STARLINK_RECHARGE_WEBHOOK_URL;
  if (!webhookUrl) {
    return { status: "queued", response: { reason: "external webhook not configured" } };
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const response = await res.json().catch(() => ({ status: res.status }));
  if (!res.ok) throw new Error(`External recharge failed: ${res.status}`);
  return { status: "sent", response };
}