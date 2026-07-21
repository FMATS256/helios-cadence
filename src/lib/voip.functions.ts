import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ---------------- List ---------------- */
export const listVoipAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("voip_accounts")
      .select("*, customers(id,company_name,account_number,primary_email)")
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listVoipRecharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { voip_account_id?: string; limit?: number }) => d)
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any)
      .from("voip_recharges")
      .select("*, voip_accounts(voip_number,dandemutande_account)")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.voip_account_id) q = q.eq("voip_account_id", data.voip_account_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ---------------- Create VoIP account ---------------- */
export const createVoipAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    customer_id?: string | null;
    voip_number: string;
    dandemutande_account?: string;
    sip_username?: string;
    sip_password?: string;
    extensions?: string[];
    balance_usd?: number;
    low_balance_threshold_usd?: number;
    status?: string;
    notes?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    if (!data.voip_number?.trim()) throw new Error("VoIP number required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptSecret } = await import("./encryption.server");

    let sipCredId: string | null = null;
    if (data.sip_password?.trim()) {
      const enc = encryptSecret(data.sip_password);
      const { data: cred, error: ce } = await supabaseAdmin.from("credentials").insert({
        customer_id: data.customer_id ?? null,
        name: `VoIP ${data.voip_number} — SIP`,
        credential_type: "voip",
        username: data.sip_username ?? null,
        url: "https://dandemutande.africa/enterprise/self-service/voip-self-service/",
        notes: `SIP credentials for VoIP number ${data.voip_number}`,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        auth_tag: enc.authTag,
        key_id: enc.keyId,
        tags: ["voip", "sip", "dandemutande"],
        created_by: context.userId,
        owner_id: context.userId,
      }).select("id").single();
      if (ce) throw new Error(ce.message);
      sipCredId = cred?.id ?? null;
    }

    const { data: row, error } = await (supabaseAdmin.from("voip_accounts") as any).insert({
      customer_id: data.customer_id ?? null,
      voip_number: data.voip_number.trim(),
      dandemutande_account: data.dandemutande_account ?? null,
      sip_username: data.sip_username ?? null,
      sip_password_credential_id: sipCredId,
      extensions: data.extensions ?? [],
      balance_usd: data.balance_usd ?? 0,
      balance_updated_at: data.balance_usd != null ? new Date().toISOString() : null,
      low_balance_threshold_usd: data.low_balance_threshold_usd ?? 5,
      status: data.status ?? "active",
      notes: data.notes ?? null,
      created_by: context.userId,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

/* ---------------- Update balance / status ---------------- */
export const updateVoipAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    balance_usd?: number;
    status?: string;
    low_balance_threshold_usd?: number;
    notes?: string;
    extensions?: string[];
  }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, any> = {};
    if (data.balance_usd != null) { patch.balance_usd = data.balance_usd; patch.balance_updated_at = new Date().toISOString(); }
    if (data.status) patch.status = data.status;
    if (data.low_balance_threshold_usd != null) patch.low_balance_threshold_usd = data.low_balance_threshold_usd;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.extensions) patch.extensions = data.extensions;
    const { error } = await ((supabaseAdmin.from("voip_accounts") as any) as any).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Recharge workflow ---------------- */
export const recordVoipRecharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    voip_account_id: string;
    amount_usd: number;
    payment_reference?: string;
    payment_method?: string;
    pop_url?: string;
    notes?: string;
    send_email?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    if (!data.amount_usd || data.amount_usd <= 0) throw new Error("Amount must be > 0");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: acct, error: ae } = await supabaseAdmin
      .from("voip_accounts").select("*").eq("id", data.voip_account_id).single();
    if (ae || !acct) throw new Error(ae?.message ?? "VoIP account not found");

    const balanceBefore = Number(acct.balance_usd ?? 0);
    const balanceAfter = balanceBefore + data.amount_usd;
    const receiptNumber = `RCH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`;

    const { data: recharge, error: re } = await (supabaseAdmin.from("voip_recharges") as any).insert({
      voip_account_id: data.voip_account_id,
      customer_id: acct.customer_id,
      amount_usd: data.amount_usd,
      payment_reference: data.payment_reference ?? null,
      payment_method: data.payment_method ?? "manual",
      pop_url: data.pop_url ?? null,
      receipt_number: receiptNumber,
      status: "submitted",
      email_status: "pending",
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      requested_by: context.userId,
      notes: data.notes ?? null,
    }).select().single();
    if (re || !recharge) throw new Error(re?.message ?? "Recharge insert failed");

    // Optimistically update balance
    await (supabaseAdmin.from("voip_accounts") as any).update({
      balance_usd: balanceAfter,
      balance_updated_at: new Date().toISOString(),
      last_successful_recharge_at: new Date().toISOString(),
    }).eq("id", data.voip_account_id);

    // Send Proof of Payment email to Dandemutande
    let emailStatus: "sent" | "failed" | "skipped" = "skipped";
    let emailError: string | null = null;
    if (data.send_email !== false) {
      try {
        const { sendLovableEmail } = await import("@lovable.dev/email-js");
        const html = buildPopEmail({
          number: acct.voip_number,
          account: acct.dandemutande_account ?? "—",
          amountUsd: data.amount_usd,
          reference: data.payment_reference ?? "—",
          method: data.payment_method ?? "manual",
          receipt: receiptNumber,
          notes: data.notes,
        });
        const subject = `Proof of Payment · ${acct.voip_number} · USD ${data.amount_usd.toFixed(2)} · Ref ${data.payment_reference ?? receiptNumber}`;
        const from = `IMT Cloud Billing <noreply@lovable.app>`;
        await sendLovableEmail(
          { from, to: "[email protected]", subject, html, text: html.replace(/<[^>]+>/g, " ") },
          { apiKey: process.env.LOVABLE_API_KEY!, idempotencyKey: `voip-pop-${recharge.id}` },
        );
        emailStatus = "sent";
      } catch (e: any) {
        emailStatus = "failed";
        emailError = e?.message ?? String(e);
      }
    }

    await (supabaseAdmin.from("voip_recharges") as any).update({
      email_status: emailStatus,
      email_error: emailError,
      status: emailStatus === "sent" ? "submitted" : "submitted",
    }).eq("id", recharge.id);

    return { recharge_id: recharge.id, receipt_number: receiptNumber, email_status: emailStatus, email_error: emailError };
  });

