import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createCustomerRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    company_name: string;
    industry?: string;
    primary_email?: string;
    primary_phone?: string;
    website?: string;
    status?: string;
    notes?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole, error: roleError } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (roleError) throw new Error(roleError.message);
    if (!hasRole) throw new Error("Your account needs a staff role before you can add records.");
    if (!data.company_name?.trim()) throw new Error("Company name is required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("customers")
      .insert({
        company_name: data.company_name.trim(),
        industry: data.industry?.trim() || null,
        primary_email: data.primary_email?.trim() || null,
        primary_phone: data.primary_phone?.trim() || null,
        website: data.website?.trim() || null,
        status: data.status || "active",
        notes: data.notes?.trim() || null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const createPaymentRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id?: string;
    walk_in_name?: string;
    walk_in_email?: string;
    walk_in_phone?: string;
    amount: number;
    currency?: string;
    method?: string;
    reference?: string;
    status?: string;
    paid_at?: string;
    notes?: string;
    service_context?: string;
    allocations?: Array<{ invoice_id: string; amount: number }>;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole, error: roleError } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (roleError) throw new Error(roleError.message);
    if (!hasRole) throw new Error("Your account needs a staff role before you can record payments.");
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount must be greater than zero");

    const allocs = (data.allocations ?? []).filter((a) => a.invoice_id && Number(a.amount) > 0);
    const allocSum = allocs.reduce((s, a) => s + Number(a.amount), 0);
    if (allocSum > amount + 0.001) throw new Error(`Allocations (${allocSum}) exceed payment amount (${amount})`);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let customerId = data.customer_id || "";
    let accountNumber = "";

    if (!customerId || customerId === "__walkin__") {
      const name = data.walk_in_name?.trim();
      if (!name) throw new Error("Walk-in client name is required");
      const { data: customer, error: customerError } = await supabaseAdmin
        .from("customers")
        .insert({
          company_name: name,
          industry: "Walk-in",
          primary_email: data.walk_in_email?.trim() || null,
          primary_phone: data.walk_in_phone?.trim() || null,
          status: "active",
          notes: "Created automatically while recording a walk-in payment.",
          created_by: context.userId,
        })
        .select("id,account_number")
        .single();
      if (customerError || !customer) throw new Error(customerError?.message ?? "Could not create walk-in client");
      customerId = customer.id;
      accountNumber = customer.account_number;
    } else {
      const { data: customer, error: customerError } = await supabaseAdmin
        .from("customers")
        .select("id,account_number")
        .eq("id", customerId)
        .single();
      if (customerError || !customer) throw new Error(customerError?.message ?? "Customer not found");
      accountNumber = customer.account_number;
    }

    const { data: row, error } = await supabaseAdmin
      .from("payments")
      .insert({
        customer_id: customerId,
        account_number: accountNumber,
        amount,
        currency: data.currency || "USD",
        method: data.method || "cash",
        reference: data.reference?.trim() || null,
        status: data.status || "received",
        paid_at: data.paid_at ? new Date(data.paid_at).toISOString() : new Date().toISOString(),
        notes: data.notes?.trim() || null,
        service_context: data.service_context || null,
        invoice_id: allocs.length === 1 ? allocs[0].invoice_id : null,
        created_by: context.userId,
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Auto-create allocations to invoices; triggers recompute invoice status + reconciliation
    if (allocs.length > 0) {
      const { error: allocError } = await supabaseAdmin.from("payment_allocations").insert(
        allocs.map((a) => ({ payment_id: row.id, invoice_id: a.invoice_id, amount: Number(a.amount) })),
      );
      if (allocError) throw new Error(`Payment saved but allocation failed: ${allocError.message}`);
    }
    return row;
  });

export const getCustomerPaymentContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!hasRole) throw new Error("Staff role required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [customer, invoices, subscriptions, tickets, payments] = await Promise.all([
      supabaseAdmin.from("customers").select("id,account_number,company_name,primary_email,primary_phone,status").eq("id", data.customer_id).single(),
      supabaseAdmin.from("invoices").select("id,invoice_number,status,total,currency,issue_date,due_date").eq("customer_id", data.customer_id).is("archived_at", null).in("status", ["sent", "partial", "overdue", "draft"]).order("issue_date", { ascending: false }).limit(20),
      supabaseAdmin.from("subscriptions").select("id,plan_name,status,amount,currency,next_renewal").eq("customer_id", data.customer_id).order("created_at", { ascending: false }).limit(10),
      supabaseAdmin.from("tickets").select("id,ticket_number,subject,status,priority,created_at").eq("customer_id", data.customer_id).order("created_at", { ascending: false }).limit(5),
      supabaseAdmin.from("payments").select("id,receipt_number,amount,currency,method,paid_at,status,reconciliation_status").eq("customer_id", data.customer_id).order("paid_at", { ascending: false }).limit(10),
    ]);
    return {
      customer: customer.data,
      openInvoices: invoices.data ?? [],
      subscriptions: subscriptions.data ?? [],
      recentTickets: tickets.data ?? [],
      recentPayments: payments.data ?? [],
    };
  });


