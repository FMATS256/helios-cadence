import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listAccountManagers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!hasRole) throw new Error("Staff role required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listAccountManagerRecords } = await import("./account-managers.server");
    return listAccountManagerRecords(supabaseAdmin);
  });

export const createCustomerRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    company_name: string;
    title?: string;
    account_type?: "corporate" | "personal";
    industry?: string;
    primary_email?: string;
    primary_phone?: string;
    website?: string;
    status?: string;
    notes?: string;
    account_manager_id?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole, error: roleError } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (roleError) throw new Error(roleError.message);
    if (!hasRole) throw new Error("Your account needs a staff role before you can add records.");
    if (!data.company_name?.trim()) throw new Error("Name is required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveAccountManager } = await import("./account-managers.server");
    const manager = await resolveAccountManager(supabaseAdmin, {
      explicitId: data.account_manager_id ?? null,
      creatorId: context.userId,
      accountType: data.account_type || "corporate",
    });

    const { data: row, error } = await supabaseAdmin
      .from("customers")
      .insert({
        company_name: data.company_name.trim(),
        title: data.title?.trim() || null,
        account_type: data.account_type || "corporate",
        industry: data.industry?.trim() || null,
        primary_email: data.primary_email?.trim() || null,
        primary_phone: data.primary_phone?.trim() || null,
        website: data.website?.trim() || null,
        status: data.status || "active",
        notes: data.notes?.trim() || null,
        account_manager_id: manager?.id ?? null,
        created_by: context.userId,
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { sendCustomerWelcome } = await import("./customer-welcome.server");
    await sendCustomerWelcome(supabaseAdmin, row.id);

    const { recordCustomerEvent } = await import("./customer-events.server");
    await recordCustomerEvent(supabaseAdmin, {
      customer_id: row.id,
      account_number: row.account_number,
      event_type: "customer_created",
      title: `Customer ${row.company_name} created`,
      description: `Account ${row.account_number} · ${row.account_type}${manager ? ` · Owned by ${manager.full_name ?? manager.email}` : ""}`,
      module: "customers",
      entity_type: "customer",
      entity_id: row.id,
      new_value: { company_name: row.company_name, status: row.status, account_type: row.account_type, account_manager_id: manager?.id ?? null },
      major: true,
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
    });

    return { ...row, account_manager: manager ?? null };
  });


export const createOnboardingInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    items: { description: string; quantity: number; unit_price: number }[];
    currency?: string;
    mark_paid?: boolean;
    payment_method?: string;
    payment_reference?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!hasRole) throw new Error("Staff role required");
    if (!data.items?.length) throw new Error("At least one line item is required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: customer, error: cErr } = await supabaseAdmin
      .from("customers").select("id, account_number").eq("id", data.customer_id).single();
    if (cErr || !customer) throw new Error(cErr?.message || "Customer not found");

    const subtotal = data.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
    const total = Number(subtotal.toFixed(2));

    const { data: inv, error: invErr } = await supabaseAdmin.from("invoices").insert({
      customer_id: customer.id,
      account_number: customer.account_number,
      status: "sent",
      currency: data.currency || "USD",
      subtotal: total,
      tax: 0,
      total,
      due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      created_by: context.userId,
    } as any).select("*").single();
    if (invErr || !inv) throw new Error(invErr?.message || "Could not create invoice");

    const { error: liErr } = await supabaseAdmin.from("invoice_line_items").insert(
      data.items.map((i) => ({
        invoice_id: inv.id,
        description: i.description,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
      })) as any,
    );
    if (liErr) throw new Error(liErr.message);

    let payment: any = null;
    if (data.mark_paid) {
      const { data: pay, error: payErr } = await supabaseAdmin.from("payments").insert({
        customer_id: customer.id,
        account_number: customer.account_number,
        invoice_id: inv.id,
        amount: total,
        currency: data.currency || "USD",
        method: data.payment_method || "cash",
        reference: data.payment_reference?.trim() || null,
        status: "received",
        paid_at: new Date().toISOString(),
        created_by: context.userId,
      } as any).select("*").single();
      if (payErr) throw new Error(payErr.message);
      payment = pay;
      await supabaseAdmin.from("payment_allocations").insert({
        payment_id: pay.id, invoice_id: inv.id, amount: total,
      } as any);
    }
    return { invoice: inv, payment };
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
    cash_account_id?: string;
    allocations?: Array<{ invoice_id: string; amount: number }>;
  }) => input)
  .handler(async ({ data, context }) => {
    const { assertBillingStaff } = await import("./customer360.server");
    await assertBillingStaff(context as any);
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
      const { resolveAccountManager } = await import("./account-managers.server");
      const walkInManager = await resolveAccountManager(supabaseAdmin, {
        creatorId: context.userId, accountType: "personal",
      });
      const { data: customer, error: customerError } = await supabaseAdmin
        .from("customers")
        .insert({
          company_name: name,
          industry: "Walk-in",
          primary_email: data.walk_in_email?.trim() || null,
          primary_phone: data.walk_in_phone?.trim() || null,
          status: "active",
          notes: "Created automatically while recording a walk-in payment.",
          account_manager_id: walkInManager?.id ?? null,
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

    const { cashAccounts, bankDeposit, postPaymentToLedger } = await import("./payment-submissions.functions");
    const accounts = await cashAccounts(supabaseAdmin);
    const method = data.method || "cash";
    const methodKind = method === "cash" ? "cash" : method === "mobile_money" ? "mobile_money" : "bank";
    const account =
      accounts.find((a: any) => a.id === data.cash_account_id) ??
      accounts.find((a: any) => String(a.kind).toLowerCase() === methodKind) ??
      accounts.find((a: any) => a.is_default) ??
      accounts[0] ?? null;
    if (!account) throw new Error("No active bank, cash or mobile money account is available.");
    if (method === "cash" && String(account.kind).toLowerCase() !== "cash") {
      throw new Error("Cash payments must be received into a cash account.");
    }

    const { data: row, error } = await supabaseAdmin
      .from("payments")
      .insert({
        customer_id: customerId,
        account_number: accountNumber,
        amount,
        currency: data.currency || "USD",
        method,
        reference: data.reference?.trim() || null,
        status: data.status || "received",
        paid_at: data.paid_at ? new Date(data.paid_at).toISOString() : new Date().toISOString(),
        notes: data.notes?.trim() || null,
        service_context: data.service_context || null,
        cash_account_id: account.id,
        invoice_id: allocs.length === 1 ? allocs[0].invoice_id : null,
        created_by: context.userId,
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await bankDeposit(supabaseAdmin, {
      account_id: account.id,
      amount,
      currency: data.currency || "USD",
      occurred_at: row.paid_at,
      payment_id: row.id,
      reference: row.receipt_number || row.reference || null,
      notes: `Customer payment · ${accountNumber}`,
      created_by: context.userId,
    });
    const { data: ledgerCustomer } = await supabaseAdmin
      .from("customers")
      .select("id,company_name,account_number")
      .eq("id", customerId)
      .single();
    if (ledgerCustomer) {
      await postPaymentToLedger(supabaseAdmin, { payment: row, account, customer: ledgerCustomer, userId: context.userId });
    }

    // Auto-create allocations to invoices; triggers recompute invoice status + reconciliation
    if (allocs.length > 0) {
      const { error: allocError } = await supabaseAdmin.from("payment_allocations").insert(
        allocs.map((a) => ({ payment_id: row.id, invoice_id: a.invoice_id, amount: Number(a.amount) })),
      );
      if (allocError) throw new Error(`Payment saved but allocation failed: ${allocError.message}`);
    }

    // Receipt email
    const recipient = data.walk_in_email?.trim() || (await supabaseAdmin
      .from("customers").select("primary_email,company_name").eq("id", customerId).maybeSingle()).data;
    const custInfo = typeof recipient === "string" ? { primary_email: recipient, company_name: data.walk_in_name } : (recipient as any);
    if (custInfo?.primary_email) {
      const { notify } = await import("./notify.server");
      void notify("receipt", custInfo.primary_email, {
        companyName: custInfo.company_name,
        receiptNumber: (row as any).receipt_number,
        amount: row.amount,
        currency: row.currency,
        method: row.method,
        reference: row.reference,
        paidAt: row.paid_at ? String(row.paid_at).slice(0, 10) : null,
        serviceContext: row.service_context,
      }, `receipt-${row.id}`);
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
    const [customer, invoices, subscriptions, tickets, payments, cashAccountRows] = await Promise.all([
      supabaseAdmin.from("customers").select("id,account_number,company_name,primary_email,primary_phone,status").eq("id", data.customer_id).single(),
      supabaseAdmin.from("invoices").select("id,invoice_number,status,total,currency,issue_date,due_date").eq("customer_id", data.customer_id).is("archived_at", null).in("status", ["sent", "partial", "overdue", "draft"]).order("issue_date", { ascending: false }).limit(20),
      supabaseAdmin.from("subscriptions").select("id,plan_name,status,amount,currency,next_renewal").eq("customer_id", data.customer_id).order("created_at", { ascending: false }).limit(10),
      supabaseAdmin.from("tickets").select("id,ticket_number,subject,status,priority,created_at").eq("customer_id", data.customer_id).order("created_at", { ascending: false }).limit(5),
      supabaseAdmin.from("payments").select("id,receipt_number,amount,currency,method,paid_at,status,reconciliation_status").eq("customer_id", data.customer_id).order("paid_at", { ascending: false }).limit(10),
      supabaseAdmin.from("cash_accounts").select("id,name,kind,currency,is_default").eq("is_active", true).order("is_default", { ascending: false }).order("name"),
    ]);
    return {
      customer: customer.data,
      openInvoices: invoices.data ?? [],
      subscriptions: subscriptions.data ?? [],
      recentTickets: tickets.data ?? [],
      recentPayments: payments.data ?? [],
      cashAccounts: cashAccountRows.data ?? [],
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
    paid_months?: number | null;
    auto_renew?: boolean;
    notes?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole, error: roleError } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (roleError) throw new Error(roleError.message);
    if (!hasRole) throw new Error("Your account needs a staff role before you can add subscriptions.");
    if (!data.customer_id) throw new Error("Customer is required");
    if (!data.plan_name?.trim()) throw new Error("Plan is required");
    if (data.paid_months != null && (!Number.isInteger(data.paid_months) || data.paid_months < 1 || data.paid_months > 120)) throw new Error("Months covered must be between 1 and 120");

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
        paid_months: data.paid_months ?? null,
        auto_renew: data.auto_renew ?? true,
        notes: data.notes?.trim() || null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const manageSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    subscription_id: string;
    action: "suspend" | "resume" | "cancel" | "renew" | "upgrade" | "downgrade";
    plan_name?: string;
    description?: string;
    amount?: number;
    billing_cycle?: string;
    note?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!hasRole) throw new Error("Staff role required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub, error: subErr } = await supabaseAdmin.from("subscriptions").select("*").eq("id", data.subscription_id).single();
    if (subErr || !sub) throw new Error(subErr?.message ?? "Subscription not found");

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (data.action === "suspend") patch.status = "paused";
    else if (data.action === "resume") patch.status = "active";
    else if (data.action === "cancel") { patch.status = "cancelled"; patch.auto_renew = false; }
    else if (data.action === "renew") {
      const base = sub.next_renewal ? new Date(sub.next_renewal) : new Date();
      const cycle = (data.billing_cycle || sub.billing_cycle || "monthly").toLowerCase();
      if (cycle === "yearly" || cycle === "annual") base.setFullYear(base.getFullYear() + 1);
      else if (cycle === "quarterly") base.setMonth(base.getMonth() + 3);
      else if (cycle === "weekly") base.setDate(base.getDate() + 7);
      else base.setMonth(base.getMonth() + 1);
      patch.next_renewal = base.toISOString().slice(0, 10);
      patch.status = "active";
    } else if (data.action === "upgrade" || data.action === "downgrade") {
      if (data.plan_name) patch.plan_name = data.plan_name.trim();
      if (data.description !== undefined) patch.description = data.description?.trim() || null;
      if (data.amount != null) patch.amount = Number(data.amount);
      if (data.billing_cycle) patch.billing_cycle = data.billing_cycle;
      patch.status = "active";
    }

    const { data: updated, error } = await supabaseAdmin.from("subscriptions").update(patch as any).eq("id", data.subscription_id).select("*").single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("customer_timeline").insert({
      customer_id: sub.customer_id,
      account_number: sub.account_number,
      event_type: `subscription_${data.action}`,
      title: `Subscription ${data.action}: ${updated.plan_name}`,
      description: data.note || null,
      created_by: context.userId,
    } as any);

    // Renewal-confirmation email
    if (data.action === "renew") {
      const { data: cust } = await supabaseAdmin
        .from("customers").select("primary_email,company_name").eq("id", sub.customer_id).maybeSingle();
      if (cust?.primary_email) {
        const { notify } = await import("./notify.server");
        const daysUntil = updated.next_renewal
          ? Math.max(0, Math.round((new Date(updated.next_renewal).getTime() - Date.now()) / 86400000))
          : 30;
        void notify("renewal-reminder", cust.primary_email, {
          companyName: cust.company_name,
          planName: updated.plan_name,
          renewalDate: updated.next_renewal,
          daysUntilRenewal: daysUntil,
          amount: updated.amount,
          currency: updated.currency,
          billingCycle: updated.billing_cycle,
        }, `renewal-${updated.id}-${updated.next_renewal}`);
      }
    }

    return updated;
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
    const { assertBillingStaff } = await import("./customer360.server");
    await assertBillingStaff(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub, error: subErr } = await supabaseAdmin.from("subscriptions").select("*").eq("id", data.subscription_id).single();
    if (subErr || !sub) throw new Error(subErr?.message ?? "Subscription not found");
    const { data: billed, error: billingError } = await supabaseAdmin.rpc("bill_subscription_period", {
      p_subscription_id: sub.id, p_issue: true, p_due_days: data.due_days ?? 14,
    });
    if (billingError) throw new Error(billingError.message);
    const result = billed as any;
    if (result?.skipped) throw new Error("This subscription is not due for billing or this period already has an invoice.");
    const { data: invoice, error } = await supabaseAdmin.from("invoices").select("*").eq("id", result.invoice_id).single();
    if (error || !invoice) throw new Error(error?.message ?? "Invoice could not be loaded");
    const subtotal = Number(invoice.subtotal), tax = Number(invoice.tax), total = Number(invoice.total);

    // Invoice-issued email
    const { data: cust } = await supabaseAdmin
      .from("customers").select("primary_email,company_name").eq("id", sub.customer_id).maybeSingle();
    if (cust?.primary_email) {
      const { notify } = await import("./notify.server");
      await notify("invoice", cust.primary_email, {
        companyName: cust.company_name,
        invoiceNumber: (invoice as any).invoice_number,
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date,
        currency: invoice.currency,
        subtotal, tax, total,
        items: [{ description: `${sub.plan_name} (${sub.billing_cycle})`, quantity: 1, unit_price: subtotal, line_total: subtotal }],
        invoiceUrl: `https://management.imtsolutions.co.zw/invoices/${invoice.id}`,
      }, `invoice-${invoice.id}`, {
        fromName: `${(context.claims?.email as string)?.split("@")[0] ?? "IMT Solutions"} (IMT Solutions)`,
        ...(context.claims?.email ? { fromLocal: context.claims.email as string, replyTo: context.claims.email as string } : {}),
      });
    }

    const { recordCustomerEvent } = await import("./customer-events.server");
    await recordCustomerEvent(supabaseAdmin, {
      customer_id: sub.customer_id,
      account_number: sub.account_number,
      event_type: "invoice_generated",
      title: `Invoice ${(invoice as any).invoice_number} generated`,
      description: `${invoice.currency} ${total.toFixed(2)} · ${sub.plan_name}`,
      module: "billing",
      entity_type: "invoice",
      entity_id: invoice.id,
      new_value: { total, currency: invoice.currency, due_date: invoice.due_date, subscription_id: sub.id },
      major: true,
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
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

    // Single-round aggregation across every module that touches the customer.
    const rows = <T,>(r: { data: T[] | null }) => (r.data ?? []) as T[];
    const [
      servicesR, subscriptionsR, invoicesR, paymentsR, quotesR, ticketsR, assetsR, credentialsR,
      timelineR, packagesR, contactsR, branchesR, notesR, communicationsR,
      cloudServersR, monitoringChecksR, monitoringIncidentsR, webHostingR, starlinkR, voipR,
      cloudStorageR, managedNasR, licensesR, projectsR, auditLogR,
    ] = await Promise.all([
      supabaseAdmin.from("cloud_services").select("*").eq("customer_id", cid).is("archived_at", null).order("created_at", { ascending: false }),
      supabaseAdmin.from("subscriptions").select("*").eq("customer_id", cid).order("created_at", { ascending: false }),
      supabaseAdmin.from("invoices").select("*").eq("customer_id", cid).is("archived_at", null).order("issue_date", { ascending: false }).limit(100),
      supabaseAdmin.from("payments").select("*").eq("customer_id", cid).order("paid_at", { ascending: false }).limit(100),
      supabaseAdmin.from("quotes").select("id,quote_number,title,status,total,currency,created_at").eq("customer_id", cid).is("archived_at", null).order("created_at", { ascending: false }).limit(30),
      supabaseAdmin.from("tickets").select("*").eq("customer_id", cid).is("archived_at", null).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("assets").select("*").eq("customer_id", cid).is("archived_at", null),
      supabaseAdmin.from("credentials").select("id,name,credential_type,username,expires_at,created_at").eq("customer_id", cid).is("archived_at", null),
      supabaseAdmin.from("customer_timeline").select("*").eq("customer_id", cid).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("customer_services").select("id, quantity, unit_price, status, started_on, ends_on, notes, catalog:service_catalog(id, code, name, category, billing_cycle, currency)").eq("customer_id", cid).order("created_at", { ascending: false }),
      supabaseAdmin.from("customer_contacts").select("*").eq("customer_id", cid).is("archived_at", null),
      supabaseAdmin.from("customer_branches").select("*").eq("customer_id", cid).is("archived_at", null),
      supabaseAdmin.from("customer_notes").select("*").eq("customer_id", cid).order("created_at", { ascending: false }),
      supabaseAdmin.from("communications").select("*").eq("customer_id", cid).order("occurred_at", { ascending: false }).limit(50),
      supabaseAdmin.from("cloud_servers").select("*").eq("customer_id", cid).is("archived_at", null),
      supabaseAdmin.from("monitoring_checks").select("*").eq("customer_id", cid).is("archived_at", null),
      supabaseAdmin.from("monitoring_incidents").select("*").order("started_at", { ascending: false }).limit(50),
      supabaseAdmin.from("web_hosting_accounts").select("*").eq("customer_id", cid).is("archived_at", null),
      supabaseAdmin.from("starlink_accounts").select("*").eq("customer_id", cid).is("archived_at", null),
      supabaseAdmin.from("voip_accounts").select("*").eq("customer_id", cid).is("archived_at", null),
      supabaseAdmin.from("cloud_storage_accounts").select("*").eq("customer_id", cid).is("archived_at", null),
      supabaseAdmin.from("managed_nas_accounts").select("*").eq("customer_id", cid).is("archived_at", null),
      supabaseAdmin.from("licenses").select("*").eq("customer_id", cid).is("archived_at", null),
      supabaseAdmin.from("projects").select("*").eq("customer_id", cid).is("archived_at", null).order("created_at", { ascending: false }),
      supabaseAdmin.from("audit_log").select("*").eq("account_number", acct).order("created_at", { ascending: false }).limit(50),
    ]);

    const services = rows(servicesR), subscriptions = rows(subscriptionsR), invoices = rows(invoicesR),
      payments = rows(paymentsR), quotes = rows(quotesR), tickets = rows(ticketsR), assets = rows(assetsR),
      credentials = rows(credentialsR), timeline = rows(timelineR), packages = rows(packagesR),
      contacts = rows(contactsR), branches = rows(branchesR), notes = rows(notesR), communications = rows(communicationsR),
      cloudServers = rows(cloudServersR), monitoringChecks = rows(monitoringChecksR),
      monitoringIncidents = rows(monitoringIncidentsR), webHosting = rows(webHostingR),
      starlink = rows(starlinkR), voip = rows(voipR), cloudStorage = rows(cloudStorageR),
      managedNas = rows(managedNasR), licenses = rows(licensesR), projects = rows(projectsR),
      auditLog = rows(auditLogR);

    // Live operational metrics — no hardcoded placeholders.
    const now = Date.now();
    const soon = (iso?: string | null, days = 30) => {
      if (!iso) return false;
      const d = (new Date(iso).getTime() - now) / 86_400_000;
      return d >= 0 && d <= days;
    };
    const isActive = (s: any) => ["active", "running", "on", "up"].includes(String(s?.status || "").toLowerCase());

    // Net of payment allocations so partially-settled invoices report the true balance.
    const openInvoices = (invoices as any[]).filter((i) => ["sent", "partial", "overdue"].includes(i.status));
    const allocByInvoice = new Map<string, number>();
    if (openInvoices.length) {
      const { data: allocs } = await supabaseAdmin
        .from("payment_allocations")
        .select("invoice_id, amount")
        .in("invoice_id", openInvoices.map((i) => i.id));
      for (const a of (allocs ?? []) as any[]) {
        allocByInvoice.set(a.invoice_id, (allocByInvoice.get(a.invoice_id) || 0) + Number(a.amount || 0));
      }
    }
    const invoiceBalance = (i: any) =>
      Math.max(0, Math.round((Number(i.total || 0) - (allocByInvoice.get(i.id) || 0)) * 100) / 100);
    const openInvoiceTotal = Math.round(openInvoices.reduce((s, i) => s + invoiceBalance(i), 0) * 100) / 100;
    const overdueInvoiceCount = (invoices as any[]).filter((i) => i.status === "overdue").length;

    const mrr = (subscriptions as any[]).filter((s) => s.status === "active").reduce((sum, s) => {
      const amt = Number(s.amount) || 0;
      const cyc = String(s.billing_cycle || "monthly").toLowerCase();
      return sum + (cyc === "yearly" || cyc === "annual" ? amt / 12 : cyc === "quarterly" ? amt / 3 : cyc === "weekly" ? amt * 4.345 : amt);
    }, 0);
    const activeSubscriptions = (subscriptions as any[]).filter((s) => s.status === "active").length;
    const activeCloudServices = (services as any[]).filter((s) => s.status === "active").length;
    const openTickets = (tickets as any[]).filter((t) => !["resolved", "closed"].includes(t.status)).length;
    const criticalTickets = (tickets as any[]).filter((t) => (t.priority === "critical" || t.priority === "urgent") && !["resolved", "closed"].includes(t.status)).length;
    const activeServers = (cloudServers as any[]).filter(isActive).length;
    const monitorsDown = (monitoringChecks as any[]).filter((c) => String(c.status || "").toLowerCase() === "down").length;
    const monitorsUp = (monitoringChecks as any[]).filter((c) => String(c.status || "").toLowerCase() === "up").length;
    const checkIds = new Set((monitoringChecks as any[]).map((c) => c.id));
    const openIncidents = (monitoringIncidents as any[]).filter((i) => checkIds.has(i.check_id) && !i.ended_at).length;
    const activeAssets = (assets as any[]).filter((a) => ["active", "deployed", "in_use"].includes(String(a.status || "").toLowerCase())).length;
    const credentialsExpiring = (credentials as any[]).filter((c) => soon(c.expires_at, 30)).length;
    const licensesExpiring = (licenses as any[]).filter((l: any) => soon(l.expires_at ?? l.renewal_date, 60)).length;
    const renewals30 =
      (subscriptions as any[]).filter((s) => s.status === "active" && soon(s.next_renewal, 30)).length +
      (services as any[]).filter((s) => s.status === "active" && soon(s.renewal_date, 30)).length +
      (licenses as any[]).filter((l: any) => soon(l.expires_at ?? l.renewal_date, 30)).length;

    // Block 5 — field-level access control. Supplier cost / margin / profit and
    // any secret material are stripped server-side before the payload is sent.
    const { viewerScope, redactBundle } = await import("./security/redaction.server");
    const viewer = await viewerScope(context);

    const payload = redactBundle(
      {
        customer,
        services, subscriptions, invoices, payments, quotes, tickets, assets, credentials, timeline, packages,
        contacts, branches, notes, communications,
        cloudServers, monitoringChecks, monitoringIncidents, webHosting, starlink, voip,
        cloudStorage, managedNas, licenses, projects, auditLog,
      },
      viewer,
    );

    return {
      ...payload,
      viewer: { roles: viewer.roles, isMaster: viewer.isMaster, canSeeCost: viewer.canSeeCost },
      stats: {
        openInvoiceTotal, overdueInvoiceCount, mrr,
        activeSubscriptions, activeCloudServices, activeServers,
        openTickets, criticalTickets,
        monitorsUp, monitorsDown, openIncidents,
        activeAssets, credentialsExpiring, licensesExpiring, renewals30,
        // Back-compat aliases
        ticketCount: (tickets as any[]).length,
        activeServices: activeCloudServices,
      },
    };

  });

/**
 * Update basic customer details (name, contact, address, status, notes).
 */
export const updateCustomerRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    company_name?: string;
    title?: string;
    industry?: string;
    primary_email?: string;
    primary_phone?: string;
    website?: string;
    status?: string;
    billing_address?: string;
    notes?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!hasRole) throw new Error("Your account needs a staff role to edit customers.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = {};
    for (const k of ["company_name","title","industry","primary_email","primary_phone","website","status","billing_address","notes"] as const) {
      if (data[k] !== undefined) patch[k] = (data[k] as any) === "" ? null : data[k];
    }
    const { data: before } = await supabaseAdmin
      .from("customers").select("*").eq("id", data.customer_id).maybeSingle();
    const { data: row, error } = await supabaseAdmin
      .from("customers").update(patch).eq("id", data.customer_id).select("*").single();
    if (error) throw new Error(error.message);

    const { recordCustomerEvent } = await import("./customer-events.server");
    const changed: Record<string, any> = {};
    const previous: Record<string, any> = {};
    for (const k of Object.keys(patch)) {
      if ((before as any)?.[k] !== (row as any)[k]) {
        previous[k] = (before as any)?.[k] ?? null;
        changed[k] = (row as any)[k];
      }
    }
    if (Object.keys(changed).length) {
      await recordCustomerEvent(supabaseAdmin, {
        customer_id: row.id,
        account_number: row.account_number,
        event_type: (before as any)?.status !== row.status ? "status_changed" : "customer_updated",
        title: `Customer details updated`,
        description: Object.keys(changed).join(", "),
        module: "customers",
        entity_type: "customer",
        entity_id: row.id,
        old_value: previous,
        new_value: changed,
        major: (before as any)?.status !== row.status,
        actor_id: context.userId,
        actor_email: context.claims?.email ?? null,
      });
    }
    return row;
  });

/** Reassign (or clear) the account manager who owns a customer. */
export const assignAccountManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string; account_manager_id: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!hasRole) throw new Error("Your account needs a staff role to reassign customers.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listAccountManagerRecords } = await import("./account-managers.server");

    const managers = await listAccountManagerRecords(supabaseAdmin);
    const next = data.account_manager_id
      ? managers.find((m) => m.id === data.account_manager_id)
      : null;
    if (data.account_manager_id && !next) throw new Error("That user is not an account manager");

    const { data: before } = await supabaseAdmin
      .from("customers").select("id, account_number, account_manager_id").eq("id", data.customer_id).maybeSingle();
    if (!before) throw new Error("Customer not found");
    if (before.account_manager_id === (next?.id ?? null)) return { customer_id: before.id, account_manager: next ?? null };

    const { error } = await supabaseAdmin
      .from("customers")
      .update({ account_manager_id: next?.id ?? null } as any)
      .eq("id", data.customer_id);
    if (error) throw new Error(error.message);

    const previous = managers.find((m) => m.id === before.account_manager_id) ?? null;
    const { recordCustomerEvent } = await import("./customer-events.server");
    await recordCustomerEvent(supabaseAdmin, {
      customer_id: before.id,
      account_number: before.account_number,
      event_type: "customer_updated",
      title: "Account manager reassigned",
      description: `${previous?.full_name ?? previous?.email ?? "Unassigned"} → ${next?.full_name ?? next?.email ?? "Unassigned"}`,
      module: "customers",
      entity_type: "customer",
      entity_id: before.id,
      old_value: { account_manager_id: before.account_manager_id },
      new_value: { account_manager_id: next?.id ?? null },
      major: true,
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
    });

    return { customer_id: before.id, account_manager: next ?? null };
  });


/**
 * Suspend or resume ALL of a customer's active subscriptions and services in one call.
 * status: "suspended" pauses everything; "active" resumes paused entries.
 */
export const setCustomerLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string; action: "suspend" | "resume" | "activate" | "deactivate" }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!hasRole) throw new Error("Your account needs a staff role.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const custStatus = data.action === "suspend" || data.action === "deactivate" ? "suspended"
      : "active";
    const subStatus  = data.action === "suspend" ? "paused" : data.action === "resume" ? "active" : custStatus;

    const { data: before } = await supabaseAdmin
      .from("customers").select("id, account_number, status").eq("id", data.customer_id).maybeSingle();
    await supabaseAdmin.from("customers").update({ status: custStatus }).eq("id", data.customer_id);
    let affected = 0;
    if (data.action === "suspend") {
      const { data: subs } = await supabaseAdmin.from("subscriptions").update({ status: "paused" })
        .eq("customer_id", data.customer_id).eq("status", "active").select("id");
      affected = (subs ?? []).length;
    } else if (data.action === "resume") {
      const { data: subs } = await supabaseAdmin.from("subscriptions").update({ status: "active" })
        .eq("customer_id", data.customer_id).eq("status", "paused").select("id");
      affected = (subs ?? []).length;
    }

    if (before) {
      const { recordCustomerEvent } = await import("./customer-events.server");
      await recordCustomerEvent(supabaseAdmin, {
        customer_id: before.id,
        account_number: before.account_number,
        event_type: data.action === "suspend" ? "service_suspended" : "service_resumed",
        title: `Account ${data.action}ed`,
        description: affected ? `${affected} subscription(s) set to ${subStatus}` : null,
        module: "customers",
        entity_type: "customer",
        entity_id: before.id,
        old_value: { status: before.status },
        new_value: { status: custStatus, subscriptions: affected, subscription_status: subStatus },
        major: true,
        actor_id: context.userId,
        actor_email: context.claims?.email ?? null,
      });
    }
    return { ok: true, status: custStatus, subStatus, affected };

  });

