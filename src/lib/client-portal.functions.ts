import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { serviceRequestSchema, missingRequired, describeRequest } from "./client-service-requests.shared";
import { clientPaymentSchema, clientTicketSchema, invoiceBalances, invoicePaymentAvailability, ownedProofPath } from "./client-portal.shared";

export const getStaffAccess = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
  if (error) throw new Error("Unable to verify access");
  return Boolean(data);
});

export const getClientAccount = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: cid, error } = await context.supabase.rpc("portal_customer_id", { _user_id: context.userId });
  if (error) throw new Error("Unable to check account access");
  if (!cid) return null;
  const { data, error: err } = await context.supabase.from("customers").select("id,account_number,company_name,primary_email,primary_phone,status").eq("id", cid).is("archived_at", null).maybeSingle();
  if (err) throw new Error("Unable to load your account");
  return data;
});

export const getClientPortalData = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: cid, error } = await context.supabase.rpc("portal_customer_id", { _user_id: context.userId });
  if (error || !cid) throw new Error("Your login has not been linked to a client account. Contact IMT Solutions.");
  const db = context.supabase;
  const results = await Promise.all([
    db.from("invoices").select("id,invoice_number,total,currency,issue_date,due_date,status").eq("customer_id", cid).is("archived_at", null).order("issue_date", { ascending: false }),
    db.from("payments").select("id,receipt_number,amount,currency,method,paid_at,status").eq("customer_id", cid).order("paid_at", { ascending: false }),
    db.from("payment_submissions").select("id,payment_id,amount,currency,reference,status,payment_date,review_notes,rejection_reason,receipt_number").eq("customer_id", cid).order("created_at", { ascending: false }),
    db.from("subscriptions").select("id,plan_name,description,amount,currency,billing_cycle,status,next_renewal").eq("customer_id", cid).order("created_at", { ascending: false }),
    db.from("tickets").select("id,ticket_number,subject,description,status,priority,created_at").eq("customer_id", cid).is("archived_at", null).order("created_at", { ascending: false }),
    db.from("assets").select("id,asset_type,make,model,serial_number,site_name,location,status,camera_count,channel_capacity,storage_capacity,installed_on,warranty_expires,next_maintenance").eq("customer_id", cid).eq("client_visible", true).is("archived_at", null).order("created_at", { ascending: false }),
    db.from("starlink_accounts").select("id,kit_serial,starlink_account_number,service_address,plan_type,monthly_price,status").eq("customer_id", cid).is("archived_at", null),
    db.from("licenses").select("id,product,vendor,category,seats,assigned_seats,expiry_date,status,auto_renew").eq("customer_id", cid).is("archived_at", null),
    db.from("web_hosting_accounts").select("id,domain,plan,disk_quota_gb,email_accounts,status,renewal_date").eq("customer_id", cid).is("archived_at", null),
    db.from("cloud_storage_accounts").select("id,name,provider,storage_tb,used_tb,status,renewal_date").eq("customer_id", cid).is("archived_at", null),
    db.from("customers").select("company_name,account_number,primary_email,primary_phone,billing_address").eq("id", cid).maybeSingle(),
    db.from("client_payment_intents").select("invoice_id,amount,currency,status,submission_id").eq("customer_id", cid).eq("status", "SUCCESS"),
  ]);
  const manager = await db.rpc("portal_account_manager", { _user_id: context.userId });
  if (results.some((r) => r.error)) throw new Error("Your account information could not be loaded. Please retry.");
  const invoices = results[0].data ?? [];
  const payments = results[1].data ?? [];
  const submissions = results[2].data ?? [];
  const services = results[3].data ?? [];
  const tickets = results[4].data ?? [];
  const assets = results[5].data ?? [];
  const ids = invoices.map((i: any) => i.id);
  const allocations = ids.length ? await db.from("payment_allocations").select("invoice_id,payment_id,amount").in("invoice_id", ids) : { data: [], error: null };
  if (allocations.error) throw new Error("Unable to load invoice balances");
  return { invoices: invoicePaymentAvailability(invoiceBalances(invoices, allocations.data ?? []), results[11].data ?? [], submissions, allocations.data ?? []), payments, submissions, services, tickets, assets, starlink: results[6].data ?? [], licenses: results[7].data ?? [], hosting: results[8].data ?? [], storage: results[9].data ?? [], profile: results[10].data, manager: (manager.data as any[] | null)?.[0] ?? null };
});

