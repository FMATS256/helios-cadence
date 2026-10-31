// InterServer adapter — VPS "slices" via the InterServer API v2.
// Every order is charged to IMT's InterServer account, so Cloud Ops holds
// InterServer orders for staff approval before this adapter is called.
import type {
  CloudProvider, InstanceType, PowerAction, PriceEstimate,
  ProvisionRequest, ProvisionResult, Region,
} from "../types";

const BASE = "https://my.interserver.net/apiv2";

/** One slice = 1 vCPU, 2 GB RAM, 40 GB SSD. List price per slice (USD/month). */
export const INTERSERVER_SLICE_USD = 6;
export const INTERSERVER_MAX_SLICES = 16;

function key() {
  const k = process.env.INTERSERVER_API_KEY;
  if (!k) throw new Error("INTERSERVER_API_KEY not configured");
  return k;
}

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "X-API-KEY": key(),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const challenge = /cloudflare|just a moment|challenge/i.test(text);
    throw new Error(
      challenge
        ? "InterServer blocked the request with a bot check. Ask InterServer support to allow API access from our servers."
        : `InterServer ${init?.method ?? "GET"} ${path} ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  try { return (text ? JSON.parse(text) : {}) as T; } catch { return {} as T; }
}

const LOCATIONS: Region[] = [
  { id: "1", name: "Secaucus, New Jersey", country: "US", city: "Secaucus" },
  { id: "2", name: "Los Angeles, California", country: "US", city: "Los Angeles" },
  { id: "3", name: "Equinix NY4, New York", country: "US", city: "New York" },
];

const IMAGES = [
  { id: "ubuntu:22.04", name: "Ubuntu 22.04", os: "ubuntu" as const },
  { id: "ubuntu:24.04", name: "Ubuntu 24.04", os: "ubuntu" as const },
  { id: "debian:12", name: "Debian 12", os: "debian" as const },
  { id: "almalinux:9", name: "AlmaLinux 9", os: "almalinux" as const },
  { id: "rocky:9", name: "Rocky Linux 9", os: "rocky" as const },
];

export function slicePlans(): InstanceType[] {
  return Array.from({ length: INTERSERVER_MAX_SLICES }, (_, i) => {
    const s = i + 1;
    return {
      id: `slice-${s}`,
      cpu_cores: s,
      ram_mb: s * 2048,
      disk_gb: s * 40,
      monthly_usd: s * INTERSERVER_SLICE_USD,
      hourly_usd: Math.round((s * INTERSERVER_SLICE_USD / 730) * 10000) / 10000,
      family: `${s} slice${s > 1 ? "s" : ""}`,
    };
  });
}

export function slicesFor(req: Pick<ProvisionRequest, "template_params" | "cpu_cores" | "ram_mb">): number {
  const plan = String(req.template_params?.plan ?? "");
  const m = plan.match(/^slice-(\d+)$/);
  const fromPlan = m ? Number(m[1]) : 0;
  const fromSpecs = Math.max(req.cpu_cores ?? 1, Math.ceil((req.ram_mb ?? 2048) / 2048));
  return Math.min(INTERSERVER_MAX_SLICES, Math.max(1, fromPlan || fromSpecs));
}

export const interserverAdapter: CloudProvider = {
  name: "interserver",
  displayName: "InterServer",
  supports: ["vm"],

  async listRegions() { return LOCATIONS; },
  async listImages() { return IMAGES; },
  async listInstanceTypes() { return slicePlans(); },

  async estimatePrice(req: ProvisionRequest): Promise<PriceEstimate> {
    const s = slicesFor(req);
    const monthly = s * INTERSERVER_SLICE_USD;
    return {
      monthly_usd: monthly,
      hourly_usd: Math.round((monthly / 730) * 100) / 100,
      currency: "USD",
      breakdown: [{ label: `${s} slice${s > 1 ? "s" : ""}`, monthly_usd: monthly }],
    };
  },

  async createServer(req: ProvisionRequest): Promise<ProvisionResult> {
    const [distro, version] = (req.image || "ubuntu:22.04").split(":");
    const body = {
      osDistro: distro,
      osVersion: version,
      slices: slicesFor(req),
      platform: "kvm",
      location: Number(req.region || 1),
      hostname: req.name.replace(/[^a-z0-9.-]/gi, "-").toLowerCase(),
      password: req.password,
      period: 1,
      ...(req.ssh_key ? { sshKey: req.ssh_key } : {}),
    };
    const r = await api<any>("/vps/order", { method: "POST", body: JSON.stringify(body) });
    const id = r?.id ?? r?.vps_id ?? r?.serviceid ?? r?.order_id ?? r?.invoice?.id;
    if (!id) throw new Error("InterServer accepted the request but returned no server or order number.");
    return { provider_server_id: String(id), public_ips: r?.ip ? [r.ip] : [], private_ips: [], raw: r };
  },

  async getServer(id: string) {
    const r = await api<any>(`/vps/${encodeURIComponent(id)}`);
    const v = r?.vps ?? r;
    const status = String(v?.vps_status ?? v?.status ?? "unknown").toLowerCase();
    return { status, power_state: String(v?.vps_server_status ?? v?.power ?? status), raw: r };
  },

  async powerAction(id: string, action: PowerAction) {
    const path = action === "on" ? "start" : action === "off" ? "stop" : "restart";
    await api(`/vps/${encodeURIComponent(id)}/${path}`, { method: "POST" });
  },

  async terminate(id: string) {
    await api(`/vps/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  },
};
