// Block 6 — Starlink recharge workflow engine (server-only).
//
// Status machine:
//   pending_finance -> paid -> message_sent -> awaiting_supplier
//                                             -> completed | failed | cancelled
//
// The WhatsApp request goes to the supplier number below. If a WhatsApp
// provider is configured (WHATSAPP_API_URL + WHATSAPP_API_TOKEN, Meta Cloud
// API compatible payload) the message is sent automatically; otherwise the
// engine returns a ready-to-use wa.me deep link so the operator sends it from
// the desk and the workflow still records the exact message and timestamp.

export const STARLINK_SUPPLIER_WHATSAPP = "+263779237813";
export const SUPPLIER_RECHECK_MINUTES = 60;
export const MAX_SUPPLIER_CHECKS = 4;

export const RECHARGE_STATUSES = [
  "pending_finance",
  "paid",
  "message_sent",
  "awaiting_supplier",
  "completed",
  "failed",
  "cancelled",
] as const;
export type RechargeStatus = (typeof RECHARGE_STATUSES)[number];

export const RECHARGE_STATUS_LABELS: Record<RechargeStatus, string> = {
  pending_finance: "Pending finance",
  paid: "Paid",
  message_sent: "Message sent",
  awaiting_supplier: "Awaiting supplier",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Allowed transitions — enforced server-side before any mutation. */
export const ALLOWED_TRANSITIONS: Record<RechargeStatus, RechargeStatus[]> = {
  pending_finance: ["paid", "cancelled", "failed"],
  paid: ["message_sent", "cancelled", "failed"],
  message_sent: ["awaiting_supplier", "completed", "failed", "cancelled"],
  awaiting_supplier: ["completed", "failed", "cancelled"],
  completed: [],
  failed: ["message_sent", "cancelled"],
  cancelled: [],
};

export function assertTransition(from: string, to: RechargeStatus) {
  const allowed = ALLOWED_TRANSITIONS[(from as RechargeStatus) ?? "pending_finance"] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(
      `Cannot move a recharge from "${RECHARGE_STATUS_LABELS[from as RechargeStatus] ?? from}" to "${RECHARGE_STATUS_LABELS[to]}".`,
    );
  }
}

export function buildSupplierMessage(input: {
  paymentReference?: string | null;
  starlinkAccountNumber?: string | null;
  kitSerial?: string | null;
  terminalId?: string | null;
  planType?: string | null;
  customerName?: string | null;
  payoutUsd: number;
}) {
  const lines = [
    "IMT Solutions — Starlink recharge request",
    input.paymentReference ? `Reference: ${input.paymentReference}` : null,
    input.customerName ? `Customer: ${input.customerName}` : null,
    input.starlinkAccountNumber ? `Starlink account: ${input.starlinkAccountNumber}` : null,
    input.kitSerial ? `Kit serial: ${input.kitSerial}` : null,
    input.terminalId ? `Terminal: ${input.terminalId}` : null,
    `Plan: ${input.planType === "business" ? "Business" : "Residential"}`,
    `Amount to recharge: USD ${Number(input.payoutUsd).toFixed(2)}`,
    "Please confirm once the recharge has been applied.",
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

export function waDeepLink(number: string, message: string) {
  return `https://wa.me/${number.replace(/[^\d]/g, "")}?text=${encodeURIComponent(message)}`;
}

export type WhatsAppSendResult = {
  channel: "provider" | "manual";
  sent: boolean;
  link: string;
  detail?: string;
};

/** Sends via configured provider, else returns a manual wa.me link. */
export async function sendSupplierWhatsApp(
  to: string,
  message: string,
): Promise<WhatsAppSendResult> {
  const link = waDeepLink(to, message);
  const url = process.env["WHATSAPP_API_URL"];
  const token = process.env["WHATSAPP_API_TOKEN"];
  if (!url || !token) {
    return { channel: "manual", sent: false, link, detail: "No WhatsApp provider configured — send the prepared message manually." };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/[^\d]/g, ""),
        type: "text",
        text: { body: message },
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      return { channel: "provider", sent: false, link, detail: `Provider error [${res.status}]: ${body.slice(0, 400)}` };
    }
    return { channel: "provider", sent: true, link, detail: body.slice(0, 400) };
  } catch (e: any) {
    return { channel: "provider", sent: false, link, detail: e?.message ?? String(e) };
  }
}

/** Writes the workflow event row + notifies staff. Never throws. */
export async function recordRechargeEvent(
  admin: any,
  e: {
    recharge_id: string;
    from_status?: string | null;
    to_status: RechargeStatus;
    note?: string | null;
    actor_id?: string | null;
    actor_email?: string | null;
  },
) {
  try {
    await admin.from("starlink_recharge_events").insert({
      recharge_id: e.recharge_id,
      from_status: e.from_status ?? null,
      to_status: e.to_status,
      note: e.note ?? null,
      actor_id: e.actor_id ?? null,
      actor_email: e.actor_email ?? null,
    });
  } catch (err) {
    console.error("[recordRechargeEvent]", err);
  }
}

/** In-app notification to staff who look after connectivity + finance. */
export async function notifyStarlinkStaff(
  admin: any,
  title: string,
  body: string,
  link = "/starlink",
) {
  try {
    const roles = ["master_admin", "operations_manager", "finance", "account_manager"];
    const { data: staff } = await admin.from("user_roles").select("user_id").in("role", roles);
    const ids = Array.from(new Set((staff ?? []).map((r: any) => r.user_id)));
    if (!ids.length) return;
    await admin
      .from("notifications")
      .insert(ids.map((user_id) => ({ user_id, kind: "starlink_recharge", title, body, link })));
  } catch (err) {
    console.error("[notifyStarlinkStaff]", err);
  }
}
