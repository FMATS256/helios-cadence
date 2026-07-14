import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProviderName } from "./providers/types";

export const listCloudProviders = createServerFn({ method: "GET" })
  .handler(async () => {
    const { listProviders } = await import("./providers/registry.server");
    return listProviders();
  });

export const listProviderRegions = createServerFn({ method: "GET" })
  .inputValidator((d: { provider: ProviderName }) => d)
  .handler(async ({ data }) => {
    const { getProvider } = await import("./providers/registry.server");
    return getProvider(data.provider).listRegions();
  });

export const listProviderImages = createServerFn({ method: "GET" })
  .inputValidator((d: { provider: ProviderName; region: string }) => d)
  .handler(async ({ data }) => {
    const { getProvider } = await import("./providers/registry.server");
    return getProvider(data.provider).listImages(data.region);
  });

export const listProviderInstanceTypes = createServerFn({ method: "GET" })
  .inputValidator((d: { provider: ProviderName; region: string }) => d)
  .handler(async ({ data }) => {
    const { getProvider } = await import("./providers/registry.server");
    return getProvider(data.provider).listInstanceTypes(data.region);
  });

export const provisionOnProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    provider: ProviderName;
    customer_id?: string | null;
    name: string;
    region: string;
    image?: string;
    cpu_type?: string;
    cpu_cores?: number;
    ram_mb?: number;
    disk_gb?: number;
    plan_id?: string;
    ssh_key?: string;
    password?: string;
    daily_backup?: boolean;
    monitoring?: boolean;
    billing_cycle?: "hourly" | "monthly";
    selling_price_usd?: number;
    monthly_cost_usd?: number;
    notes?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { getProvider } = await import("./providers/registry.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptSecret } = await import("./encryption.server");
    const { randomBytes } = await import("crypto");
    const provider = getProvider(data.provider);

    let account_number: string | null = null;
    if (data.customer_id) {
      const { data: c } = await supabaseAdmin
        .from("customers").select("account_number").eq("id", data.customer_id).single();
      account_number = c?.account_number ?? null;
    }

    // Auto-generate a strong root password if none supplied
    const genPassword = () => {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^*";
      const bytes = randomBytes(20);
      let out = "";
      for (let i = 0; i < 20; i++) out += alphabet[bytes[i]! % alphabet.length];
      return out;
    };
    const rootPassword = data.password?.trim() || genPassword();

    const req: any = {
      kind: "vm" as const,
      name: data.name,
      region: data.region,
      image: data.image,
      cpu_type: data.cpu_type,
      cpu_cores: data.cpu_cores,
      ram_mb: data.ram_mb,
      disk_gb: data.disk_gb,
      ssh_key: data.ssh_key,
      password: rootPassword,
      daily_backup: data.daily_backup,
      monitoring: data.monitoring,
      billing_cycle: data.billing_cycle,
      customer_id: data.customer_id ?? null,
      selling_price_usd: data.selling_price_usd,
      notes: data.notes,
      template_params: data.plan_id ? { plan: data.plan_id } : {},
    };

    const estimate = await provider.estimatePrice(req).catch(() => null);
    const monthly_cost_usd = data.monthly_cost_usd ?? estimate?.monthly_usd ?? 0;

    const { data: server, error: sErr } = await supabaseAdmin
      .from("cloud_servers")
      .insert({
        customer_id: data.customer_id ?? null,
        account_number,
        provider: data.provider,
        name: data.name,
        datacenter: data.region,
        image: data.image ?? null,
        cpu_cores: data.cpu_cores ?? null,
        ram_mb: data.ram_mb ?? null,
        disk_sizes_gb: data.disk_gb ? [data.disk_gb] : [],
        power_state: "starting",
        status: "provisioning",
        monthly_cost_usd,
        selling_price_usd: data.selling_price_usd ?? 0,
        billing_cycle: data.billing_cycle ?? "monthly",
        ssh_key: data.ssh_key ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select().single();
    if (sErr || !server) throw new Error(sErr?.message ?? "Failed to create server record");

    // Save root password to credentials vault immediately (encrypted)
    try {
      const enc = encryptSecret(rootPassword);
      const { data: cred } = await supabaseAdmin.from("credentials").insert({
        customer_id: data.customer_id ?? null,
        account_number,
        name: `${data.name} — root`,
        credential_type: "server",
        username: "root",
        url: null,
        notes: `Auto-generated at provisioning · provider ${data.provider} · region ${data.region}`,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        auth_tag: enc.authTag,
        key_id: enc.keyId,
        linked_asset: server.id,
        tags: ["auto", "server", data.provider],
        created_by: context.userId,
        owner_id: context.userId,
      }).select("id").single();
      if (cred?.id) {
        await supabaseAdmin.from("cloud_servers")
          .update({ root_password_ref: cred.id }).eq("id", server.id);
      }
    } catch (e: any) {
      console.error("Failed to save root credential", e);
    }

    try {
      const result = await provider.createServer(req);
      await supabaseAdmin.from("cloud_servers").update({
        provider_server_id: result.provider_server_id,
        public_ips: result.public_ips,
        private_ips: result.private_ips,
        power_state: "on",
        status: "active",
      }).eq("id", server.id);

      await supabaseAdmin.from("cloud_deployments").insert({
        server_id: server.id, action: "provision", status: "completed",
        provider_command_id: result.provider_server_id,
        request_payload: { ...data, password: "***" } as any, provider_response: result.raw as any,
        started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      });
      await supabaseAdmin.from("cloud_activity").insert({
        server_id: server.id, action: "provision.completed",
        detail: { provider: data.provider, region: data.region, root_credential_saved: true } as any,
      });
      return { server_id: server.id, provider_server_id: result.provider_server_id, root_password_saved: true };
    } catch (e: any) {
      await supabaseAdmin.from("cloud_servers").update({ status: "failed" }).eq("id", server.id);
      await supabaseAdmin.from("cloud_deployments").insert({
        server_id: server.id, action: "provision", status: "failed",
        error: e.message, request_payload: { ...data, password: "***" } as any,
        completed_at: new Date().toISOString(),
      });
      throw e;
    }
  });

/* ------------------------- Live price estimation ------------------------- */
export const estimateProviderPrice = createServerFn({ method: "POST" })
  .inputValidator((d: {
    provider: ProviderName;
    region: string;
    plan_id?: string;
    cpu_type?: string;
    cpu_cores?: number;
    ram_mb?: number;
    disk_gb?: number;
    daily_backup?: boolean;
    monitoring?: boolean;
  }) => d)
  .handler(async ({ data }) => {
    const { getProvider } = await import("./providers/registry.server");
    const provider = getProvider(data.provider);
    return provider.estimatePrice({
      kind: "vm",
      name: "estimate",
      region: data.region,
      cpu_type: data.cpu_type,
      cpu_cores: data.cpu_cores,
      ram_mb: data.ram_mb,
      disk_gb: data.disk_gb,
      daily_backup: data.daily_backup,
      monitoring: data.monitoring,
      template_params: data.plan_id ? { plan: data.plan_id } : {},
    } as any);
  });

/* ------------------------- Handover to customer ------------------------- */
export const sendServerHandover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string; contact_email?: string; root_password?: string; message?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s, error } = await supabaseAdmin
      .from("cloud_servers")
      .select("id,name,provider,datacenter,image,public_ips,private_ips,cpu_cores,ram_mb,disk_sizes_gb,customer_id,account_number")
      .eq("id", data.server_id).single();
    if (error || !s) throw new Error(error?.message ?? "Server not found");

    // Resolve recipient
    let to = data.contact_email ?? null;
    let contactName = "";
    if (!to && s.customer_id) {
      const { data: c } = await supabaseAdmin
        .from("customer_contacts")
        .select("email,name,is_primary")
        .eq("customer_id", s.customer_id).is("archived_at", null)
        .order("is_primary", { ascending: false })
        .limit(1).maybeSingle();
      to = c?.email ?? null;
      contactName = c?.name ?? "";
    }
    if (!to) throw new Error("No customer contact email on file. Add a contact or pass one in.");

    const ip = (s.public_ips as any[] | null)?.[0] ?? "—";
    const subject = `Your new server "${s.name}" is ready`;
    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
  <h2 style="margin:0 0 12px">Your server is ready</h2>
  <p>Hi ${contactName || "there"},</p>
  <p>${data.message ?? "We've provisioned a new cloud server for you. Details below."}</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px 0;color:#666">Name</td><td><strong>${s.name}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#666">Provider</td><td>${s.provider}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Datacenter</td><td>${s.datacenter ?? "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#666">OS image</td><td>${s.image ?? "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Specs</td><td>${s.cpu_cores ?? "?"} vCPU · ${((s.ram_mb ?? 0) / 1024).toFixed(0)} GB RAM · ${(s.disk_sizes_gb as number[] ?? []).join(" + ")} GB</td></tr>
    <tr><td style="padding:6px 0;color:#666">Public IP</td><td style="font-family:monospace"><strong>${ip}</strong></td></tr>
    ${data.root_password ? `<tr><td style="padding:6px 0;color:#666">Root user</td><td style="font-family:monospace">root</td></tr><tr><td style="padding:6px 0;color:#666">Root password</td><td style="font-family:monospace">${data.root_password}</td></tr>` : ""}
  </table>
  <p style="color:#666;font-size:12px">Please change the root password on first login. Reply to this email for any assistance.</p>