/**
 * Send a payment reminder email for a specific invoice (or all overdue).
 */
export const sendPaymentReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string; invoice_id?: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!hasRole) throw new Error("Your account needs a staff role.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cust } = await supabaseAdmin
      .from("customers").select("id, company_name, primary_email, account_number").eq("id", data.customer_id).maybeSingle();
    if (!cust?.primary_email) throw new Error("Customer has no email on file.");

    let q = supabaseAdmin.from("invoices").select("*").eq("customer_id", data.customer_id).not("status", "in", "(paid,void)");
    if (data.invoice_id) q = q.eq("id", data.invoice_id);
    const { data: invs } = await q;
    if (!invs || invs.length === 0) throw new Error("No outstanding invoices to remind.");

    const { notify } = await import("./notify.server");
    let sent = 0;
    for (const i of invs as any[]) {
      const dueDate = i.due_date ? new Date(i.due_date) : null;
      const days = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86400_000) : 0;
      await notify("payment-reminder", cust.primary_email, {
        companyName: cust.company_name,
        invoiceNumber: i.invoice_number,
        amountDue: Number(i.amount_total ?? i.total ?? 0),
        currency: i.currency || "USD",
        dueDate: i.due_date,
        daysUntilDue: days,
        invoiceUrl: `${process.env.SITE_URL ?? ""}/invoices/${i.id}`,
      }, `reminder-${i.id}-${Date.now()}`);
      sent++;
    }
    const { recordCustomerEvent } = await import("./customer-events.server");
    await recordCustomerEvent(supabaseAdmin, {
      customer_id: cust.id,
      account_number: cust.account_number,
      event_type: "communication_sent",
      title: `Payment reminder sent`,
      description: `${sent} reminder email(s) to ${cust.primary_email}`,
      module: "billing",
      entity_type: "customer",
      entity_id: cust.id,
      new_value: { reminders: sent, invoice_id: data.invoice_id ?? null },
      major: false,
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
    });
    return { ok: true, sent };
  });

