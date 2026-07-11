import { createServerFn } from "@tanstack/react-start";

export const listDatacenters = createServerFn({ method: "GET" }).handler(async () => {
  const { listDatacenters } = await import("./kamatera.server");
  return listDatacenters();
});

export const getCapabilities = createServerFn({ method: "GET" })
  .inputValidator((d: { datacenter: string }) => d)
  .handler(async ({ data }) => {
    const { getCapabilities } = await import("./kamatera.server");
    return getCapabilities(data.datacenter);
  });

export const listImages = createServerFn({ method: "GET" })
  .inputValidator((d: { datacenter: string }) => d)
  .handler(async ({ data }) => {
    const { listImages } = await import("./kamatera.server");
    return listImages(data.datacenter);
  });

export const provisionServer = createServerFn({ method: "POST" })
  .inputValidator((d: {
    customer_id?: string | null;
    name: string;
    datacenter: string;
    image: string;
    cpu: string;
    ram: number;
    disk_size_0: number;
    disk_size_1?: number;
    password: string;
    ssh_key?: string;
    dailybackup?: "yes" | "no";
    monitoring?: "yes" | "no";
    billingcycle?: "hourly" | "monthly";
    monthlypackage?: string;
    networks?: { name: string; ip?: string }[];
    selling_price_usd?: number;
    monthly_cost_usd?: number;
    notes?: string;
  }) => d)
  .handler(async ({ data }) => {
    const { createServer } = await import("./kamatera.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Insert the local record in "provisioning" state up front.
    let account_number: string | null = null;
    if (data.customer_id) {
      const { data: c } = await supabaseAdmin
        .from("customers").select("account_number").eq("id", data.customer_id).single();
      account_number = c?.account_number ?? null;
    }

    const { data: server, error: sErr } = await supabaseAdmin
      .from("cloud_servers")
      .insert({
        customer_id: data.customer_id ?? null,
        account_number,
        provider: "kamatera",
        name: data.name,
        datacenter: data.datacenter,
        image: data.image,
        cpu_type: data.cpu.slice(-1),
        cpu_cores: parseInt(data.cpu, 10) || null,
        ram_mb: data.ram,
        disk_sizes_gb: [data.disk_size_0, ...(data.disk_size_1 ? [data.disk_size_1] : [])],
        networks: data.networks ?? [],
        power_state: "starting",
        status: "provisioning",
        monthly_cost_usd: data.monthly_cost_usd ?? 0,
        selling_price_usd: data.selling_price_usd ?? 0,
        billing_cycle: data.billingcycle ?? "monthly",
        ssh_key: data.ssh_key ?? null,
        notes: data.notes ?? null,
      })
      .select()
      .single();
    if (sErr || !server) throw new Error(sErr?.message ?? "Failed to create server record");

    // Kick off Kamatera provisioning.
    try {
      const resp = await createServer({
        name: data.name,
        password: data.password,
        passwordValidate: data.password,
        ssh_key: data.ssh_key,
        datacenter: data.datacenter,
        image: data.image,
        cpu: data.cpu,
        ram: data.ram,
        disk_size_0: data.disk_size_0,
        disk_size_1: data.disk_size_1,
        networks: data.networks ?? [{ name: "wan" }],
        dailybackup: data.dailybackup ?? "no",
        monitoring: data.monitoring ?? "no",
        managed: "no",
        billingcycle: data.billingcycle ?? "monthly",
        monthlypackage: data.monthlypackage,
        power: "on",
      });

      const commandId = resp.commandIds?.[0] ?? resp.commandId ?? null;

      await supabaseAdmin.from("cloud_deployments").insert({
        server_id: server.id,
        action: "provision",
        status: commandId ? "running" : "queued",
        provider_command_id: commandId,
        request_payload: data as any,
        provider_response: resp as any,
        started_at: new Date().toISOString(),
      });

      await supabaseAdmin.from("cloud_activity").insert({
        server_id: server.id,
        action: "provision.requested",
        detail: { commandId, datacenter: data.datacenter, image: data.image } as any,
      });

      return { server_id: server.id, commandId, response: resp };
    } catch (e: any) {
      await supabaseAdmin.from("cloud_servers").update({ status: "failed" }).eq("id", server.id);
      await supabaseAdmin.from("cloud_deployments").insert({
        server_id: server.id,
        action: "provision",
        status: "failed",
        error: e.message,
        request_payload: data as any,
        completed_at: new Date().toISOString(),
      });
      throw e;
    }
  });

export const getDeploymentStatus = createServerFn({ method: "GET" })
  .inputValidator((d: { commandId: string }) => d)
  .handler(async ({ data }) => {
    const { getCommandStatus } = await import("./kamatera.server");
    return getCommandStatus(data.commandId);
  });