export const createCloudServiceRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    service_type?: string;
    service_name: string;
    vendor?: string;
    plan?: string;
    seats?: number;
    monthly_cost?: number;
    status?: string;
    renewal_date?: string | null;
    admin_url?: string;
    notes?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole, error: roleError } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (roleError) throw new Error(roleError.message);
    if (!hasRole) throw new Error("Your account needs a staff role before you can add services.");
    if (!data.customer_id) throw new Error("Customer is required");
    if (!data.service_name?.trim()) throw new Error("Service name is required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("account_number")
      .eq("id", data.customer_id)
      .single();
    if (customerError || !customer) throw new Error(customerError?.message ?? "Customer not found");

    const { data: row, error } = await supabaseAdmin
      .from("cloud_services")
      .insert({
        customer_id: data.customer_id,
        account_number: customer.account_number,
        service_type: data.service_type || "Other",
        service_name: data.service_name.trim(),
        vendor: data.vendor?.trim() || null,
        plan: data.plan?.trim() || null,
        seats: Number(data.seats) || 0,
        monthly_cost: Number(data.monthly_cost) || 0,
        status: data.status || "active",
        renewal_date: data.renewal_date || null,
        admin_url: data.admin_url?.trim() || null,
        notes: data.notes?.trim() || null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const createSubscriptionRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    plan_name: string;
    description?: string;
    amount?: number;
    currency?: string;
    billing_cycle?: string;
    status?: string;
    started_on?: string | null;
    next_renewal?: string | null;
    auto_renew?: boolean;
    notes?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole, error: roleError } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (roleError) throw new Error(roleError.message);
    if (!hasRole) throw new Error("Your account needs a staff role before you can add subscriptions.");
    if (!data.customer_id) throw new Error("Customer is required");
    if (!data.plan_name?.trim()) throw new Error("Plan is required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("account_number")
      .eq("id", data.customer_id)
      .single();
    if (customerError || !customer) throw new Error(customerError?.message ?? "Customer not found");

    const { data: row, error } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        customer_id: data.customer_id,
        account_number: customer.account_number,
        plan_name: data.plan_name.trim(),
        description: data.description?.trim() || null,
        amount: Number(data.amount) || 0,
        currency: data.currency || "USD",
        billing_cycle: data.billing_cycle || "monthly",
        status: data.status || "active",
        started_on: data.started_on || null,
        next_renewal: data.next_renewal || null,
        auto_renew: data.auto_renew ?? true,
        notes: data.notes?.trim() || null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const syncSubscriptionsFromCloudServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: hasRole, error: roleError } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (roleError) throw new Error(roleError.message);
    if (!hasRole) throw new Error("Your account needs a staff role before you can sync subscriptions.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: services, error } = await supabaseAdmin
      .from("cloud_services")
      .select("*")
      .is("archived_at", null);
    if (error) throw new Error(error.message);

    let created = 0;
    let updated = 0;
    for (const service of services ?? []) {
      const planName = service.service_name || service.plan || "Cloud service";
      const description = service.vendor || service.service_type || null;
      const { data: existing } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("customer_id", service.customer_id)
        .eq("plan_name", planName)
        .maybeSingle();

      const payload = {
        customer_id: service.customer_id,
        account_number: service.account_number,
        plan_name: planName,
        description,
        amount: Number(service.monthly_cost) || 0,
        currency: "USD",
        billing_cycle: "monthly",
        status: service.status === "cancelled" ? "cancelled" : service.status === "suspended" ? "paused" : "active",
        started_on: service.created_at ? String(service.created_at).slice(0, 10) : null,
        next_renewal: service.renewal_date || null,
        auto_renew: true,
        notes: service.notes || null,
        created_by: service.created_by || context.userId,
      };

      if (existing?.id) {
        const { error: updateError } = await supabaseAdmin.from("subscriptions").update(payload).eq("id", existing.id);
        if (updateError) throw new Error(updateError.message);
        updated++;
      } else {
        const { error: insertError } = await supabaseAdmin.from("subscriptions").insert(payload);
        if (insertError) throw new Error(insertError.message);
        created++;
      }
    }

    return { total: services?.length ?? 0, created, updated };
  });
export const globalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q: string; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    const q = (data.q || "").trim();
    if (!q) return { customers: [], invoices: [], payments: [], tickets: [], subscriptions: [], assets: [], credentials: [] };
    const limit = Math.min(data.limit ?? 6, 15);
    const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!hasRole) throw new Error("Staff role required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const like = `%${q}%`;
    const [customers, invoices, payments, tickets, subscriptions, assets, credentials] = await Promise.all([
      supabaseAdmin.from("customers").select("id,account_number,company_name,primary_email,primary_phone,status").is("archived_at", null).or(`company_name.ilike.${like},account_number.ilike.${like},primary_email.ilike.${like},primary_phone.ilike.${like}`).limit(limit),
      supabaseAdmin.from("invoices").select("id,invoice_number,customer_id,account_number,total,currency,status,issue_date").is("archived_at", null).or(`invoice_number.ilike.${like},account_number.ilike.${like}`).limit(limit),
      supabaseAdmin.from("payments").select("id,receipt_number,customer_id,account_number,amount,currency,method,paid_at,status,reference").or(`receipt_number.ilike.${like},reference.ilike.${like},account_number.ilike.${like}`).limit(limit),
      supabaseAdmin.from("tickets").select("id,ticket_number,subject,status,priority,customer_id,account_number").is("archived_at", null).or(`ticket_number.ilike.${like},subject.ilike.${like},account_number.ilike.${like}`).limit(limit),
      supabaseAdmin.from("subscriptions").select("id,plan_name,customer_id,account_number,amount,status,next_renewal").or(`plan_name.ilike.${like},account_number.ilike.${like}`).limit(limit),
      supabaseAdmin.from("assets").select("id,asset_tag,name,serial_number,status,customer_id,account_number").is("archived_at", null).or(`asset_tag.ilike.${like},name.ilike.${like},serial_number.ilike.${like},account_number.ilike.${like}`).limit(limit),
      supabaseAdmin.from("credentials").select("id,name,credential_type,username,customer_id,account_number").is("archived_at", null).or(`name.ilike.${like},username.ilike.${like},account_number.ilike.${like}`).limit(limit),
    ]);
    return {
      customers: customers.data ?? [],
      invoices: invoices.data ?? [],
      payments: payments.data ?? [],
      tickets: tickets.data ?? [],
      subscriptions: subscriptions.data ?? [],
      assets: assets.data ?? [],
      credentials: credentials.data ?? [],
    };
  });

