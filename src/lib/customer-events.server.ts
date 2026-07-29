// Server-only shared event framework for Customer 360.
// Every customer-facing mutation records BOTH an audit_log row (who/what/when/
// old/new/module/ip) and a customer_timeline entry, so the timeline and the
// audit trail can never drift apart.
import { getRequest } from "@tanstack/react-start/server";

export type CustomerEvent = {
  customer_id: string;
  account_number: string;
  /** machine key e.g. "package_changed", "payment_recorded" */
  event_type: string;
  /** human title shown on the timeline */
  title: string;
  description?: string | null;
  /** module name recorded on the audit row, e.g. "billing" */
  module: string;
  entity_type: string;
  entity_id?: string | null;
  old_value?: Record<string, any> | null;
  new_value?: Record<string, any> | null;
  metadata?: Record<string, any>;
  /** major events show in the condensed timeline; minor ones only under "View more" */
  major?: boolean;
  actor_id?: string | null;
  actor_email?: string | null;
};

function requestMeta() {
  try {
    const req = getRequest();
    const h = req?.headers;
    return {
      ip:
        h?.get("cf-connecting-ip") ||
        h?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        null,
      ua: h?.get("user-agent") || null,
    };
  } catch {
    return { ip: null, ua: null };
  }
}

/**
 * Write the audit + timeline pair. Never throws — a logging failure must not
 * roll back the business action that already succeeded.
 */
export async function recordCustomerEvent(admin: any, e: CustomerEvent) {
  const { ip, ua } = requestMeta();
  const results = await Promise.allSettled([
    admin.from("audit_log").insert({
      actor_id: e.actor_id ?? null,
      actor_email: e.actor_email ?? null,
      action: e.event_type,
      entity_type: e.entity_type,
      entity_id: e.entity_id ?? null,
      account_number: e.account_number,
      old_value: e.old_value ?? null,
      new_value: { ...(e.new_value ?? {}), module: e.module },
      ip_address: ip,
      user_agent: ua,
    } as any),
    admin.from("customer_timeline").insert({
      customer_id: e.customer_id,
      account_number: e.account_number,
      event_type: e.event_type,
      title: e.title,
      description: e.description ?? null,
      actor_id: e.actor_id ?? null,
      metadata: {
        module: e.module,
        major: e.major !== false,
        entity_type: e.entity_type,
        entity_id: e.entity_id ?? null,
        ...(e.metadata ?? {}),
      },
    } as any),
  ]);
  for (const r of results) {
    if (r.status === "rejected") console.error("[recordCustomerEvent]", r.reason);
  }
}

/** Event types considered "major" for the condensed customer timeline. */
export const MAJOR_EVENT_TYPES = [
  "customer_created",
  "service_activated",
  "service_suspended",
  "service_resumed",
  "service_cancelled",
  "package_changed",
  "invoice_generated",
  "payment_recorded",
  "refund_issued",
  "quote_generated",
  "contract_generated",
  "ticket_created",
  "ticket_closed",
  "equipment_assigned",
  "equipment_reassigned",
  "communication_sent",
  "status_changed",
  "document_uploaded",
  "credit_added",
];
