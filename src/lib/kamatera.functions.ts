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

export const verifyKamatera = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { ping } = await import("./kamatera.server");
    const res = await ping();
    return {
      ok: true as const,
      datacenterCount: res.datacenterCount,
      serverCount: res.serverCount,
      code: null as string | null,
      error: null as string | null,
    };
  } catch (e: any) {
    return {
      ok: false as const,
      datacenterCount: 0,
      serverCount: 0,
      code: (e?.code as string) ?? "kamatera_error",
      error: (e?.message as string) ?? "Unknown error",
    };
  }
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

/** Sync every Kamatera server into cloud_servers, upserting by provider_server_id / name. */
export const syncServers = createServerFn({ method: "POST" }).handler(async () => {
  const { listServers } = await import("./kamatera.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const remote = await listServers();
  const list = Array.isArray(remote) ? remote : [];

  let created = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const r of list) {
    const providerId: string = String(r.id ?? r.name ?? "");
    const name: string = String(r.name ?? r.id ?? "unknown");
    const power: string = String(r.power ?? "unknown").toLowerCase();
    const publicIps: string[] = [];
    const privateIps: string[] = [];
    for (const n of (r.networks ?? [])) {
      const ips = n.ips ?? n.ip ?? [];
      const arr = Array.isArray(ips) ? ips : [ips];
      if (String(n.network ?? n.name ?? "").toLowerCase().includes("wan")) publicIps.push(...arr);
      else privateIps.push(...arr);
    }
    const cpuStr = String(r.cpu ?? "");
    const cpuCores = parseInt(cpuStr, 10) || null;
    const cpuType = cpuStr.slice(-1) || null;
    const diskArr: number[] = Array.isArray(r.diskSizes) ? r.diskSizes
      : Array.isArray(r.disk_sizes) ? r.disk_sizes
      : [];
    const monthly = Number(r.priceMonthlyOn ?? r.priceMonthly ?? r.price ?? 0) || 0;

    // Existing?
    const { data: existing } = await supabaseAdmin
      .from("cloud_servers")
      .select("id, selling_price_usd")
      .eq("provider", "kamatera")
      .or(`provider_server_id.eq.${providerId},name.eq.${name}`)
      .maybeSingle();

    const patch: any = {
      provider: "kamatera",
      provider_server_id: providerId,
      name,
      datacenter: r.datacenter ?? null,
      image: r.image ?? null,
      cpu_type: cpuType,
      cpu_cores: cpuCores,
      ram_mb: Number(r.ram) || null,
      disk_sizes_gb: diskArr,
      networks: (r.networks ?? []) as any,
      public_ips: publicIps,
      private_ips: privateIps,
      power_state: power === "on" ? "on" : power === "off" ? "off" : "unknown",
      status: "active",
      monthly_cost_usd: monthly,
      billing_cycle: r.billing ?? r.billingcycle ?? "monthly",
      provider_meta: r as any,
      last_synced_at: now,
    };

    if (existing) {
      await supabaseAdmin.from("cloud_servers").update(patch).eq("id", existing.id);
      updated++;
    } else {
      await supabaseAdmin.from("cloud_servers").insert(patch);
      created++;
    }
  }

  return { total: list.length, created, updated };
});

export const refreshServer = createServerFn({ method: "POST" })
  .inputValidator((d: { server_id: string }) => d)
  .handler(async ({ data }) => {
    const { getServerInfo } = await import("./kamatera.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: srv, error } = await supabaseAdmin
      .from("cloud_servers").select("*").eq("id", data.server_id).single();
    if (error || !srv) throw new Error("Server not found");

    const info = await getServerInfo(srv.provider_server_id ?? srv.name);
    const r = Array.isArray(info) ? info[0] : info;
    if (!r) return { ok: false };

    const publicIps: string[] = [];
    const privateIps: string[] = [];
    for (const n of (r.networks ?? [])) {
      const ips = n.ips ?? n.ip ?? [];
      const arr = Array.isArray(ips) ? ips : [ips];
      if (String(n.network ?? n.name ?? "").toLowerCase().includes("wan")) publicIps.push(...arr);
      else privateIps.push(...arr);
    }

    await supabaseAdmin.from("cloud_servers").update({
      provider_server_id: r.id ?? srv.provider_server_id,
      power_state: String(r.power ?? "unknown").toLowerCase(),
      public_ips: publicIps.length ? publicIps : srv.public_ips,
      private_ips: privateIps.length ? privateIps : srv.private_ips,
      provider_meta: r as any,
      last_synced_at: new Date().toISOString(),
      status: "active",
    }).eq("id", srv.id);

    return { ok: true, info: r };
  });

export const serverPower = createServerFn({ method: "POST" })
  .inputValidator((d: { server_id: string; action: "poweron" | "poweroff" | "reboot" }) => d)
  .handler(async ({ data }) => {
    const { powerAction } = await import("./kamatera.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: srv } = await supabaseAdmin
      .from("cloud_servers").select("*").eq("id", data.server_id).single();
    if (!srv) throw new Error("Server not found");
    const resp = await powerAction(srv.provider_server_id ?? srv.name, data.action);
    const commandId = resp?.commandIds?.[0] ?? resp?.commandId ?? null;

    await supabaseAdmin.from("cloud_deployments").insert({
      server_id: srv.id, action: data.action,
      status: commandId ? "running" : "completed",
      provider_command_id: commandId, provider_response: resp as any,
      started_at: new Date().toISOString(),
    });
    await supabaseAdmin.from("cloud_activity").insert({
      server_id: srv.id, action: `power.${data.action}`, detail: { commandId } as any,
    });
    await supabaseAdmin.from("cloud_servers").update({
      power_state: data.action === "poweroff" ? "stopping"
        : data.action === "poweron" ? "starting" : "rebooting",
    }).eq("id", srv.id);
    return { ok: true, commandId };
  });

export const terminateServer = createServerFn({ method: "POST" })
  .inputValidator((d: { server_id: string }) => d)
  .handler(async ({ data }) => {
    const { terminateServer } = await import("./kamatera.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: srv } = await supabaseAdmin
      .from("cloud_servers").select("*").eq("id", data.server_id).single();
    if (!srv) throw new Error("Server not found");

    const resp = await terminateServer(srv.provider_server_id ?? srv.name, true);
    await supabaseAdmin.from("cloud_servers").update({
      status: "terminated", archived_at: new Date().toISOString(),
    }).eq("id", srv.id);
    await supabaseAdmin.from("cloud_activity").insert({
      server_id: srv.id, action: "server.terminated", detail: resp as any,
    });
    return { ok: true };
  });
