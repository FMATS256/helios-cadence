import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STARLINK_EXTERNAL_PAYOUT_USD, normalizeStarlinkPlan, starlinkPlanPrice } from "./starlink.shared";
import {
  buildStarlinkProviderPayload,
  sendExternalStarlinkRecharge,
} from "./starlink.server";

export const listStarlinkAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("starlink_accounts")
      .select("*, customers(id,account_number,company_name,primary_email,primary_phone)")
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listStarlinkRecharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { starlink_account_id?: string; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any)
      .from("starlink_recharges")
      .select("*, starlink_accounts(starlink_account_number,kit_serial,terminal_id,plan_type)")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.starlink_account_id) q = q.eq("starlink_account_id", data.starlink_account_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createStarlinkAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    starlink_account_number?: string;
    kit_serial?: string;
    terminal_id?: string;
    service_address?: string;
    plan_type?: string;
    balance_usd?: number;
    status?: string;
    notes?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole, error: roleError } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (roleError) throw new Error(roleError.message);
    if (!hasRole) throw new Error("Your account needs a staff role before you can add Starlink accounts.");
    if (!data.customer_id) throw new Error("Customer is required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("account_number")
      .eq("id", data.customer_id)
      .single();
    if (customerError || !customer) throw new Error(customerError?.message ?? "Customer not found");

    const planType = normalizeStarlinkPlan(data.plan_type);
    const monthlyPrice = starlinkPlanPrice(planType);
    const now = new Date().toISOString();
    const providerPayload = buildStarlinkProviderPayload({
      action: "created",
      checkedAt: now,
      starlinkAccountNumber: data.starlink_account_number?.trim() || null,
      kitSerial: data.kit_serial?.trim() || null,
      terminalId: data.terminal_id?.trim() || null,
      planType,
      serviceAddress: data.service_address?.trim() || null,
    });

    const { data: row, error } = await (supabaseAdmin.from("starlink_accounts") as any)
      .insert({
        customer_id: data.customer_id,
        account_number: customer.account_number,
        starlink_account_number: data.starlink_account_number?.trim() || null,
        kit_serial: data.kit_serial?.trim() || null,
        terminal_id: data.terminal_id?.trim() || null,
        service_address: data.service_address?.trim() || null,
        plan_type: planType,
        monthly_price: monthlyPrice,
        balance_usd: Number(data.balance_usd) || 0,
        status: data.status || "active",
        last_checked_at: now,
        provider_payload: providerPayload,
        notes: data.notes?.trim() || null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Could not create Starlink account");

    await supabaseAdmin.from("cloud_services").insert({
      customer_id: data.customer_id,
      account_number: customer.account_number,
      service_type: "Starlink",
      service_name: `Starlink ${planType === "business" ? "Business" : "Residential"}`,
      vendor: "Starlink",
      plan: planType === "business" ? "Business" : "Residential",
      seats: 1,
      monthly_cost: monthlyPrice,
      status: data.status || "active",
      notes: data.notes?.trim() || null,
      created_by: context.userId,
    });

    await supabaseAdmin.from("subscriptions").insert({
      customer_id: data.customer_id,
      account_number: customer.account_number,
      plan_name: `Starlink ${planType === "business" ? "Business" : "Residential"}`,
      description: data.starlink_account_number?.trim() || data.kit_serial?.trim() || "Starlink service",
      amount: monthlyPrice,
      currency: "USD",
      billing_cycle: "monthly",
      status: data.status === "suspended" ? "paused" : data.status || "active",
      started_on: new Date().toISOString().slice(0, 10),
      auto_renew: true,
      notes: data.notes?.trim() || null,
      created_by: context.userId,
    });

    return row;
  });

export const checkStarlinkAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole, error: roleError } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (roleError) throw new Error(roleError.message);
    if (!hasRole) throw new Error("Your account needs a staff role before you can check Starlink accounts.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acct, error: accountError } = await (supabaseAdmin.from("starlink_accounts") as any)
      .select("*")
      .eq("id", data.id)
      .single();
    if (accountError || !acct) throw new Error(accountError?.message ?? "Starlink account not found");

    const now = new Date().toISOString();
    const providerPayload = buildStarlinkProviderPayload({
      action: "checked",
      checkedAt: now,
      starlinkAccountNumber: acct.starlink_account_number,
      kitSerial: acct.kit_serial,
      terminalId: acct.terminal_id,
      planType: acct.plan_type,
      serviceAddress: acct.service_address,
    });

    const { data: row, error } = await (supabaseAdmin.from("starlink_accounts") as any)
      .update({
        last_checked_at: now,
        provider_payload: { ...(acct.provider_payload ?? {}), ...providerPayload },
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Could not check account");
    return row;
  });

export const recordStarlinkRecharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    starlink_account_id: string;
    customer_charge_usd?: number;
    payment_reference?: string;
    payment_method?: string;
    notes?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole, error: roleError } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (roleError) throw new Error(roleError.message);
    if (!hasRole) throw new Error("Your account needs a staff role before you can recharge Starlink accounts.");
    if (!data.starlink_account_id) throw new Error("Starlink account is required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acct, error: accountError } = await (supabaseAdmin.from("starlink_accounts") as any)
      .select("*")
      .eq("id", data.starlink_account_id)
      .single();
    if (accountError || !acct) throw new Error(accountError?.message ?? "Starlink account not found");

    const customerCharge = Number(data.customer_charge_usd ?? acct.monthly_price ?? starlinkPlanPrice(acct.plan_type));
    if (!Number.isFinite(customerCharge) || customerCharge <= 0) throw new Error("Customer charge must be greater than zero");
    const externalPayout = STARLINK_EXTERNAL_PAYOUT_USD;
    const margin = Number((customerCharge - externalPayout).toFixed(2));
    const reference = data.payment_reference?.trim() || `SL-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`;

    const { data: recharge, error: rechargeError } = await (supabaseAdmin.from("starlink_recharges") as any)
      .insert({
        starlink_account_id: acct.id,
        customer_id: acct.customer_id,
        account_number: acct.account_number,
        customer_charge_usd: customerCharge,
        external_payout_usd: externalPayout,
        margin_usd: margin,
        currency: "USD",
        payment_reference: reference,
        payment_method: data.payment_method || "cash",
        external_company: "External Starlink recharge partner",
        external_status: "pending",
        status: "submitted",
        requested_by: context.userId,
        notes: data.notes?.trim() || null,
      })
      .select("*")
      .single();
    if (rechargeError || !recharge) throw new Error(rechargeError?.message ?? "Could not record Starlink recharge");

    await supabaseAdmin.from("payments").insert({
      customer_id: acct.customer_id,
      account_number: acct.account_number,
      amount: customerCharge,
      currency: "USD",
      method: data.payment_method || "cash",
      reference,
      status: "received",
      paid_at: new Date().toISOString(),
      notes: `Starlink recharge: payout USD ${externalPayout.toFixed(2)}, margin USD ${margin.toFixed(2)}${data.notes ? ` · ${data.notes.trim()}` : ""}`,
      created_by: context.userId,
    });

    let externalStatus = "queued";
    let externalResponse: Record<string, any> | null = null;
    try {
      const external = await sendExternalStarlinkRecharge({
        rechargeId: recharge.id,
        accountNumber: acct.account_number,
        starlinkAccountNumber: acct.starlink_account_number,
        kitSerial: acct.kit_serial,
        terminalId: acct.terminal_id,
        customerChargeUsd: customerCharge,
        externalPayoutUsd: externalPayout,
        marginUsd: margin,
        paymentReference: reference,
      });
      externalStatus = external.status;
      externalResponse = JSON.parse(JSON.stringify(external.response ?? null));
    } catch (e: any) {
      externalStatus = "failed";
      externalResponse = { error: e?.message ?? String(e) };
    }

    await (supabaseAdmin.from("starlink_recharges") as any)
      .update({ external_status: externalStatus, notes: `${data.notes?.trim() || ""}${externalStatus === "failed" ? " · External send failed" : ""}`.trim() || null })
      .eq("id", recharge.id);

    await (supabaseAdmin.from("starlink_accounts") as any)
      .update({ balance_usd: Number(acct.balance_usd ?? 0) + customerCharge, last_checked_at: new Date().toISOString() })
      .eq("id", acct.id);

    return { recharge_id: recharge.id, payment_reference: reference, external_status: externalStatus, external_response: externalResponse, margin_usd: margin };
  });