export const generateInvoiceForSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subscription_id: string; issue_date?: string; due_days?: number; tax_rate?: number }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!hasRole) throw new Error("Staff role required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub, error: subErr } = await supabaseAdmin.from("subscriptions").select("*").eq("id", data.subscription_id).single();
    if (subErr || !sub) throw new Error(subErr?.message ?? "Subscription not found");
    const issue = data.issue_date ? new Date(data.issue_date) : new Date();
    const due = new Date(issue); due.setDate(due.getDate() + (data.due_days ?? 14));
    const subtotal = Number(sub.amount) || 0;
    const taxRate = data.tax_rate ?? 0;
    const tax = +(subtotal * taxRate / 100).toFixed(2);
    const total = +(subtotal + tax).toFixed(2);
    const { data: invoice, error } = await supabaseAdmin.from("invoices").insert({
      customer_id: sub.customer_id,
      account_number: sub.account_number,
      currency: sub.currency || "USD",
      issue_date: issue.toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
      subtotal, tax, total,
      status: "sent",
      notes: `Auto-generated for subscription: ${sub.plan_name}`,
      created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("invoice_line_items").insert({
      invoice_id: invoice.id,
      description: `${sub.plan_name}${sub.description ? ` — ${sub.description}` : ""} (${sub.billing_cycle})`,
      quantity: 1,
      unit_price: subtotal,
      tax_rate: taxRate,
      line_total: subtotal,
      position: 0,
    });
    return invoice;
  });

export const getCustomer360 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { account_number: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!hasRole) throw new Error("Staff role required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const acct = data.account_number.toUpperCase();
    const { data: customer, error } = await supabaseAdmin.from("customers").select("*").eq("account_number", acct).is("archived_at", null).maybeSingle();
    if (error) throw new Error(error.message);
    if (!customer) return null;
    const cid = customer.id;
    const [services, subscriptions, invoices, payments, quotes, tickets, assets, credentials, timeline] = await Promise.all([
      supabaseAdmin.from("cloud_services").select("id,service_name,service_type,vendor,plan,monthly_cost,status,renewal_date").eq("customer_id", cid).is("archived_at", null).order("created_at", { ascending: false }),
      supabaseAdmin.from("subscriptions").select("*").eq("customer_id", cid).order("created_at", { ascending: false }),
      supabaseAdmin.from("invoices").select("*").eq("customer_id", cid).is("archived_at", null).order("issue_date", { ascending: false }).limit(50),
      supabaseAdmin.from("payments").select("*").eq("customer_id", cid).order("paid_at", { ascending: false }).limit(50),
      supabaseAdmin.from("quotes").select("id,quote_number,title,status,total,currency,created_at").eq("customer_id", cid).is("archived_at", null).order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("tickets").select("*").eq("customer_id", cid).is("archived_at", null).order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("assets").select("id,asset_tag,name,status,serial_number").eq("customer_id", cid).is("archived_at", null),
      supabaseAdmin.from("credentials").select("id,name,credential_type,username,expires_at").eq("customer_id", cid).is("archived_at", null),
      supabaseAdmin.from("customer_timeline").select("*").eq("customer_id", cid).order("created_at", { ascending: false }).limit(50),
    ]);
    const openInvoiceTotal = (invoices.data ?? []).filter((i: any) => ["sent", "partial", "overdue"].includes(i.status)).reduce((s: number, i: any) => s + Number(i.total || 0), 0);
    const mrr = (subscriptions.data ?? []).filter((s: any) => s.status === "active").reduce((sum: number, s: any) => sum + (s.billing_cycle === "yearly" ? Number(s.amount) / 12 : Number(s.amount) || 0), 0);
    return {
      customer,
      services: services.data ?? [],
      subscriptions: subscriptions.data ?? [],
      invoices: invoices.data ?? [],
      payments: payments.data ?? [],
      quotes: quotes.data ?? [],
      tickets: tickets.data ?? [],
      assets: assets.data ?? [],
      credentials: credentials.data ?? [],
      timeline: timeline.data ?? [],
      stats: { openInvoiceTotal, mrr, ticketCount: (tickets.data ?? []).length, activeServices: (services.data ?? []).filter((s: any) => s.status === "active").length },
    };
  });
