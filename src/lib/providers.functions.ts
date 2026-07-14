import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProviderName } from "./providers/types";

export const listCloudProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listProviders } = await import("./providers/registry.server");
    return listProviders();
  });

export const listProviderRegions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: ProviderName }) => d)
  .handler(async ({ data }) => {
    const { getProvider } = await import("./providers/registry.server");
    return getProvider(data.provider).listRegions();
  });

export const listProviderImages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: ProviderName; region: string }) => d)
  .handler(async ({ data }) => {
    const { getProvider } = await import("./providers/registry.server");
    return getProvider(data.provider).listImages(data.region);
  });

export const listProviderInstanceTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
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
  .handler(async ({ data }) => {
    const { getProvider } = await import("./providers/registry.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const provider = getProvider(data.provider);

    let account_number: string | null = null;
    if (data.customer_id) {
      const { data: c } = await supabaseAdmin
        .from("customers").select("account_number").eq("id", data.customer_id).single();
      account_number = c?.account_number ?? null;
    }

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
      password: data.password,
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
      })
      .select().single();
    if (sErr || !server) throw new Error(sErr?.message ?? "Failed to create server record");

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
        request_payload: data as any, provider_response: result.raw as any,
        started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      });
      await supabaseAdmin.from("cloud_activity").insert({
        server_id: server.id, action: "provision.completed",
        detail: { provider: data.provider, region: data.region } as any,
      });
      return { server_id: server.id, provider_server_id: result.provider_server_id };
    } catch (e: any) {
      await supabaseAdmin.from("cloud_servers").update({ status: "failed" }).eq("id", server.id);
      await supabaseAdmin.from("cloud_deployments").insert({
        server_id: server.id, action: "provision", status: "failed",
        error: e.message, request_payload: data as any,
        completed_at: new Date().toISOString(),
      });
      throw e;
    }
  });