export const submitClientPayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v) => clientPaymentSchema.parse(v)).handler(async ({ data, context }) => {
  const { data: cid } = await context.supabase.rpc("portal_customer_id", { _user_id: context.userId });
  if (!cid || !ownedProofPath(data.proof.path, cid, context.userId)) throw new Error("Payment proof does not belong to your account");
  const { data: id, error } = await context.supabase.rpc("submit_client_payment", {
    // Generated RPC types omit SQL argument nullability; PostgreSQL accepts NULL for account payments.
    p_request_id: data.request_id, p_invoice_id: data.invoice_id as unknown as string, p_amount: data.amount, p_currency: data.currency,
    p_method: data.method, p_payment_date: data.payment_date, p_reference: data.reference,
    p_path: data.proof.path, p_name: data.proof.name, p_type: data.proof.type, p_size: data.proof.size,
  });
  if (error) throw new Error("Payment could not be submitted. Check the invoice, currency and proof, then retry.");
  return { id, status: "pending" };
});

export const createClientTicket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v) => clientTicketSchema.parse(v)).handler(async ({ data, context }) => {
  const { data: cid } = await context.supabase.rpc("portal_customer_id", { _user_id: context.userId });
  if (!cid) throw new Error("Client account not linked");
  const { data: customer } = await context.supabase.from("customers").select("account_number").eq("id", cid).is("archived_at", null).maybeSingle();
  if (!customer) throw new Error("Client account unavailable");
  const { data: row, error } = await context.supabase.from("tickets").insert({ ...data, customer_id: cid, account_number: customer.account_number, created_by: context.userId, status: "open" }).select("id,ticket_number").single();
  if (error) throw new Error("Support request could not be submitted");
  return row;
});

export const getClientTicket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v) => z.object({ id: z.string().uuid() }).parse(v)).handler(async ({ data, context }) => {
  const { data: cid } = await context.supabase.rpc("portal_customer_id", { _user_id: context.userId });
  if (!cid) throw new Error("Client account not linked");
  const { data: ticket } = await context.supabase.from("tickets").select("id").eq("id", data.id).eq("customer_id", cid).is("archived_at", null).maybeSingle();
  if (!ticket) throw new Error("Support request unavailable");
  const { data: messages, error } = await context.supabase.from("ticket_messages").select("id,body,author_id,created_at").eq("ticket_id", ticket.id).eq("is_internal", false).order("created_at");
  if (error) throw new Error("Replies could not be loaded");
  return messages ?? [];
});

export const replyClientTicket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v) => z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(10000) }).parse(v)).handler(async ({ data, context }) => {
  const { data: cid } = await context.supabase.rpc("portal_customer_id", { _user_id: context.userId });
  if (!cid) throw new Error("Client account not linked");
  const { data: ticket } = await context.supabase.from("tickets").select("id").eq("id", data.id).eq("customer_id", cid).is("archived_at", null).maybeSingle();
  if (!ticket) throw new Error("Support request unavailable");
  const { error } = await context.supabase.from("ticket_messages").insert({ ticket_id: data.id, body: data.body, author_id: context.userId, is_internal: false });
  if (error) throw new Error("Reply could not be sent");
  return { ok: true };
});

export const clientAccessDirectory = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: allowed } = await context.supabase.rpc("is_master_admin", { _user_id: context.userId });
  if (!allowed) return null;
  const [users, customers] = await Promise.all([
    context.supabase.from("profiles").select("id,full_name,email,customer_id").is("archived_at", null).order("full_name"),
    context.supabase.from("customers").select("id,account_number,company_name").is("archived_at", null).order("account_number"),
  ]);
  if (users.error || customers.error) throw new Error("Unable to load client access settings");
  return { users: users.data ?? [], customers: customers.data ?? [] };
});