</div>`.trim();

    let emailStatus: "sent" | "skipped" = "skipped";
    let emailError: string | null = null;
    try {
      const { sendLovableEmail, EmailAPIError } = await import("@lovable.dev/email-js");
      const fromDomain = process.env.EMAIL_SENDER_DOMAIN ?? process.env.SENDER_DOMAIN ?? "";
      const from = fromDomain ? `IMT Cloud <noreply@${fromDomain}>` : "IMT Cloud <noreply@lovable.app>";
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      await sendLovableEmail(
        { from, to, subject, html, text },
        { apiKey: process.env.LOVABLE_API_KEY!, idempotencyKey: `handover-${s.id}` },
      );
      emailStatus = "sent";
    } catch (e: any) {
      emailError = e?.message ?? String(e);
    }

    await supabaseAdmin.from("cloud_servers").update({
      handed_over_at: new Date().toISOString(),
      handed_over_by: context.userId,
      handed_over_to_email: to,
    } as any).eq("id", s.id);
    await supabaseAdmin.from("cloud_activity").insert({
      server_id: s.id,
      action: emailStatus === "sent" ? "handover.email_sent" : "handover.recorded",
      detail: { to, email_error: emailError } as any,
    });

    return { ok: true, to, email_status: emailStatus, email_error: emailError, packet: { subject, html } };
  });

