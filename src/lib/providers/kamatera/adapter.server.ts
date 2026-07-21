// Kamatera adapter — implements CloudProvider on top of kamatera.server.ts.
import type {
  CloudProvider,
  InstanceType,
  PowerAction,
  PriceEstimate,
  ProvisionRequest,
  ProvisionResult,
  Region,
} from "../types";
import { estimateKamateraMonthlyUsd } from "./pricing.server";

export const kamateraAdapter: CloudProvider = {
  name: "kamatera",
  displayName: "Kamatera",
  supports: ["vm", "block_storage", "network", "firewall", "floating_ip", "backup"],

  async listRegions(): Promise<Region[]> {
    const { listDatacenters } = await import("@/lib/kamatera.server");
    const dcs = await listDatacenters();
    return dcs.map((d) => ({
      id: d.id,
      name: d.name ?? d.id,
      country: d.category,
      city: d.subCategory,
    }));
  },

  async listImages(region: string) {
    const { listImages } = await import("@/lib/kamatera.server");
    const images = await listImages(region);
    return classifyKamateraImages(images ?? []);
  },


  async listInstanceTypes(region: string): Promise<InstanceType[]> {
    const { getCapabilities } = await import("@/lib/kamatera.server");
    const caps = await getCapabilities(region);
    const types: InstanceType[] = [];
    for (const cpu of caps.cpuTypes) {
      for (const cores of cpu.cpuCores) {
        for (const ram of cpu.ramMB) {
          const est = estimateKamateraMonthlyUsd({
            cpu_type: cpu.id,
            cpu_cores: cores,
            ram_mb: ram,
            disks_gb: [20],
          });
          types.push({
            id: `${cpu.id}-${cores}c-${ram}m`,
            cpu_cores: cores,
            ram_mb: ram,
            disk_gb: 20,
            monthly_usd: est.monthly_usd,
            hourly_usd: est.hourly_usd,
            family: cpu.id,
          });
        }
      }
    }
    return types;
  },

  async estimatePrice(req: ProvisionRequest): Promise<PriceEstimate> {
    const est = estimateKamateraMonthlyUsd({
      cpu_type: (req as any).cpu_type ?? "B",
      cpu_cores: req.cpu_cores ?? 1,
      ram_mb: req.ram_mb ?? 1024,
      disks_gb: [req.disk_gb ?? 20, ...(req.extra_disks_gb ?? [])],
      daily_backup: req.daily_backup,
      monitoring: req.monitoring,
    });
    return { ...est };
  },

  async createServer(req: ProvisionRequest): Promise<ProvisionResult> {
    const { createServer } = await import("@/lib/kamatera.server");
    if (!req.password) throw new Error("Kamatera requires a root password");
    if (!req.image) throw new Error("Kamatera requires an image id");
    const res: any = await createServer({
      name: req.name,
      password: req.password,
      passwordValidate: req.password,
      ssh_key: req.ssh_key,
      datacenter: req.region,
      image: req.image,
      cpu: `${req.cpu_cores ?? 1}${((req as any).cpu_type ?? "B").toUpperCase()}`,
      ram: req.ram_mb ?? 1024,
      disk_size_0: req.disk_gb ?? 20,
      disk_size_1: req.extra_disks_gb?.[0],
      dailybackup: req.daily_backup ? "yes" : "no",
      monitoring: req.monitoring ? "yes" : "no",
      billingcycle: req.billing_cycle ?? "monthly",
      networks: req.networks ?? [{ name: "wan" }],
    } as any);
    return {
      provider_server_id: String(res?.id ?? res?.commandIds?.[0] ?? ""),
      public_ips: res?.publicIps ?? [],
      private_ips: res?.privateIps ?? [],
      raw: res,
    };
  },

  async getServer(id: string) {
    const { getServerInfo } = await import("@/lib/kamatera.server");
    const info: any = await getServerInfo(id);
    return {
      status: info?.status ?? "unknown",
      power_state: info?.power === "on" ? "on" : info?.power === "off" ? "off" : "unknown",
      raw: info,
    };
  },

  async powerAction(id: string, action: PowerAction) {
    const { powerAction } = await import("@/lib/kamatera.server");
    const map = { on: "poweron", off: "poweroff", reboot: "reboot" } as const;
    await powerAction(id, map[action]);
  },

  async terminate(id: string) {
    const { terminateServer } = await import("@/lib/kamatera.server");
    await terminateServer(id);
  },
};

function detectOs(desc: string): "ubuntu" | "debian" | "almalinux" | "rocky" | "windows" | undefined {
  const n = desc.toLowerCase();
  if (n.startsWith("ubuntu")) return "ubuntu";
  if (n.startsWith("debian")) return "debian";
  if (n.startsWith("almalinux") || n.startsWith("alma")) return "almalinux";
  if (n.startsWith("rockylinux") || n.startsWith("rocky")) return "rocky";
  if (n.startsWith("windows")) return "windows";
  return undefined;
}

// Kamatera returns 200+ images per datacenter mixing public OS, marketplace
// apps, desktop variants and private images. Only surface the standard public
// OS catalog by default; keep the rest categorised for future tabs.
function humanizeDescription(desc: string): string {
  // ubuntu_server_22.04_64-bit → Ubuntu Server 22.04 (64-bit)
  return desc
    .replace(/_/g, " ")
    .replace(/\b64-bit\b/i, "(64-bit)")
    .replace(/\b(ubuntu|debian|almalinux|rockylinux|centos|fedora|freebsd|windows)\b/gi, (m) =>
      m[0].toUpperCase() + m.slice(1).toLowerCase(),
    )
    .replace(/\brockylinux\b/i, "Rocky Linux")
    .replace(/\bserver\b/gi, "Server")
    .replace(/\bdesktop\b/gi, "Desktop")
    .replace(/\s+/g, " ")
    .trim();
}

const OS_ORDER = ["ubuntu", "debian", "almalinux", "rocky", "windows"] as const;

function classifyKamateraImages(images: any[]) {
  const osRe = /^(ubuntu|debian|almalinux|rockylinux|centos|windows_server|freebsd|fedora)_/i;
  const desktopRe = /_desktop_/i;
  const appRe = /^(apps|service)_/i;

  const mapped = images.map((img: any) => {
    const desc: string = img.description ?? img.name ?? img.id ?? "";
    let category: "os" | "app" | "desktop" | "private" = "private";
    if (appRe.test(desc)) category = "app";
    else if (desktopRe.test(desc)) category = "desktop";
    else if (osRe.test(desc)) category = "os";
    return {
      id: img.id as string,
      name: desc ? humanizeDescription(desc) : (img.id as string),
      os: detectOs(desc),
      category,
    };
  });

  // Default view: public OS only, ordered by family then version desc.
  const osOnly = mapped.filter((i) => i.category === "os");
  osOnly.sort((a, b) => {
    const ai = a.os ? OS_ORDER.indexOf(a.os as any) : 99;
    const bi = b.os ? OS_ORDER.indexOf(b.os as any) : 99;
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return b.name.localeCompare(a.name, undefined, { numeric: true });
  });
  return osOnly;
}

