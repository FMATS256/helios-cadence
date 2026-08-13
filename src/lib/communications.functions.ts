/**
 * Communications — log an interaction and, for outbound email, actually send it
 * through the branded general-message template.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LogCommunicationInput {
  channel: string;
  direction: string;
  subject?: string;
  body: string;
  recipient?: string;
  sender?: string;
  account_number?: string;
  sent_at?: string;
  send_email?: boolean;
}

export const logCommunication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: LogCommunicationInput) => d)
  .handler(async ({ data, context }) => {
    const { assertStaff } = await import("./customer360.server");
    await assertStaff(context as any);
    if (!data.body?.trim()) throw new Error("Message body is required");

    const { admin } = await import("./customer360.server");
    const db = await admin();

    let customer_id: string | null = null;
    if (data.account_number) {
      const { data: cust } = await db
        .from("customers")
        .select("id")
        .eq("account_number", data.account_number)
        .maybeSingle();
      customer_id = (cust as any)?.id ?? null;
    }

    const shouldSend =
      data.send_email !== false &&
      data.channel === "email" &&
      data.direction === "outbound" &&
      !!data.recipient &&
      /@/.test(data.recipient);

    let status = data.direction === "inbound" ? "received" : "logged";
    let failure: string | null = null;

    if (shouldSend) {
      try {
        const { sendTemplateEmail } = await import("./email-templates/send-email");
        const res = await sendTemplateEmail("general-message", data.recipient!, {
          templateData: {
            subject: data.subject || `A message from IMT Solutions`,
            message: data.body,
            senderName: data.sender || undefined,
          },
          idempotencyKey: `comm-${context.userId}-${Date.now()}`,
        });
        status = res.sent ? "sent" : "suppressed";
        if (!res.sent) failure = res.reason;
      } catch (e: any) {
        status = "failed";
        failure = e?.message ?? String(e);
      }
    }

    const { data: row, error } = await db
      .from("communications")
      .insert({
        channel: data.channel,
        direction: data.direction,
        subject: data.subject || null,
        body: data.body,
        recipient: data.recipient || null,
        sender: data.sender || null,
        account_number: data.account_number || null,
        customer_id,
        sent_at: data.sent_at ? new Date(data.sent_at).toISOString() : new Date().toISOString(),
        status,
        created_by: context.userId,
        metadata: failure ? { error: failure } : null,
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await db.from("audit_log").insert({
      actor_id: context.userId,
      action: shouldSend ? "communication_sent" : "communication_logged",
      entity_type: "communications",
      entity_id: (row as any)?.id ?? null,
      module: "communications",
      new_value: { channel: data.channel, recipient: data.recipient, status },
    } as any);

    if (status === "failed") throw new Error(`Logged, but email failed: ${failure}`);
    return row;
  });
