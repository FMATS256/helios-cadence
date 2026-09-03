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
          ...(data.sender ? { fromName: `${data.sender} (IMT Solutions)` } : {}),
          ...(context.claims?.email ? { fromLocal: context.claims.email as string, replyTo: context.claims.email as string } : {}),
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

/** Recipients an account manager can pick when composing to a customer. */
export const listEmailRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customer_id?: string; account_number?: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertStaff, admin } = await import("./customer360.server");
    await assertStaff(context as any);
    const db = await admin();
    let q = db
      .from("customers")
      .select("id, account_number, company_name, primary_email, title");
    q = data.customer_id
      ? q.eq("id", data.customer_id)
      : q.eq("account_number", (data.account_number || "").toUpperCase());
    const { data: cust } = await q.maybeSingle();
    if (!cust) return { customer: null, recipients: [] as any[] };

    const { data: contacts } = await db
      .from("customer_contacts")
      .select("full_name, email, title, role")
      .eq("customer_id", (cust as any).id);

    const seen = new Set<string>();
    const recipients: { email: string; name: string; role: string }[] = [];
    const push = (email?: string | null, name?: string | null, role?: string | null) => {
      const e = (email || "").trim();
      if (!e || !/@/.test(e) || seen.has(e.toLowerCase())) return;
      seen.add(e.toLowerCase());
      recipients.push({ email: e, name: name || e, role: role || "Contact" });
    };
    push((cust as any).primary_email, (cust as any).company_name, "Primary");
    (contacts ?? []).forEach((c: any) => push(c.email, c.full_name, c.role || "Contact"));

    return { customer: cust, recipients };
  });

export interface ComposeClientEmailInput {
  customer_id?: string;
  account_number?: string;
  to: string[];
  subject: string;
  body: string;
  /** Optional reply-to override; defaults to the sending staff member. */
  reply_to?: string;
}

/** Draft-and-send: account managers compose a branded email to a client. */
export const composeClientEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: ComposeClientEmailInput) => d)
  .handler(async ({ data, context }) => {
    const { assertStaff, admin } = await import("./customer360.server");
    await assertStaff(context as any);

    const subject = (data.subject || "").trim();
    const body = (data.body || "").trim();
    const to = (data.to || []).map((t) => t.trim()).filter((t) => /@/.test(t));
    if (!subject) throw new Error("Subject is required");
    if (!body) throw new Error("Message body is required");
    if (!to.length) throw new Error("Pick at least one recipient");
    if (to.length > 10) throw new Error("Maximum 10 recipients per send");

    const db = await admin();
    const { data: profile } = await db
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const senderName = (profile as any)?.full_name || "IMT Solutions";
    const replyTo = data.reply_to || (profile as any)?.email || undefined;

    let customer: any = null;
    if (data.customer_id || data.account_number) {
      let q = db
        .from("customers")
        .select("id, account_number, company_name, primary_email, title")
        .limit(1);
      q = data.customer_id
        ? q.eq("id", data.customer_id)
        : q.eq("account_number", (data.account_number || "").toUpperCase());
      customer = (await q.maybeSingle()).data;
    }

    const { sendTemplateEmail } = await import("./email-templates/send-email");
    const stamp = Date.now();
    const results: { email: string; status: string; error?: string }[] = [];

    for (const recipient of to) {
      let status = "sent";
      let failure: string | null = null;
      try {
        const res = await sendTemplateEmail("general-message", recipient, {
          templateData: {
            subject,
            message: body,
            senderName,
            recipientName: customer?.company_name,
            recipientTitle: customer?.title ?? undefined,
          },
          idempotencyKey: `compose-${context.userId}-${stamp}-${recipient}`,
          fromName: `${senderName} (IMT Solutions)`,
          fromLocal: (profile as any)?.email || "noreply",
          ...(replyTo ? { replyTo } : {}),
        });
        if (!res.sent) {
          status = "suppressed";
          failure = res.reason;
        }
      } catch (e: any) {
        status = "failed";
        failure = e?.message ?? String(e);
      }
      results.push({ email: recipient, status, ...(failure ? { error: failure } : {}) });

      await db.from("communications").insert({
        channel: "email",
        direction: "outbound",
        subject,
        body,
        recipient,
        sender: senderName,
        account_number: customer?.account_number ?? null,
        customer_id: customer?.id ?? null,
        sent_at: new Date().toISOString(),
        status,
        created_by: context.userId,
        metadata: failure ? { error: failure } : null,
      } as any);
    }

    const sent = results.filter((r) => r.status === "sent").length;

    if (customer?.id) {
      const { recordCustomerEvent } = await import("./customer-events.server");
      await recordCustomerEvent(db, {
        customer_id: customer.id,
        account_number: customer.account_number,
        event_type: "email_sent",
        title: `Email sent: ${subject}`,
        description: `${sent}/${results.length} recipient(s) delivered by ${senderName}`,
        module: "communications",
        entity_type: "communications",
        new_value: { subject, recipients: results },
        actor_id: context.userId,
        major: false,
      });
    } else {
      await db.from("audit_log").insert({
        actor_id: context.userId,
        action: "communication_sent",
        entity_type: "communications",
        module: "communications",
        new_value: { subject, recipients: results },
      } as any);
    }

    const failed = results.filter((r) => r.status === "failed");
    if (failed.length && !sent) throw new Error(failed[0].error || "Email send failed");
    return { sent, total: results.length, results };
  });
