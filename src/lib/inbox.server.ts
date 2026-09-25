// Server-only engine for the Account Manager email inbox.
// Inbound ingest (Resend Receiving), outbound replies (Resend sending),
// enquiry threading, dedupe, AM assignment and auto-acknowledgements.
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { listAccountManagerRecords } from "./account-managers.server";
import { AM_PHONE } from "./account-managers.shared";
import { recordCustomerEvent } from "./customer-events.server";
import { MAIL_DOMAIN, SALES_INBOX, type EnquiryStatus } from "./inbox.shared";

const GATEWAY = "https://connector-gateway.lovable.dev/resend";

export function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/** First email address found in "Name <a@b.c>" / "a@b.c". */
export function extractEmail(v?: string | null): string {
  const m = String(v ?? "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return (m?.[0] ?? "").toLowerCase();
}

function extractName(v?: string | null): string | null {
  const m = String(v ?? "").match(/^\s*"?([^"<]+?)"?\s*</);
  return m?.[1]?.trim() || null;
}

/** Normalise a Message-ID: strips angle brackets/whitespace for comparisons. */
function stripMessageId(v?: string | null): string {
  return String(v ?? "").trim().replace(/^<|>$/g, "");
}

/** Staff email -> local part usable on the sending domain. */
function localPart(input?: string | null, fallback = "sales"): string {
  const raw = String(input ?? "").split("@")[0];
  const local = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 40);
  return local || fallback;
}

function adminUnavailable(): boolean {
  return !process.env.RESEND_API_KEY || !process.env.LOVABLE_API_KEY;
}

/**
 * Gateway-backed Resend REST call. The connector key is a gateway key —
 * never call api.resend.com directly with it.
 */
