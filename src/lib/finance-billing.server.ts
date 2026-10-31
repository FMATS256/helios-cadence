import { BILLING_MAILBOX } from "./finance-billing.shared";
import { ingestNormalizedEmail, listGatewayMessages } from "./inbox.server";

export async function syncBillingMailbox() {
  const result = await listGatewayMessages({ direction: "inbound", mailbox: BILLING_MAILBOX, limit: 100 });
  if (!result.ok) throw new Error(result.error);
  const rows = Array.isArray(result.data?.data) ? result.data.data : Array.isArray(result.data?.messages) ? result.data.messages : null;
  if (!rows) throw new Error("Billing mailbox returned an unsupported message response");
  let imported = 0;
  for (const row of rows) {
    if (row.direction && row.direction !== "inbound") continue;
    const recipients = Array.isArray(row.to_addresses) ? row.to_addresses : String(row.to_addresses || row.to_address || "").split(",");
    if (!recipients.some((r: string) => r.toLowerCase().includes(BILLING_MAILBOX))) continue;
    if (!row.provider_id || !row.from_address) throw new Error("Billing message is missing its sender or delivery identifier");
    const ingested = await ingestNormalizedEmail({
      providerId: row.provider_id, messageId: row.message_id, from: row.from_address, to: recipients,
      cc: Array.isArray(row.cc_addresses) ? row.cc_addresses : [], subject: row.subject,
      html: row.html, text: row.text_body, inReplyTo: row.in_reply_to, references: row.references_header,
      receivedAt: row.created_at,
      attachments: (row.attachments ?? []).map((a: any) => ({ filename: a.filename || "attachment", content_type: a.content_type, size_bytes: a.size_bytes ?? a.size, attachment_id: a.download_url ?? a.url ?? a.path ?? a.id, content: a.content, content_id: a.content_id })),
    });
    if (ingested.status === "skipped") throw new Error(ingested.error || "Billing message could not be saved");
    if (ingested.status !== "duplicate") imported++;
  }
  return { imported, checked: rows.length };
}