function buildPopEmail(p: {
  number: string; account: string; amountUsd: number; reference: string; method: string; receipt: string; notes?: string;
}) {
  return `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#fff;color:#111">
  <div style="border-bottom:3px solid #F5A623;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0">Proof of Payment · VoIP Recharge</h2>
    <p style="margin:4px 0 0;color:#666">Receipt: <strong>${p.receipt}</strong></p>
  </div>
  <p>Dear Dandemutande Support,</p>
  <p>Please find below the proof of payment for a VoIP recharge on our behalf. Kindly apply the funds and confirm.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:8px;background:#F7F7F7;width:180px">VoIP Number</td><td style="padding:8px"><strong>${p.number}</strong></td></tr>
    <tr><td style="padding:8px;background:#F7F7F7">Dandemutande Account</td><td style="padding:8px">${p.account}</td></tr>
    <tr><td style="padding:8px;background:#F7F7F7">Amount</td><td style="padding:8px"><strong>USD ${p.amountUsd.toFixed(2)}</strong></td></tr>
    <tr><td style="padding:8px;background:#F7F7F7">Payment Reference</td><td style="padding:8px">${p.reference}</td></tr>
    <tr><td style="padding:8px;background:#F7F7F7">Payment Method</td><td style="padding:8px">${p.method}</td></tr>
    ${p.notes ? `<tr><td style="padding:8px;background:#F7F7F7">Notes</td><td style="padding:8px">${p.notes}</td></tr>` : ""}
  </table>
  <p>Please reply to this email once the recharge has been applied.</p>
  <p style="margin-top:32px">Thank you,<br/><strong>IMT Cloud Operations</strong></p>
</div>`.trim();
}