async function resendRequest<T = any>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const apiKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!apiKey || !resendKey) throw new Error("RESEND_NOT_CONNECTED");
  const res = await fetch(`${GATEWAY}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Connection-Api-Key": resendKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`RESEND_${res.status}: ${errorBody.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Webhook signature verification (Svix, as used by Resend webhooks)
// ---------------------------------------------------------------------------

export function verifyInboundSignature(rawBody: string, headers: Headers): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return { ok: false, reason: "WEBHOOK_SECRET_MISSING" };
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: "MISSING_SVIX_HEADERS" };
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return { ok: false, reason: "STALE_TIMESTAMP" };
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  const provided = signatureHeader
    .split(/\s+/)
    .map((s) => s.replace(/^v1,/, ""))
    .filter(Boolean);
  const ok = provided.some((sig) => {
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
  return ok ? { ok: true } : { ok: false, reason: "BAD_SIGNATURE" };
}

// ---------------------------------------------------------------------------
// Matching + ingest
// ---------------------------------------------------------------------------

async function findEnquiryByChain(admin: any, inReplyTo: string | null, references: string | null) {
  const ids = [stripMessageId(inReplyTo), ...String(references ?? "").split(/\s+/).map(stripMessageId)].filter(Boolean);
  for (const id of ids) {
    const { data } = await admin
      .from("email_messages")
      .select("enquiry_id")
      .eq("message_id", id)
      .limit(1)
      .maybeSingle();
    if (data?.enquiry_id) {
      const { data: enquiry } = await admin
        .from("email_enquiries")
        .select("*")
        .eq("id", data.enquiry_id)
        .maybeSingle();
      if (enquiry) return enquiry;
    }
  }
  return null;
}

async function findEnquiryByReference(admin: any, haystack: string) {
  const m = haystack.match(/IMTQSD\s?(\d{5})/i);
  if (!m) return null;
  const { data } = await admin
    .from("email_enquiries")
    .select("*")
    .eq("reference", `IMTQSD${m[1]}`)
    .maybeSingle();
  return data ?? null;
}

async function matchCustomer(admin: any, email: string) {
  if (!email) return null;
  const { data: primary } = await admin
    .from("customers")
    .select("id, account_number, company_name, title, primary_email, account_manager_id")
    .ilike("primary_email", email)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (primary) return primary;
  const { data: contact } = await admin
    .from("customer_contacts")
    .select("customer_id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (contact?.customer_id) {
    const { data: customer } = await admin
      .from("customers")
      .select("id, account_number, company_name, title, primary_email, account_manager_id")
      .eq("id", contact.customer_id)
      .maybeSingle();
    return customer ?? null;
  }
  return null;
}

/** Pick the AM: customer's owner, else the least-loaded manager. */
async function resolveAm(admin: any, customerId: string | null | undefined) {
  if (customerId) {
    const { data: customer } = await admin
      .from("customers")
      .select("account_manager_id")
      .eq("id", customerId)
      .maybeSingle();
    if (customer?.account_manager_id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", customer.account_manager_id)
        .maybeSingle();
      if (profile) return profile;
    }
  }
  const managers = await listAccountManagerRecords(admin);
  return managers.sort((a: any, b: any) => a.customer_count - b.customer_count)[0] ?? null;
}

function escapeHtml(s: string): string {
  const AMP = String.fromCharCode(38);
  const LT = String.fromCharCode(60);
  const GT = String.fromCharCode(62);
  const QUOT = String.fromCharCode(34);
  return s
    .split(AMP).join(AMP + "amp;")
    .split(LT).join(AMP + "lt;")
    .split(GT).join(AMP + "gt;")
    .split(QUOT).join(AMP + "quot;");
}


function textToHtml(s: string): string {
  return escapeHtml(s)
    .replace(/\r?\n{2,}/g, "</p><p>")
    .replace(/\r?\n/g, "<br/>");
}

/** Shared IMT footer used on every inbox email. */
function brandFooter(): string {
  return `
  <div style="margin-top:24px;padding-top:18px;border-top:1px solid #eff1f5;font-family:Arial,Helvetica,sans-serif;color:#3b4658;line-height:1.55">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
      <tr>
        <td style="width:42px;padding:0 12px 0 0;border-right:2px solid #16233f;vertical-align:top;text-align:center">
          <div style="width:24px;height:24px;line-height:24px;border-radius:50%;background:#16233f;color:#fff;font-size:12px;font-weight:700;text-align:center;margin:0 auto 7px">●</div>
          <div style="width:24px;height:24px;line-height:24px;border-radius:50%;background:#16233f;color:#fff;font-size:12px;font-weight:700;text-align:center;margin:0 auto 7px">@</div>
          <div style="width:24px;height:24px;line-height:24px;border-radius:50%;background:#16233f;color:#fff;font-size:12px;font-weight:700;text-align:center;margin:0 auto 7px">☎</div>
          <div style="width:24px;height:24px;line-height:24px;border-radius:50%;background:#16233f;color:#fff;font-size:12px;font-weight:700;text-align:center;margin:0 auto">⌖</div>
        </td>
        <td style="padding:0 0 0 16px;vertical-align:top">
          <div style="font-size:19px;line-height:23px;font-weight:700;color:#0b1220">IMT Solutions</div>
          <div style="font-size:13px;line-height:19px;font-weight:600;color:#1f6be0;margin:2px 0 8px">Sales Team · IMT Solutions</div>
          <div style="font-size:12px;line-height:19px"><b style="color:#1f6be0">w:</b> <a href="https://imtsolutions.co.zw" style="color:#1f6be0;text-decoration:none">imtsolutions.co.zw</a> &nbsp;·&nbsp; <b style="color:#1f6be0">e:</b> <a href="mailto:${SALES_INBOX}" style="color:#1f6be0;text-decoration:none">${SALES_INBOX}</a></div>
          <div style="font-size:12px;line-height:19px"><b style="color:#1f6be0">m:</b> ${AM_PHONE}</div>
          <div style="font-size:12px;line-height:19px"><b style="color:#1f6be0">a:</b> IMT Solutions, Harare, Zimbabwe</div>
        </td>
      </tr>
    </table>
    <div style="color:#7b8798;font-size:9px;line-height:15px;margin:18px 0 16px;text-align:justify">CONFIDENTIALITY NOTICE: This email and its attachments are intended solely for the named recipient and may contain confidential, privileged or copyright information. If you received it in error, please notify the sender, delete it, and do not copy, share or act on its contents.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0;border:0">
      <tr>
        <td style="width:43%;padding:20px;background:#ffffff;vertical-align:middle"><img src="https://management.imtsolutions.co.zw/__l5e/assets-v1/97880e6d-84db-4b70-99fe-3b27a1da5f49/imt-solutions-logo.png" alt="IMT Solutions" width="150" height="35" style="display:block;border:0;max-width:100%;height:auto" /></td>
        <td style="width:57%;padding:19px 22px;background:#1f6be0;vertical-align:middle"><div style="color:#ffffff;font-size:16px;line-height:21px;font-weight:700">Connect. Protect. Grow.</div><div style="color:#d9edff;font-size:10px;line-height:15px;font-weight:600;margin-top:5px">Business technology that keeps you moving.</div></td>
      </tr>
    </table>
  </div>`;
}

/** Acknowledgement sent automatically for every brand-new enquiry. */
function ackHtml(reference: string, contactName: string | null, subject: string): string {
  const name = contactName ? escapeHtml(contactName) : "Customer";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:14px;line-height:1.7">
  <p>Dear ${name},</p>
  <p><strong>Your enquiry has been logged with our Sales Team. Your enquiry reference is ${escapeHtml(reference)}.</strong></p>
  <p>Subject received: <em>${escapeHtml(subject)}</em></p>
  <p>An Account Manager will respond to you shortly. Please quote the reference above in any follow-up so we can continue this conversation without delay.</p>
  <p>Kind regards,<br/><strong>IMT Solutions Sales Team</strong></p>
  ${brandFooter()}
</div>`;
}

/** Compose the outbound reply email (reply body + signature + quoted history). */
function replyHtml(opts: {
  amName: string;
  amRole: string;
  amEmail: string;
  reference: string;
  replyText: string;
  quotes: { from: string; at: string; text: string | null; direction: string }[];
}): string {
  const quotesHtml = opts.quotes
    .map(
      (q) => `<div style="margin:8px 0 0;padding:8px 12px;border-left:3px solid #d1d5db;color:#4b5563;font-size:12px">
      <div style="color:#6b7280;margin-bottom:2px"><strong>${escapeHtml(q.from)}</strong> &middot; ${escapeHtml(new Date(q.at).toLocaleString("en-GB", { timeZone: "Africa/Harare" }))}</div>
      ${escapeHtml((q.text ?? "").slice(0, 1200))}
    </div>`,
    )
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:14px;line-height:1.7">
  <div>${textToHtml(opts.replyText)}</div>
  <p style="margin-top:20px">Kind regards,<br/><strong>${escapeHtml(opts.amName)}</strong><br/>
  <span style="color:#6b7280;font-size:12px">${escapeHtml(opts.amRole)} &middot; IMT Solutions<br/>${escapeHtml(opts.amEmail)} &middot; ${AM_PHONE}</span></p>
  ${quotesHtml ? `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">--- Previous messages ---</div>${quotesHtml}` : ""}
  ${brandFooter()}
</div>`;
}

/** Send an email through Resend from an @imtsolutions.co.zw address. */
export async function sendInboxEmail(opts: {
  from: string;
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Uint8Array | string; contentType?: string }>;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  // Preferred path: the IMT website email gateway (holds the Resend connection).
  const gatewayUrl = process.env.IMT_EMAIL_GATEWAY_URL;
  const gatewayKey = process.env.IMT_EMAIL_API_KEY;
  if (gatewayUrl && gatewayKey) {
    const fromAddr = extractEmail(opts.from);
    if (!fromAddr.endsWith(`@${MAIL_DOMAIN}`)) return { ok: false, error: `Sender must be @${MAIL_DOMAIN}` };
    const payload: Record<string, unknown> = {
      // Gateway validates `from` as a bare email address (no display name).
      from: fromAddr,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    };
    if (opts.cc?.length) payload.cc = opts.cc;
    if (opts.replyTo) payload.reply_to = opts.replyTo;
    if (opts.headers) payload.headers = opts.headers;
    if (opts.attachments?.length) {
      payload.attachments = opts.attachments.map((attachment) => ({
        filename: attachment.filename,
        content: typeof attachment.content === "string"
          ? attachment.content
          : Buffer.from(attachment.content).toString("base64"),
        content_type: attachment.contentType ?? "application/octet-stream",
      }));
    }
    try {
      const res = await fetch(`${gatewayUrl.replace(/\/$/, "")}/api/public/email/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${gatewayKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const bodyText = await res.text();
      if (!res.ok) {
        console.error(`[inbox] gateway send failed [${res.status}]: ${bodyText}`);
        return { ok: false, error: `Gateway ${res.status}: ${bodyText.slice(0, 400)}` };
      }
      let parsed: any = {};
      try { parsed = JSON.parse(bodyText); } catch { /* non-JSON ok */ }
      return { ok: true, id: String(parsed.id ?? parsed.provider_id ?? parsed.data?.id ?? "") };
    } catch (e: any) {
      return { ok: false, error: `Gateway unreachable: ${String(e?.message ?? e)}` };
    }
  }
  try {
    const body: Record<string, unknown> = {
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    };
    if (opts.cc?.length) body.cc = opts.cc;
    if (opts.replyTo) body.reply_to = opts.replyTo;
    if (opts.headers) body.headers = opts.headers;
    if (opts.attachments?.length) {
      body.attachments = opts.attachments.map((attachment) => ({
        filename: attachment.filename,
        content: typeof attachment.content === "string"
          ? attachment.content
          : Buffer.from(attachment.content).toString("base64"),
        content_type: attachment.contentType ?? "application/octet-stream",
      }));
    }
    const res = await resendRequest<{ id?: string }>("POST", "/emails", body);
    return { ok: true, id: res.id ?? "" };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/** Read message history from the IMT website email gateway. */
export async function listGatewayMessages(q: {
  direction?: "inbound" | "outbound";
  since?: string;
  mailbox?: string;
  thread_id?: string;
  limit?: number;
}): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  const gatewayUrl = process.env.IMT_EMAIL_GATEWAY_URL;
  const gatewayKey = process.env.IMT_EMAIL_API_KEY;
  if (!gatewayUrl || !gatewayKey) return { ok: false, error: "Email gateway is not configured" };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") params.set(k, String(v));
  const res = await fetch(`${gatewayUrl.replace(/\/$/, "")}/api/public/email/messages?${params}`, {
    headers: { Authorization: `Bearer ${gatewayKey}` },
  });
  const bodyText = await res.text();
  if (!res.ok) return { ok: false, error: `Gateway ${res.status}: ${bodyText.slice(0, 400)}` };
  try { return { ok: true, data: JSON.parse(bodyText) }; } catch { return { ok: true, data: bodyText }; }
}

interface InboundEvent {
  data?: {
    email_id?: string;
    message_id?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    subject?: string;
  };
}

/**
 * Ingest one email.received webhook event: dedupe, match/patch the enquiry,
 * store message + attachments, reopen if needed, auto-ack new enquiries.
 */
export async function ingestReceivedEmail(event: InboundEvent): Promise<IngestResult> {
  const emailId = event.data?.email_id;
  const fromEmail = extractEmail(event.data?.from);
  if (!emailId || !fromEmail) return { status: "skipped", error: "missing email_id or from" };
  let full: any = null;
  let attachments: any[] = [];
  try {
    full = await resendRequest("GET", `/emails/receiving/${emailId}`);
    const list = await resendRequest<{ data?: any[] }>("GET", `/emails/receiving/${emailId}/attachments`);
    attachments = list.data ?? [];
  } catch (e: any) {
    console.error("[inbox] receiving fetch failed:", e?.message);
  }
  const headers = full?.headers ?? {};
  return ingestNormalizedEmail({
    providerId: emailId,
    messageId: headers["message-id"] ?? event.data?.message_id ?? null,
    from: headers.from ?? event.data?.from ?? "",
    to: event.data?.to ?? [],
    cc: event.data?.cc ?? [],
    subject: headers.subject ?? event.data?.subject ?? null,
    html: full?.html ?? null,
    text: full?.text ?? null,
    inReplyTo: headers["in-reply-to"] ?? null,
    references: headers["references"] ?? null,
    attachments: attachments.map((a) => ({
      filename: a.filename || a.name || "attachment",
      content_type: a.content_type ?? a.contentType ?? null,
      size_bytes: a.size_bytes ?? a.size ?? null,
      attachment_id: a.id ?? null,
    })),
  });
}

type IngestResult = {
  status: "created" | "appended" | "duplicate" | "skipped";
  reference?: string;
  error?: string;
};

export interface NormalizedInbound {
  providerId: string;
  messageId?: string | null;
  from: string;
  to?: string[];
  cc?: string[];
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  receivedAt?: string | null;
  attachments?: Array<{ filename: string; content_type?: string | null; size_bytes?: number | null; attachment_id?: string | null }>;
  /** Gateway-supplied enquiry reference / contact name to prefer when creating. */
  referenceHint?: string | null;
  contactNameHint?: string | null;
}

/** Most recent open enquiry from the same sender in the last 30 days. */
async function findRecentOpenEnquiry(admin: any, email: string) {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data } = await admin
    .from("email_enquiries")
    .select("*")
    .ilike("contact_email", email)
    .neq("status", "closed")
    .gte("last_message_at", since)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * Core ingest shared by Resend webhooks and the IMT website email gateway.
 */
export async function ingestNormalizedEmail(input: NormalizedInbound): Promise<IngestResult> {
  const emailId = input.providerId;
  const fromEmail = extractEmail(input.from);
  if (!emailId || !fromEmail) return { status: "skipped", error: "missing provider_id or from" };
  const admin = adminClient();

  const { data: dupe } = await admin
    .from("email_messages")
    .select("id")
    .eq("resend_email_id", emailId)
    .limit(1)
    .maybeSingle();
  if (dupe) return { status: "duplicate" };

  const attachments = input.attachments ?? [];
  const rawMessageId = stripMessageId(input.messageId);
  if (rawMessageId) {
    const { data: dupe2 } = await admin
      .from("email_messages")
      .select("id")
      .eq("message_id", rawMessageId)
      .limit(1)
      .maybeSingle();
    if (dupe2) return { status: "duplicate" };
  }

  const inReplyTo = input.inReplyTo ?? null;
  const references = input.references ?? null;
  const subject = (input.subject || "(no subject)").toString().slice(0, 300);
  const text: string | null = input.text ?? null;
  const html: string | null = input.html ?? null;
  const event = { data: { from: input.from, to: input.to ?? [], cc: input.cc ?? [] } };
  const headers: Record<string, string> = {};

  // 1. Threading: In-Reply-To / References, then the enquiry reference, else a new enquiry.
  let enquiry = await findEnquiryByChain(admin, inReplyTo, references);
  if (!enquiry) enquiry = await findEnquiryByReference(admin, `${subject} ${text ?? ""}`);
  if (!enquiry && input.referenceHint) enquiry = await findEnquiryByReference(admin, input.referenceHint);
  if (!enquiry) enquiry = await findRecentOpenEnquiry(admin, fromEmail);

  const customer = enquiry?.customer_id
    ? (await admin.from("customers").select("id, account_number, company_name, title, account_manager_id").eq("id", enquiry.customer_id).maybeSingle()).data
    : await matchCustomer(admin, fromEmail);
  const contactName =
    extractName(headers.from ?? event.data?.from) ?? input.contactNameHint ?? enquiry?.contact_name ?? null;

  if (!enquiry) {
    const am = await resolveAm(admin, customer?.id);
    const { data: reference } = await admin.rpc("next_enquiry_reference");
    const { data: created, error } = await admin
      .from("email_enquiries")
      .insert({
        reference: reference || `IMTQSD${Math.floor(10000 + Math.random() * 89999)}`,
        customer_id: customer?.id ?? null,
        contact_email: fromEmail,
        contact_name: contactName,
        subject,
        status: "open",
        assigned_am_id: am?.id ?? null,
        assigned_at: am ? new Date().toISOString() : null,
        message_count: 0,
        last_message_at: new Date().toISOString(),
        last_inbound_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) return { status: "skipped", error: error.message };
    enquiry = created;
  }

  // Store the inbound message.
  const { data: message, error: msgError } = await admin
    .from("email_messages")
    .insert({
      enquiry_id: enquiry.id,
      direction: "inbound",
      from_address: fromEmail,
      to_address: (event.data?.to ?? []).join(", ") || SALES_INBOX,
      cc_address: (event.data?.cc ?? []).join(", ") || null,
      subject,
      body_html: html,
      body_text: text,
      message_id: rawMessageId || null,
      in_reply_to: inReplyTo ? stripMessageId(inReplyTo) : null,
      references_header: references ?? null,
      resend_email_id: emailId,
      delivery_status: "received",
    })
    .select("*")
    .single();
  if (msgError) return { status: "skipped", error: msgError.message };

  if (attachments.length) {
    await admin.from("email_message_attachments").insert(
      attachments.map((a) => ({
        message_id: message.id,
        filename: a.filename || "attachment",
        content_type: a.content_type ?? null,
        size_bytes: a.size_bytes ?? null,
        attachment_id: a.attachment_id ?? null,
      })),
    );
  }

  const now = new Date().toISOString();
  await admin
    .from("email_enquiries")
    .update({
      last_message_at: now,
      last_inbound_at: now,
      message_count: (enquiry.message_count ?? 0) + 1,
      status: enquiry.status === "closed" ? "open" : "open",
      updated_at: now,
    })
    .eq("id", enquiry.id);

  if (customer?.id) {
    await recordCustomerEvent(admin, {
      customer_id: customer.id,
      account_number: customer.account_number,
      event_type: enquiry.last_inbound_at && enquiry.message_count === 0 ? "email_received" : "email_received",
      title: `Email received · ${enquiry.reference}`,
      description: subject,
      module: "inbox",
      entity_type: "email_enquiry",
      entity_id: enquiry.id,
      major: enquiry.message_count === 0,
    });
  }

  // Notify the assigned AM in-app.
  if (enquiry.assigned_am_id) {
    await admin.from("notifications").insert({
      user_id: enquiry.assigned_am_id,
      kind: enquiry.message_count === 0 ? "enquiry_new" : "enquiry_reply",
      title: enquiry.message_count === 0 ? `New enquiry ${enquiry.reference}` : `Reply on ${enquiry.reference}`,
      body: `${contactName ?? fromEmail}: ${subject}`,
      link: `/inbox?enquiry=${enquiry.id}`,
    });
  }

  const isNew = enquiry.message_count === 0;

  // Auto-acknowledge brand-new enquiries from the sales inbox.
  if (isNew) {
    const ackText = `Dear ${contactName ?? "Customer"},\n\nYour enquiry has been logged with our Sales Team. Your enquiry reference is ${enquiry.reference}.\n\nAn Account Manager will respond shortly. Please quote ${enquiry.reference} in any follow-up.\n\nKind regards,\nIMT Solutions Sales Team`;
    const result = await sendInboxEmail({
      from: `IMT Solutions Sales <${SALES_INBOX}>`,
      to: fromEmail,
      subject: `Re: ${subject} [${enquiry.reference}]`,
      html: ackHtml(enquiry.reference, contactName, subject),
      text: ackText,
      headers: rawMessageId
        ? {
            "Message-ID": `<ack-${randomUUID()}@${MAIL_DOMAIN}>`,
            "In-Reply-To": `<${rawMessageId}>`,
            References: `<${rawMessageId}>`,
          }
        : undefined,
    });
    await admin.from("email_messages").insert({
      enquiry_id: enquiry.id,
      direction: "outbound",
      from_address: SALES_INBOX,
      to_address: fromEmail,
      subject: `Re: ${subject}`,
      body_html: ackHtml(enquiry.reference, contactName, subject),
      body_text: ackText,
      resend_email_id: result.ok ? result.id : null,
      delivery_status: result.ok ? "sent" : "failed",
      delivery_error: result.ok ? null : result.error,
    });
    if (result.ok) {
      await admin
        .from("email_enquiries")
        .update({
          message_count: (enquiry.message_count ?? 0) + 2,
          status: "open",
          last_message_at: new Date().toISOString(),
        })
        .eq("id", enquiry.id);
    }
  }

  return { status: isNew ? "created" : "appended", reference: enquiry.reference };
}

// ---------------------------------------------------------------------------
// Outbound AM reply
// ---------------------------------------------------------------------------

export async function sendEnquiryReply(opts: {
  enquiryId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderEmail: string | null;
  body: string;
  cc?: string[];
  quoteId?: string | null;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const admin = adminClient();
  const { data: enquiry } = await admin.from("email_enquiries").select("*").eq("id", opts.enquiryId).maybeSingle();
  if (!enquiry) return { ok: false, error: "Enquiry not found" };
  if (!opts.body?.trim()) return { ok: false, error: "Reply message is empty" };

  // Their own verified @imtsolutions.co.zw address.
  const fromAddress = opts.senderEmail?.toLowerCase().endsWith(`@${MAIL_DOMAIN}`)
    ? opts.senderEmail.toLowerCase()
    : `${localPart(opts.senderEmail || opts.senderName)}@${MAIL_DOMAIN}`;
  const fromLine = `"${opts.senderName.replace(/["\\<>]/g, "")}" <${fromAddress}>`;

  const history = await admin
    .from("email_messages")
    .select("from_address, direction, body_text, created_at, message_id")
    .eq("enquiry_id", enquiry.id)
    .order("created_at", { ascending: true });
  const rows = history.data ?? [];
  const lastInbound = [...rows].reverse().find((m: any) => m.direction === "inbound");
  const chain = [
    ...rows.map((m: any) => m.message_id).filter(Boolean),
    lastInbound?.message_id ? stripMessageId(lastInbound.message_id) : null,
  ].filter(Boolean);

  const messageId = `<msg-${randomUUID()}@${MAIL_DOMAIN}>`;
  const headers: Record<string, string> = { "Message-ID": messageId };
  if (lastInbound?.message_id) {
    headers["In-Reply-To"] = `<${stripMessageId(lastInbound.message_id)}>`;
    const refs = [...new Set(chain)].map((id) => `<${id}>`).join(" ");
    if (refs) headers["References"] = refs;
  }

  const quotes = rows.slice(-5).map((m: any) => ({
    from: m.direction === "inbound" ? m.from_address : "IMT Solutions",
    at: m.created_at,
    text: m.body_text,
    direction: m.direction,
  }));

  const html = replyHtml({
    amName: opts.senderName,
    amRole: opts.senderRole,
    amEmail: fromAddress,
    reference: enquiry.reference,
    replyText: opts.body,
    quotes,
  });
  const text = `${opts.body}\n\n---\n${opts.senderName} · ${opts.senderRole} · IMT Solutions · ${AM_PHONE}\nEnquiry reference: ${enquiry.reference}`;
  const baseSubject = enquiry.subject.startsWith("Re:") ? enquiry.subject : `Re: ${enquiry.subject}`;
  const taggedSubject = new RegExp(enquiry.reference, "i").test(baseSubject)
    ? baseSubject
    : `${baseSubject} [${enquiry.reference}]`;

  let quoteAttachment: { filename: string; content: Uint8Array; contentType: string; quoteId: string } | null = null;
  if (opts.quoteId) {
    const { data: quote } = await admin
      .from("quotes")
      .select("id, quote_number, title, customer_id, studio_document_id")
      .eq("id", opts.quoteId)
      .maybeSingle();
    if (!quote) return { ok: false, error: "Quotation not found" };
    if (enquiry.customer_id && quote.customer_id !== enquiry.customer_id) {
      return { ok: false, error: "This quotation belongs to a different customer" };
    }
    const { quoteStudio } = await import("./quote-studio.server");
    if (!quote.studio_document_id) return { ok: false, error: "Generate the quotation document before attaching it" };
    const pdf = await quoteStudio.documentPdf(quote.studio_document_id, { userId: opts.senderId, userName: opts.senderName });
    if (!pdf.ok) return { ok: false, error: pdf.error };
    quoteAttachment = {
      filename: `${quote.quote_number || quote.title || "quotation"}.pdf`.replace(/[^\w.-]+/g, "-"),
      content: pdf.data.bytes,
      contentType: "application/pdf",
      quoteId: quote.id,
    };
  }

  const result = await sendInboxEmail({
    from: fromLine,
    to: enquiry.contact_email,
    cc: opts.cc?.filter(Boolean),
    subject: taggedSubject,
    html,
    text,
    headers,
    replyTo: fromAddress,
    attachments: quoteAttachment ? [quoteAttachment] : undefined,
  });

  const now = new Date().toISOString();
  const { data: message, error } = await admin
    .from("email_messages")
    .insert({
      enquiry_id: enquiry.id,
      direction: "outbound",
      from_address: fromAddress,
      to_address: enquiry.contact_email,
      cc_address: opts.cc?.filter(Boolean).join(", ") || null,
      subject: taggedSubject,
      body_html: html,
      body_text: opts.body,
      message_id: stripMessageId(messageId),
      in_reply_to: lastInbound?.message_id ? stripMessageId(lastInbound.message_id) : null,
      references_header: headers["References"] ?? null,
      resend_email_id: result.ok && result.id ? result.id : null,
      delivery_status: result.ok ? "sent" : "failed",
      delivery_error: result.ok ? null : result.error,
      created_by: opts.senderId,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };

  if (quoteAttachment) {
    const storagePath = `${enquiry.id}/${message.id}/${quoteAttachment.filename}`;
    const { error: uploadError } = await admin.storage
      .from("email-attachments")
      .upload(storagePath, quoteAttachment.content, { contentType: quoteAttachment.contentType, upsert: false });
    if (uploadError) console.error("[inbox] quotation archive failed:", uploadError.message);
    await admin.from("email_message_attachments").insert({
      message_id: message.id,
      filename: quoteAttachment.filename,
      content_type: quoteAttachment.contentType,
      size_bytes: quoteAttachment.content.byteLength,
      attachment_id: result.ok ? result.id : null,
      storage_path: uploadError ? null : storagePath,
      quote_id: quoteAttachment.quoteId,
    });
  }

  await admin
    .from("email_enquiries")
    .update({
      status: result.ok ? "awaiting_customer" : "open",
      last_message_at: now,
      message_count: (enquiry.message_count ?? 0) + 1,
      updated_at: now,
    })
    .eq("id", enquiry.id);

  if (enquiry.customer_id) {
    const customer = (await admin.from("customers").select("account_number").eq("id", enquiry.customer_id).maybeSingle()).data;
    if (customer) {
      await recordCustomerEvent(admin, {
        customer_id: enquiry.customer_id,
        account_number: customer.account_number,
        event_type: "communication_sent",
        title: `Reply sent · ${enquiry.reference}`,
        description: opts.body.slice(0, 240),
        module: "inbox",
        entity_type: "email_enquiry",
        entity_id: enquiry.id,
        major: false,
        actor_id: opts.senderId,
      });
    }
  }

  return result.ok ? { ok: true, messageId: message.id } : { ok: false, error: result.error };
}

export async function createAndSendEnquiryEmail(opts: {
  senderId: string;
  senderName: string;
  senderRole: string;
  senderEmail: string | null;
  to: string;
  subject: string;
  body: string;
  cc?: string[];
  customerId?: string | null;
  quoteId?: string | null;
}): Promise<{ ok: true; enquiryId: string; messageId: string } | { ok: false; error: string }> {
  const admin = adminClient();
  const contactEmail = extractEmail(opts.to);
  if (!contactEmail) return { ok: false, error: "Enter a valid recipient email" };
  const customer = opts.customerId
    ? (await admin.from("customers").select("id, account_number, company_name").eq("id", opts.customerId).maybeSingle()).data
    : await matchCustomer(admin, contactEmail);
  const { data: reference } = await admin.rpc("next_enquiry_reference");
  const { data: enquiry, error } = await admin.from("email_enquiries").insert({
    reference,
    customer_id: customer?.id ?? null,
    contact_email: contactEmail,
    contact_name: customer?.company_name ?? null,
    subject: opts.subject.trim(),
    status: "open",
    assigned_am_id: opts.senderId,
    assigned_by: opts.senderId,
    assigned_at: new Date().toISOString(),
    message_count: 0,
    last_message_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !enquiry) return { ok: false, error: error?.message ?? "Could not create conversation" };
  const sent = await sendEnquiryReply({
    enquiryId: enquiry.id,
    senderId: opts.senderId,
    senderName: opts.senderName,
    senderRole: opts.senderRole,
    senderEmail: opts.senderEmail,
    body: opts.body,
    cc: opts.cc,
    quoteId: opts.quoteId,
  });
  return sent.ok ? { ok: true, enquiryId: enquiry.id, messageId: sent.messageId } : sent;
}

/** Fresh, short-lived download URLs for a received email's attachments. */
export async function getAttachmentDownloadUrl(emailId: string, attachmentId: string): Promise<{ url?: string; error?: string }> {
  if (/^https?:\/\//i.test(attachmentId)) return { url: attachmentId };
  try {
    const res = await resendRequest<{ download_url?: string; data?: { download_url?: string } }>(
      "GET",
      `/emails/receiving/${emailId}/attachments/${attachmentId}`,
    );
    const url = res.download_url ?? res.data?.download_url;
    return url ? { url } : { error: "No download URL returned" };
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}

export async function getStoredAttachmentDownloadUrl(storagePath: string): Promise<{ url?: string; error?: string }> {
  const { data, error } = await adminClient().storage.from("email-attachments").createSignedUrl(storagePath, 300);
  return error ? { error: error.message } : { url: data?.signedUrl };
}
