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
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole, error: roleError } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (roleError) throw new Error(roleError.message);
    if (!hasRole) throw new Error("Your account needs a staff role before you can record payments.");
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount must be greater than zero");

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
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
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