/* ---------------- Firecrawl sync (public parts only) ---------------- */
export const syncVoipAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acct } = await supabaseAdmin
      .from("voip_accounts").select("*").eq("id", data.id).single();
    if (!acct) throw new Error("VoIP account not found");

    const lovableKey = process.env.LOVABLE_API_KEY;
    const fcKey = process.env.FIRECRAWL_API_KEY;
    if (!lovableKey || !fcKey) {
      throw new Error("Firecrawl connector not configured");
    }

    try {
      const res = await fetch("https://connector-gateway.lovable.dev/firecrawl/v2/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": fcKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: "https://dandemutande.africa/enterprise/self-service/voip-self-service/",
          formats: ["markdown", "links"],
          onlyMainContent: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Firecrawl ${res.status}`);

      const extracted = {
        scraped_at: new Date().toISOString(),
        page_title: body?.metadata?.title ?? body?.data?.metadata?.title ?? null,
        markdown_preview: (body?.markdown ?? body?.data?.markdown ?? "").slice(0, 800),
        links_count: (body?.links ?? body?.data?.links ?? []).length,
        note: "Portal balance requires authenticated session — enter manually via 'Update balance'.",
      };

      await (supabaseAdmin.from("voip_sync_log") as any).insert({
        voip_account_id: data.id, status: "ok", source: "firecrawl", extracted: extracted as any,
      });
      await (supabaseAdmin.from("voip_accounts") as any).update({ last_synced_at: new Date().toISOString() }).eq("id", data.id);
      return { ok: true, extracted };
    } catch (e: any) {
      await (supabaseAdmin.from("voip_sync_log") as any).insert({
        voip_account_id: data.id, status: "error", source: "firecrawl", error: e?.message ?? String(e),
      });
      throw e;
    }
  });

export const lookupDandemutandeVoip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { voip_number: string }) => d)
  .handler(async ({ data }) => {
    const number = data.voip_number?.trim();
    if (!number) throw new Error("VoIP number is required");

    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!firecrawlKey || !lovableKey) throw new Error("Firecrawl connector is not configured");

    const baseUrl = "https://connector-gateway.lovable.dev/firecrawl/v2";
    const headers: Record<string, string> = {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": firecrawlKey,
      "Content-Type": "application/json",
    };

    const callFirecrawl = async (path: string, payload: Record<string, unknown>) => {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let body: any;
      try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
      if (!res.ok) throw new Error(body?.error || body?.message || `Firecrawl ${path} failed (${res.status})`);
      return body;
    };

    const query = `site:dandemutande.africa ${number} OR ${number.replace(/\s+/g, "")}`;
    const portalUrl = "https://dandemutande.africa/enterprise/self-service/voip-self-service/";
    const [searchResult, portalResult] = await Promise.allSettled([
      callFirecrawl("/search", {
        query,
        limit: 8,
        scrapeOptions: { formats: ["markdown"] },
      }),
      callFirecrawl("/scrape", {
        url: portalUrl,
        formats: ["markdown", "links", "summary"],
        onlyMainContent: true,
      }),
    ]);

    const search = searchResult.status === "fulfilled" ? searchResult.value : { error: searchResult.reason?.message ?? String(searchResult.reason) };
    const portal = portalResult.status === "fulfilled" ? portalResult.value : { error: portalResult.reason?.message ?? String(portalResult.reason) };
    const searchRows = Array.isArray(search?.data) ? search.data : [];
    const compactNumber = number.replace(/\D/g, "");
    const matches = searchRows.filter((row: any) => {
      const haystack = `${row.title ?? ""} ${row.description ?? ""} ${row.markdown ?? ""}`.replace(/\D/g, "");
      return compactNumber && haystack.includes(compactNumber);
    });

    return {
      voip_number: number,
      searched_at: new Date().toISOString(),
      query,
      portal_url: portalUrl,
      matches,
      search_results: searchRows.map((row: any) => ({
        url: row.url,
        title: row.title,
        description: row.description,
        markdown_preview: String(row.markdown ?? "").slice(0, 1200),
      })),
      portal: {
        title: portal?.metadata?.title ?? portal?.data?.metadata?.title ?? null,
        summary: portal?.summary ?? portal?.data?.summary ?? null,
        links: portal?.links ?? portal?.data?.links ?? [],
        markdown_preview: String(portal?.markdown ?? portal?.data?.markdown ?? "").slice(0, 1600),
        error: portal?.error ?? null,
      },
      error: search?.error ?? null,
    };
  });

/* ---------------- Dashboard summary ---------------- */
export const voipSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: accts } = await (context.supabase as any)
      .from("voip_accounts").select("id,status,balance_usd,low_balance_threshold_usd").is("archived_at", null);
    const { data: rechargesRaw } = await (context.supabase as any)
      .from("voip_recharges").select("id,status,amount_usd,created_at").order("created_at", { ascending: false }).limit(10);

    const rows = (accts ?? []) as Array<{ status: string; balance_usd: number; low_balance_threshold_usd: number }>;
    const recharges = (rechargesRaw ?? []) as Array<{ id: string; status: string; amount_usd: number; created_at: string }>;
    return {
      total: rows.length,
      active: rows.filter((r) => r.status === "active").length,
      suspended: rows.filter((r) => r.status === "suspended").length,
      low_balance: rows.filter((r) => Number(r.balance_usd) <= Number(r.low_balance_threshold_usd ?? 0)).length,
      total_balance: rows.reduce((s, r) => s + Number(r.balance_usd ?? 0), 0),
      recent_recharges: recharges,
      pending: recharges.filter((r) => r.status === "pending" || r.status === "submitted").length,
    };
  });
