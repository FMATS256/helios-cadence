import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getAttachmentDownloadUrl,
  getStoredAttachmentDownloadUrl,
  sendEnquiryReply,
  createAndSendEnquiryEmail,
  retryFailedMessageSend,
  adminClient,
} from "./inbox.server";
import type { EnquiryListItem, EnquiryThread, InboxMessage } from "./inbox.shared";
import { mailboxesForRoles, type EmailDraft, type EmailOrganization } from "./inbox.shared";

const AM_OR_ADMIN_ROLES = [
  "master_admin",
  "operations_manager",
  "key_account_manager",
  "corporate_account_manager",
  "customer_account_manager",
  "account_manager",
  "finance",
  "sales", "technical_support", "cloud_engineer", "cyber_security", "noc",
];

async function amOrAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "master_admin",
  });
  if (isAdmin) return "master_admin";
  const { data: roleRows } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roles = (roleRows ?? []).map((r: any) => String(r.role));
  if (!roles.some((r: string) => AM_OR_ADMIN_ROLES.includes(r))) {
    throw new Error("You do not have permission to use the email inbox.");
  }
  return roles[0];
}

async function decorate(rows: any[]): Promise<EnquiryListItem[]> {
  if (!rows.length) return [];
  const admin = adminClient();
  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
  const amIds = [...new Set(rows.map((r) => r.assigned_am_id).filter(Boolean))];
  const [customersRes, profilesRes] = await Promise.all([
    customerIds.length
      ? admin.from("customers").select("id, account_number, company_name, title").in("id", customerIds)
      : Promise.resolve({ data: [] } as any),
    amIds.length
      ? admin.from("profiles").select("id, full_name").in("id", amIds)
      : Promise.resolve({ data: [] } as any),
  ]);
  const customers = new Map<string, any>((customersRes.data ?? []).map((c: any) => [c.id, c]));
  const profiles = new Map<string, any>((profilesRes.data ?? []).map((p: any) => [p.id, p]));
  const { data: replies } = await admin.from("email_messages").select("enquiry_id, sender_name, created_by").in("enquiry_id", rows.map((r) => r.id)).eq("direction", "outbound").eq("delivery_status", "sent").not("created_by", "is", null).order("created_at", { ascending: false }).limit(1000);
  const lastReply = new Map<string, string>();
  for (const reply of replies ?? []) if (!lastReply.has(reply.enquiry_id) && reply.sender_name) lastReply.set(reply.enquiry_id, reply.sender_name);
  return rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    subject: r.subject,
    contact_email: r.contact_email,
    contact_name: r.contact_name,
    status: r.status,
    message_count: r.message_count,
    last_message_at: r.last_message_at,
    last_inbound_at: r.last_inbound_at,
    assigned_am_id: r.assigned_am_id,
    customer_id: r.customer_id,
    customer_account_number: customers.get(r.customer_id)?.account_number ?? null,
    customer_name: customers.get(r.customer_id)?.company_name ?? customers.get(r.customer_id)?.title ?? null,
    am_name: profiles.get(r.assigned_am_id)?.full_name ?? null,
    replied_by: lastReply.get(r.id) ?? null,
    mailbox_address: r.mailbox_address,
  }));
}

export type InboxScope = "mine" | "unassigned" | "all";