// Scrape Starlink AURA portal via Firecrawl for public account snapshot.
// Uses the Lovable connector gateway (gateway-backed Firecrawl connection).
export const scrapeAuraAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { account_number: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!hasRole) throw new Error("Staff role required.");
    const lovableKey = process.env.LOVABLE_API_KEY;
    const fcKey = process.env.FIRECRAWL_API_KEY;
    if (!lovableKey || !fcKey) throw new Error("Firecrawl connector not configured");
    if (!data.account_number) throw new Error("account_number required");

    const url = `https://aura.starlink.com/account/${encodeURIComponent(data.account_number)}`;
    const res = await fetch("https://connector-gateway.lovable.dev/firecrawl/v2/scrape", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": fcKey,
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!res.ok) throw new Error(`Firecrawl failed [${res.status}]: ${await res.text()}`);
    const body: any = await res.json();
    const md: string = body?.markdown ?? body?.data?.markdown ?? "";

    const pick = (re: RegExp) => md.match(re)?.[1]?.trim() ?? null;
    const facts = {
      account_number: data.account_number,
      plan: pick(/plan[:\s]+([^\n]+)/i),
      status: pick(/status[:\s]+([^\n]+)/i),
      balance: pick(/balance[:\s]+([^\n]+)/i),
      next_billing: pick(/next\s+billing[:\s]+([^\n]+)/i),
      data_used: pick(/data\s+used[:\s]+([^\n]+)/i),
      terminal_id: pick(/terminal(?:\s+id)?[:\s]+([A-Za-z0-9-]+)/i),
      service_address: pick(/service\s+address[:\s]+([^\n]+)/i),
    };
    return { url, facts, markdown: md.slice(0, 8000) };
  });
