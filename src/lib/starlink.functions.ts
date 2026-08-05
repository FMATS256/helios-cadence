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
        workflow_status: "paid",
        paid_at: new Date().toISOString(),
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

// ---------------------------------------------------------------------------
// Block 6 — Starlink recharge workflow
// ---------------------------------------------------------------------------

export const getStarlinkRechargeWorkflow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { recharge_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: recharge, error } = await (context.supabase as any)
      .from("starlink_recharges")
      .select("*, starlink_accounts(starlink_account_number,kit_serial,terminal_id,plan_type,service_address), customers(company_name,primary_email,primary_phone)")
      .eq("id", data.recharge_id)
      .single();
    if (error || !recharge) throw new Error(error?.message ?? "Recharge not found");
    const { data: events } = await (context.supabase as any)
      .from("starlink_recharge_events")
      .select("*")
      .eq("recharge_id", data.recharge_id)
      .order("created_at", { ascending: false });
    return { recharge, events: events ?? [] };
  });

export const advanceStarlinkRecharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    recharge_id: string;
    to_status: "paid" | "message_sent" | "awaiting_supplier" | "completed" | "failed" | "cancelled";
    note?: string;
    supplier_reply?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: hasRole, error: roleError } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (roleError) throw new Error(roleError.message);
    if (!hasRole) throw new Error("Your account needs a staff role before you can manage Starlink recharges.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      assertTransition, buildSupplierMessage, sendSupplierWhatsApp, recordRechargeEvent,
      notifyStarlinkStaff, STARLINK_SUPPLIER_WHATSAPP, SUPPLIER_RECHECK_MINUTES,
    } = await import("./starlink-workflow.server");
    const { recordCustomerEvent } = await import("./customer-events.server");

    const { data: row, error } = await (supabaseAdmin.from("starlink_recharges") as any)
      .select("*, starlink_accounts(starlink_account_number,kit_serial,terminal_id,plan_type), customers(company_name)")
      .eq("id", data.recharge_id)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Recharge not found");

    const from = String(row.workflow_status ?? "pending_finance");
    assertTransition(from, data.to_status);

    const now = new Date().toISOString();
    const patch: Record<string, any> = { workflow_status: data.to_status };
    let whatsapp: { link: string; sent: boolean; channel: string; detail?: string } | null = null;

    if (data.to_status === "paid") {
      patch.paid_at = now;
    }

    if (data.to_status === "message_sent") {
      const message = buildSupplierMessage({
        paymentReference: row.payment_reference,
        starlinkAccountNumber: row.starlink_accounts?.starlink_account_number,
        kitSerial: row.starlink_accounts?.kit_serial,
        terminalId: row.starlink_accounts?.terminal_id,
        planType: row.starlink_accounts?.plan_type,
        customerName: row.customers?.company_name,
        payoutUsd: Number(row.external_payout_usd ?? 0),
      });
      const res = await sendSupplierWhatsApp(STARLINK_SUPPLIER_WHATSAPP, message);
      whatsapp = { link: res.link, sent: res.sent, channel: res.channel, detail: res.detail };
      patch.whatsapp_number = STARLINK_SUPPLIER_WHATSAPP;
      patch.whatsapp_message = message;
      patch.message_channel = res.channel;
      patch.message_sent_at = now;
      // Provider sends move straight to awaiting supplier with a 1h re-check.
      if (res.sent) {
        patch.workflow_status = "awaiting_supplier";
        patch.next_check_at = new Date(Date.now() + SUPPLIER_RECHECK_MINUTES * 60_000).toISOString();
        patch.check_attempts = 0;
      }
    }

    if (data.to_status === "awaiting_supplier") {
      patch.next_check_at = new Date(Date.now() + SUPPLIER_RECHECK_MINUTES * 60_000).toISOString();
      patch.check_attempts = 0;
    }

    if (data.supplier_reply) {
      patch.supplier_reply = data.supplier_reply;
      patch.supplier_checked_at = now;
    }

    if (data.to_status === "completed") {
      patch.completed_at = now;
      patch.external_status = "confirmed";
      patch.status = "completed";
      patch.next_check_at = null;
    }

    if (data.to_status === "failed") {
      patch.failure_reason = data.note?.trim() || "Supplier did not confirm the recharge.";
      patch.external_status = "failed";
      patch.status = "failed";
      patch.next_check_at = null;
    }

    if (data.to_status === "cancelled") {
      patch.status = "cancelled";
      patch.external_status = "cancelled";
      patch.next_check_at = null;
    }

    const { data: updated, error: upErr } = await (supabaseAdmin.from("starlink_recharges") as any)
      .update(patch)
      .eq("id", row.id)
      .select("*")
      .single();
    if (upErr) throw new Error(upErr.message);

    const finalStatus = patch.workflow_status as any;
    await recordRechargeEvent(supabaseAdmin, {
      recharge_id: row.id,
      from_status: from,
      to_status: finalStatus,
      note: data.note?.trim() || (whatsapp ? `WhatsApp ${whatsapp.channel}${whatsapp.sent ? " sent" : " prepared"}` : null),
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
    });

    await recordCustomerEvent(supabaseAdmin, {
      customer_id: row.customer_id,
      account_number: row.account_number,
      event_type: `starlink_recharge_${finalStatus}`,
      title: `Starlink recharge ${String(finalStatus).replace(/_/g, " ")}`,
      description: `${row.payment_reference ?? row.id} · USD ${Number(row.customer_charge_usd ?? 0).toFixed(2)}${data.note ? ` · ${data.note.trim()}` : ""}`,
      module: "starlink",
      entity_type: "starlink_recharge",
      entity_id: row.id,
      old_value: { workflow_status: from },
      new_value: { workflow_status: finalStatus },
      major: ["completed", "failed", "cancelled"].includes(String(finalStatus)),
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
    });

    if (["completed", "failed"].includes(String(finalStatus))) {
      await notifyStarlinkStaff(
        supabaseAdmin,
        `Starlink recharge ${finalStatus}`,
        `${row.account_number} · ${row.payment_reference ?? row.id}${patch.failure_reason ? ` · ${patch.failure_reason}` : ""}`,
      );
    }

    return { recharge: updated, whatsapp, status: finalStatus };
  });
