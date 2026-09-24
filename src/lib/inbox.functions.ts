import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getAttachmentDownloadUrl,
  sendEnquiryReply,
  adminClient,
} from "./inbox.server";
import type { EnquiryListItem, EnquiryThread, InboxMessage } from "./inbox.shared";

const AM_OR_ADMIN_ROLES = [
  "master_admin",
  "operations_manager",
  "key_account_manager",
  "corporate_account_manager",
  "customer_account_manager",
  "account_manager",
  "finance",
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
  const customers = new Map((customersRes.data ?? []).map((c: any) => [c.id, c]));
  const profiles = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p.full_name]));
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
    am_name: profiles.get(r.assigned_am_id) ?? null,
  }));
}

export type InboxScope = "mine" | "unassigned" | "all";

export const listEnquiries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { scope?: InboxScope; status?: string; search?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const role = await amOrAdmin(context);
    let q = context.supabase
      .from("email_enquiries")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (data.scope === "mine") q = q.eq("assigned_am_id", context.userId);
    if (data.scope === "unassigned") q = q.is("assigned_am_id", null);
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
      .select("*, attachments:email_message_attachments(id, filename, content_type, size_bytes)")
      .eq("enquiry_id", data.enquiryId)
      .order("created_at", { ascending: true });
    const [decorated] = await decorate([enquiry]);
    return {
      enquiry: { ...decorated, created_at: enquiry.created_at, assigned_at: enquiry.assigned_at },
      messages: (messages ?? []) as unknown as InboxMessage[],
    } satisfies EnquiryThread;
  });

export const replyToEnquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enquiryId: string; body: string; cc?: string[] }) => input)
  .handler(async ({ data, context }) => {
    const role = await amOrAdmin(context);
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
      body: data.body,
      cc: data.cc,
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
    const { data: message } = await context.supabase
      .from("email_messages")
      .select("resend_email_id")
      .eq("id", data.messageId)
      .maybeSingle();
    if (!message?.resend_email_id) throw new Error("Attachment source email not found");
    return getAttachmentDownloadUrl(message.resend_email_id, data.attachmentId);
  });
