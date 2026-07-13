// Vultr adapter — implements CloudProvider against Vultr API v2.
import type {
  CloudProvider, InstanceType, PowerAction, PriceEstimate,
  ProvisionRequest, ProvisionResult, Region,
} from "../types";

const BASE = "https://api.vultr.com/v2";

function key() {
  const k = process.env.VULTR_API_KEY;
  if (!k) throw new Error("VULTR_API_KEY not configured");
  return k;
}

async function vultr<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vultr ${init?.method ?? "GET"} ${path} ${res.status}: ${body}`);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

function detectOs(name: string): any {
  const n = name.toLowerCase();
  if (n.includes("ubuntu")) return "ubuntu";
  if (n.includes("debian")) return "debian";
  if (n.includes("alma")) return "almalinux";
  if (n.includes("rocky")) return "rocky";
  if (n.includes("windows")) return "windows";
  return undefined;
}

export const vultrAdapter: CloudProvider = {
  name: "vultr",
  displayName: "Vultr",
  supports: ["vm", "block_storage", "firewall", "floating_ip", "backup", "load_balancer", "object_storage"],

  async listRegions(): Promise<Region[]> {
    const r = await vultr<{ regions: any[] }>("/regions");
    return (r.regions ?? []).map((x) => ({
      id: x.id, name: `${x.city}, ${x.country}`, country: x.country, city: x.city,
    }));
  },

  async listImages() {
    const r = await vultr<{ os: any[] }>("/os");
    return (r.os ?? []).map((o) => ({ id: String(o.id), name: o.name, os: detectOs(o.name) }));
  },

  async listInstanceTypes(region: string): Promise<InstanceType[]> {
    const r = await vultr<{ plans: any[] }>("/plans");
    return (r.plans ?? [])
      .filter((p) => !region || (p.locations ?? []).includes(region))
      .map((p) => ({
        id: p.id,
        cpu_cores: p.vcpu_count,
        ram_mb: p.ram,
        disk_gb: p.disk,
        monthly_usd: Number(p.monthly_cost),
        hourly_usd: Number(p.hourly_cost ?? p.monthly_cost / 730),
        family: p.type,
      }));
  },

  async estimatePrice(req: ProvisionRequest): Promise<PriceEstimate> {
    const plans = await this.listInstanceTypes(req.region);
    const match =
      plans.find((p) => p.id === req.template_params?.plan) ??
      plans.find((p) => p.cpu_cores >= (req.cpu_cores ?? 1) && p.ram_mb >= (req.ram_mb ?? 1024))
      ?? plans[0];
    const monthly = match?.monthly_usd ?? 6;
    const backup = req.daily_backup ? monthly * 0.2 : 0;
    const total = round(monthly + backup);
    return {
      monthly_usd: total,
      hourly_usd: round(total / 730),
      currency: "USD",
      breakdown: [
        { label: `Plan ${match?.id ?? "auto"}`, monthly_usd: round(monthly) },
        ...(backup ? [{ label: "Automated backups", monthly_usd: round(backup) }] : []),
      ],
    };
  },

  async createServer(req: ProvisionRequest): Promise<ProvisionResult> {
    const plans = await this.listInstanceTypes(req.region);
    const plan =
      (req.template_params?.plan as string) ??
      plans.find((p) => p.cpu_cores >= (req.cpu_cores ?? 1) && p.ram_mb >= (req.ram_mb ?? 1024))?.id ??
      plans[0]?.id;
    if (!plan) throw new Error("No Vultr plan available in region");
    const body: any = {
      region: req.region,
      plan,
      os_id: req.image ? Number(req.image) : 1743, // Ubuntu 22.04 default
      label: req.name,
      hostname: req.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
      backups: req.daily_backup ? "enabled" : "disabled",
      enable_ipv6: true,
      tags: req.tags,
    };
    if (req.ssh_key) body.sshkey_id = [req.ssh_key];
    const r = await vultr<{ instance: any }>("/instances", { method: "POST", body: JSON.stringify(body) });
    return {
      provider_server_id: r.instance.id,
      public_ips: r.instance.main_ip ? [r.instance.main_ip] : [],
      private_ips: r.instance.internal_ip ? [r.instance.internal_ip] : [],
      root_password_ref: r.instance.default_password,
      raw: r.instance,
    };
  },

  async getServer(id: string) {
    const r = await vultr<{ instance: any }>(`/instances/${id}`);
    return {
      status: r.instance.status,
      power_state: r.instance.power_status ?? "unknown",
      raw: r.instance,
    };
  },

  async powerAction(id: string, action: PowerAction) {
    const path = action === "on" ? "start" : action === "off" ? "halt" : "reboot";
    await vultr(`/instances/${id}/${path}`, { method: "POST" });
  },

  async terminate(id: string) {
    await vultr(`/instances/${id}`, { method: "DELETE" });
  },
};

function round(n: number) { return Math.round(n * 100) / 100; }