export const listEnquiries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { scope?: InboxScope; status?: string; search?: string; folder?: "inbox" | "sent" | "archive"; mailbox?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const role = await amOrAdmin(context);
    let q = context.supabase
      .from("email_enquiries")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (data.scope === "mine") q = q.eq("assigned_am_id", context.userId);
    if (data.mailbox) { await authorizedMailbox(context, data.mailbox); q = q.eq("mailbox_address", data.mailbox); }
    if (data.scope === "unassigned") q = q.is("assigned_am_id", null);
    if (data.folder === "archive") q = q.not("archived_at", "is", null);
    else q = q.is("archived_at", null);
    if (data.folder === "sent") {
      const { data: sent } = await context.supabase
        .from("email_messages")
        .select("enquiry_id")
        .eq("direction", "outbound")
        .eq("created_by", context.userId);
      const ids = [...new Set((sent ?? []).map((row: any) => row.enquiry_id))];
      if (!ids.length) return { enquiries: [], canAssign: role === "master_admin" || role === "operations_manager" };
      q = q.in("id", ids);
    }
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.search?.trim()) {
      const s = data.search.trim();
      q = q.or(`reference.ilike.%${s}%,subject.ilike.%${s}%,contact_email.ilike.%${s}%,contact_name.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return {
      enquiries: await decorate(rows ?? []),
      canAssign: role === "master_admin" || role === "operations_manager",
    };
  });

/** Managers available for (re)assignment — admins only. */
export const listManagers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "master_admin",
    });
    const { data: isOps } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "operations_manager",
    });
    if (!isAdmin && !isOps) return [];
    const { listAccountManagerRecords } = await import("./account-managers.server");
    const managers = await listAccountManagerRecords(adminClient());
    return managers.map((m: any) => ({ id: m.id, full_name: m.full_name, email: m.email, role_label: m.role_label }));
  });

export const getEnquiryThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enquiryId: string }) => input)
  .handler(async ({ data, context }) => {
    await amOrAdmin(context);
    const { data: enquiry, error } = await context.supabase
      .from("email_enquiries")
      .select("*")
      .eq("id", data.enquiryId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!enquiry) throw new Error("Enquiry not found or not visible to you");
    const { data: messages } = await context.supabase
      .from("email_messages")
      .select("*, attachments:email_message_attachments(id, filename, content_type, size_bytes, content_id, storage_path, attachment_id)")
      .eq("enquiry_id", data.enquiryId)
      .order("created_at", { ascending: true });
    const [decorated] = await decorate([enquiry]);
    const renderedMessages = await Promise.all((messages ?? []).map(async (message: any) => {
      let html = message.body_html ?? null;
      for (const attachment of message.attachments ?? []) {
        if (!html || !attachment.content_id) continue;
        const link = attachment.storage_path ? await getStoredAttachmentDownloadUrl(attachment.storage_path) : await getAttachmentDownloadUrl(message.resend_email_id ?? "", attachment.attachment_id ?? "");
        if (link.url?.startsWith("https://")) html = html.split(`cid:${String(attachment.content_id).replace(/^<|>$/g, "")}`).join(link.url.replace(/&/g, "&amp;"));
      }
      const { bcc_address: _privateBcc, ...safe } = message;
      return { ...safe, body_html: html, attachments: (message.attachments ?? []).map((a: any) => ({ id: a.id, filename: a.filename, content_type: a.content_type, size_bytes: a.size_bytes })) };
    }));
    return {
      enquiry: { ...decorated, created_at: enquiry.created_at, assigned_at: enquiry.assigned_at },
      messages: renderedMessages as unknown as InboxMessage[],
    } satisfies EnquiryThread;
  });

type ComposerFileInput = { filename: string; contentType?: string; base64: string };
const MAX_ATTACH_BYTES = 15 * 1024 * 1024;
function checkFiles(files?: ComposerFileInput[]) {
  if (!files?.length) return undefined;
  if (files.length > 10) throw new Error("You can attach up to 10 files");
  const total = files.reduce((sum, f) => sum + Math.floor((f.base64?.length ?? 0) * 0.75), 0);
  if (total > MAX_ATTACH_BYTES) throw new Error("Attachments are larger than 15 MB in total");
  return files;
}
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
function checkAddresses(list: string[] | undefined, label: string) {
  const clean = (list ?? []).map((a) => a.trim()).filter(Boolean);
  const bad = clean.find((a) => !EMAIL_RE.test(a));
  if (bad) throw new Error(`${label}: "${bad}" is not a valid email address`);
  return clean.length ? clean : undefined;
}

export const replyToEnquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enquiryId: string; body: string; bodyHtml?: string | null; cc?: string[]; bcc?: string[]; quoteId?: string | null; files?: ComposerFileInput[]; mailbox?: string }) => input)
  .handler(async ({ data, context }) => {
    const role = await amOrAdmin(context);
    const { data: visible } = await context.supabase.from("email_enquiries").select("id").eq("id", data.enquiryId).maybeSingle();
    if (!visible) throw new Error("Enquiry not found or not visible to you");
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const roleLabel = String(role)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const result = await sendEnquiryReply({
      enquiryId: data.enquiryId,
      senderId: context.userId,
      senderName: profile?.full_name || "IMT Solutions",
      senderRole: roleLabel,
      senderEmail: profile?.email ?? null,
      mailbox: await authorizedMailbox(context, data.mailbox),
      signatureHtml: await personalSignature(context),
      body: data.body,
      bodyHtml: data.bodyHtml,
      cc: checkAddresses(data.cc, "Cc"),
      bcc: checkAddresses(data.bcc, "Bcc"),
      quoteId: data.quoteId,
      files: checkFiles(data.files),
    });
    if (!result.ok) throw new Error(result.error);
    return result;
  });

export const retryFailedMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string }) => input)
  .handler(async ({ data, context }) => {
    await amOrAdmin(context);
    // RLS scope check: the message must be visible to this user.
    const { data: visible } = await context.supabase
      .from("email_messages")
      .select("id")
      .eq("id", data.messageId)
      .maybeSingle();
    if (!visible) throw new Error("Message not found or not visible to you");
    const result = await retryFailedMessageSend(data.messageId);
    if (!result.ok) throw new Error(result.error);
    return result;
  });

export const composeEnquiryEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { to: string; subject: string; body: string; bodyHtml?: string | null; cc?: string[]; bcc?: string[]; customerId?: string | null; quoteId?: string | null; files?: ComposerFileInput[]; mailbox?: string }) => input)
  .handler(async ({ data, context }) => {
    const role = await amOrAdmin(context);
    if (!data.subject?.trim()) throw new Error("Subject is required");
    if (!data.body?.trim()) throw new Error("Message is required");
    const { data: profile } = await context.supabase.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle();
    const roleLabel = String(role).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const result = await createAndSendEnquiryEmail({
      senderId: context.userId,
      senderName: profile?.full_name || "IMT Solutions",
      senderRole: roleLabel,
      senderEmail: profile?.email ?? null,
      mailbox: await authorizedMailbox(context, data.mailbox),
      signatureHtml: await personalSignature(context),
      to: data.to,
      subject: data.subject,
      body: data.body,
      bodyHtml: data.bodyHtml,
      cc: checkAddresses(data.cc, "Cc"),
      bcc: checkAddresses(data.bcc, "Bcc"),
      customerId: data.customerId,
      quoteId: data.quoteId,
      files: checkFiles(data.files),
    });
    if (!result.ok) throw new Error(result.error);
    return result;
  });

export const assignEnquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enquiryId: string; amId: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "master_admin",
    });
    const { data: isOps } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "operations_manager",
    });
    if (!isAdmin && !isOps) throw new Error("Only administrators can reassign enquiries.");
    const admin = adminClient();
    const patch: Record<string, unknown> = {
      assigned_am_id: data.amId,
      assigned_by: context.userId,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("email_enquiries").update(patch).eq("id", data.enquiryId);
    if (error) throw new Error(error.message);
    if (data.amId) {
      const enquiry = (await admin.from("email_enquiries").select("reference").eq("id", data.enquiryId).maybeSingle()).data;
      await admin.from("notifications").insert({
        user_id: data.amId,
        kind: "enquiry_assigned",
        title: `Enquiry ${enquiry?.reference ?? ""} assigned to you`,
        body: "A customer enquiry has been assigned to you in the email inbox.",
        link: `/inbox?enquiry=${data.enquiryId}`,
      });
    }
    return { ok: true };
  });

export const setEnquiryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enquiryId: string; status: "open" | "awaiting_customer" | "closed" }) => input)
  .handler(async ({ data, context }) => {
    await amOrAdmin(context);
    const { error } = await context.supabase
      .from("email_enquiries")
      .update({
        status: data.status,
        closed_at: data.status === "closed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.enquiryId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Fresh short-lived download link for an inbound attachment. */
export const getAttachmentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string; attachmentId: string }) => input)
  .handler(async ({ data, context }) => {
    await amOrAdmin(context);
    const { data: att } = await context.supabase
      .from("email_message_attachments")
      .select("attachment_id, storage_path")
      .eq("id", data.attachmentId)
      .eq("message_id", data.messageId)
      .maybeSingle();
    if (!att) throw new Error("Attachment not found or not visible to you");
    if (att?.storage_path) return getStoredAttachmentDownloadUrl(att.storage_path);
    const { data: message } = await context.supabase
      .from("email_messages")
      .select("resend_email_id")
      .eq("id", data.messageId)
      .maybeSingle();
    if (!message?.resend_email_id) throw new Error("Attachment source email not found");
    return getAttachmentDownloadUrl(message.resend_email_id, att?.attachment_id ?? data.attachmentId);
  });

async function authorizedMailbox(context: any, requested?: string) {
  const { data, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const addresses = mailboxesForRoles((data ?? []).map((r: any) => String(r.role))).flatMap((d) => d.addresses);
  const address = requested || addresses[0];
  if (!address || !addresses.includes(address)) throw new Error("This mailbox is not available to your department");
  return address;
}
async function personalSignature(context: any) {
  const { data } = await context.supabase.from("email_workspace_preferences").select("signature_html").eq("user_id", context.userId).maybeSingle();
  return data?.signature_html || "";
}
export const getEmailWorkspace = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await amOrAdmin(context);
  const [{ data: roles }, { data: preferences }] = await Promise.all([
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    context.supabase.from("email_workspace_preferences").select("*").eq("user_id", context.userId).maybeSingle(),
  ]);
  return { departments: mailboxesForRoles((roles ?? []).map((r: any) => String(r.role))), drafts: (preferences?.drafts ?? {}) as Record<string, EmailDraft>, organization: (preferences?.organization ?? {}) as Record<string, EmailOrganization>, signatureHtml: preferences?.signature_html ?? "" };
});
export const saveEmailWorkspace = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: { field: "drafts" | "organization" | "signature_html"; key?: string; value: EmailDraft | EmailOrganization | string | null }) => input)
  .handler(async ({ data, context }) => {
    await amOrAdmin(context);
    if (!["drafts", "organization", "signature_html"].includes(data.field)) throw new Error("Invalid preference");
    if (JSON.stringify(data.value).length > 22 * 1024 * 1024) throw new Error("Draft is too large");
    const { error } = await context.supabase.rpc("save_email_workspace_value", { p_field: data.field, p_key: data.key ?? "", p_value: data.value });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const emailInternalNotes = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: { enquiryId: string; body?: string }) => input)
  .handler(async ({ data, context }) => {
    await amOrAdmin(context);
    const { data: visible } = await context.supabase.from("email_enquiries").select("id").eq("id", data.enquiryId).maybeSingle();
    if (!visible) throw new Error("Enquiry not visible");
    if (data.body?.trim()) {
      if (data.body.length > 5000) throw new Error("Note is too long");
      const { error } = await context.supabase.from("email_internal_notes").insert({ enquiry_id: data.enquiryId, author_id: context.userId, body: data.body.trim() });
      if (error) throw new Error(error.message);
    }
    const { data: notes, error } = await context.supabase.from("email_internal_notes").select("*").eq("enquiry_id", data.enquiryId).order("created_at");
    if (error) throw new Error(error.message);
    const ids = [...new Set((notes ?? []).map((n: any) => n.author_id))];
    const { data: profiles } = ids.length ? await adminClient().from("profiles").select("id, full_name").in("id", ids) : { data: [] };
    return (notes ?? []).map((n: any) => ({ ...n, author: profiles?.find((p: any) => p.id === n.author_id)?.full_name ?? "Staff" }));
  });

export const listInboxQuotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enquiryId?: string | null }) => input ?? {})
  .handler(async ({ data, context }) => {
    await amOrAdmin(context);
    let query = context.supabase
      .from("quotes")
      .select("id, quote_number, title, amount, currency, status, customer_id, walkin_email, studio_document_id")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.enquiryId) {
      const { data: enquiry } = await context.supabase
        .from("email_enquiries")
        .select("customer_id, contact_email")
        .eq("id", data.enquiryId)
        .maybeSingle();
      if (!enquiry) throw new Error("Enquiry not found or not visible to you");
      query = enquiry.customer_id
        ? query.eq("customer_id", enquiry.customer_id)
        : query.ilike("walkin_email", enquiry.contact_email);
    }
    const { data: quotes, error } = await query;
    if (error) throw new Error(error.message);
    return quotes ?? [];
  });

export const archiveEnquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enquiryId: string; archived: boolean }) => input)
  .handler(async ({ data, context }) => {
    await amOrAdmin(context);
    const { error } = await context.supabase
      .from("email_enquiries")
      .update({ archived_at: data.archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq("id", data.enquiryId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