export const linkClientLogin = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v) => z.object({ user_id: z.string().uuid(), customer_id: z.string().uuid().nullable() }).parse(v)).handler(async ({ data, context }) => {
  const { data: allowed } = await context.supabase.rpc("is_master_admin", { _user_id: context.userId });
  if (!allowed) throw new Error("Only administrators can link client accounts");
  const { error } = await context.supabase.from("profiles").update({ customer_id: data.customer_id }).eq("id", data.user_id);
  if (error) throw new Error("Client login could not be linked");
  return { ok: true };
});
export const getClientCatalog = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("service_catalog").select("id,code,name,category,description,unit_price,currency,billing_cycle").eq("is_active", true).order("category").order("unit_price");
  if (error) throw new Error("Our service catalogue could not be loaded");
  return data ?? [];
});

export const submitServiceRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v) => serviceRequestSchema.parse(v)).handler(async ({ data, context }) => {
  const { data: cid } = await context.supabase.rpc("portal_customer_id", { _user_id: context.userId });
  if (!cid) throw new Error("Client account not linked");
  const { data: customer } = await context.supabase.from("customers").select("account_number").eq("id", cid).is("archived_at", null).maybeSingle();
  if (!customer) throw new Error("Client account unavailable");
  let item = null;
  if (data.type === "addon") {
    if (!data.category) throw new Error("Choose the service to change");
    const missing = missingRequired(data.category, data.details, "addon");
    if (missing.length) throw new Error(`Please fill in: ${missing.join(", ")}`);
  } else if (data.catalog_id) {
    const { data: row } = await context.supabase.from("service_catalog").select("name,code,category,unit_price,currency,billing_cycle").eq("id", data.catalog_id).eq("is_active", true).maybeSingle();
    if (!row) throw new Error("That service is no longer available");
    const missing = missingRequired(row.category, data.details, data.type);
    if (missing.length) throw new Error(`Please fill in: ${missing.join(", ")}`);
    item = row;
  } else if (data.type !== "quote") throw new Error("Choose a service");
  const { subject, description } = describeRequest(data, item);
  const { data: row, error } = await context.supabase.from("tickets").insert({ subject, description, priority: "normal", customer_id: cid, account_number: customer.account_number, created_by: context.userId, status: "open" }).select("id,ticket_number").single();
  if (error) throw new Error("Request could not be submitted");
  return row;
});

/** Branded PDF of one of the signed-in client's own invoices, returned as base64. */
export const getClientInvoicePdf = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v) => z.object({ id: z.string().uuid() }).parse(v)).handler(async ({ data, context }) => {
  const { data: cid } = await context.supabase.rpc("portal_customer_id", { _user_id: context.userId });
  if (!cid) throw new Error("Client account not linked");
  const { data: inv } = await context.supabase.from("invoices").select("id,invoice_number,total,subtotal,tax,status,currency,issue_date,due_date").eq("id", data.id).eq("customer_id", cid).is("archived_at", null).maybeSingle();
  if (!inv) throw new Error("Invoice not found on your account");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [lineResult, customerResult, allocationResult] = await Promise.all([
    supabaseAdmin.from("invoice_line_items").select("*").eq("invoice_id", inv.id).order("position"),
    context.supabase.from("customers").select("company_name,billing_address,primary_email,primary_phone,account_number,account_manager_id").eq("id", cid).maybeSingle(),
    context.supabase.from("payment_allocations").select("amount,payments:payment_id(status)").eq("invoice_id", inv.id),
  ]);
  if (lineResult.error || customerResult.error || allocationResult.error) throw new Error("Invoice details could not be loaded");
  const { officialInvoicePdf, invoicePdfResponse } = await import("./invoice-document.server");
  const { accountManagerContact } = await import("./account-managers.server");
  const manager = await accountManagerContact(supabaseAdmin, customerResult.data?.account_manager_id);
  if (!manager?.name) throw new Error("Account manager details must be completed before downloading");
  const { bytes } = await officialInvoicePdf(inv, lineResult.data ?? [], customerResult.data, allocationResult.data ?? [], { userId: context.userId, userName: manager.name });
  return invoicePdfResponse(bytes, inv.invoice_number);
});
