// Kamatera provider adapter (server-only).
// Endpoints derived from the official cloudcli schema (https://cloudcli.cloudwm.com/schema).
const BASE = "https://cloudcli.cloudwm.com";

function creds() {
  const clientId = process.env.KAMATERA_API_CLIENT_ID;
  const secret = process.env.KAMATERA_API_SECRET;
  if (!clientId || !secret) {
    throw new Error("Kamatera credentials missing (KAMATERA_API_CLIENT_ID / KAMATERA_API_SECRET)");
  }
  return { clientId, secret };
}

export async function kamateraRequest<T = any>(
  path: string,
  init: { method?: string; body?: any; query?: Record<string, string> } = {},
): Promise<T> {
  const { clientId, secret } = creds();
  const url = new URL(BASE + path);
  if (init.query) for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      AuthClientId: clientId,
      AuthSecret: secret,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Kamatera ${res.status}`;
    throw new Error(`Kamatera API error (${res.status}): ${msg}`);
  }
  return data as T;
}

export type KamateraDatacenter = { id: string; name?: string; region?: string; subCategory?: string; category?: string };

export async function listDatacenters() {
  const raw = await kamateraRequest<any[]>("/service/server/options/datacenters");
  return (raw ?? []).map((d) => ({ ...d, name: d.name ?? d.region ?? d.id })) as KamateraDatacenter[];
}

export type KamateraCapabilities = {
  cpuTypes: { id: string; name: string; description?: string; cpuCores: number[]; ramMB: number[] }[];
  diskSizeGB: number[];
  defaultMonthlyTrafficPackage?: string;
  monthlyTrafficPackage?: Record<string, string>;
  networks?: { name: string; ips: number[] }[];
  billingCycle?: string[];
};

export async function getCapabilities(_datacenter: string): Promise<KamateraCapabilities> {
  // Kamatera no longer exposes a public server-options endpoint; return sensible fallbacks
  // so the provisioning UI still works.
  return {
    cpuTypes: [
      { id: "B", name: "Availability (B)", cpuCores: [1, 2, 4, 6, 8, 12], ramMB: [512, 1024, 2048, 4096, 8192, 16384, 32768] },
      { id: "A", name: "Availability (A)", cpuCores: [1, 2, 4, 6, 8], ramMB: [512, 1024, 2048, 4096, 8192, 16384] },
      { id: "T", name: "Type T", cpuCores: [1, 2, 4], ramMB: [1024, 2048, 4096, 8192] },
      { id: "D", name: "Dedicated", cpuCores: [1, 2, 4, 8, 16], ramMB: [2048, 4096, 8192, 16384, 32768, 65536] },
    ],
    diskSizeGB: [20, 30, 50, 80, 100, 150, 200, 300, 500, 1000, 2000],
    billingCycle: ["hourly", "monthly"],
  };
}

export async function listImages(datacenter: string) {
  return kamateraRequest<any[]>("/service/server/options/images", {
    method: "POST", body: { datacenter },
  });
}

export type CreateServerInput = {
  name: string;
  password: string;
  passwordValidate: string;
  ssh_key?: string;
  datacenter: string;
  image: string;
  cpu: string;              // e.g. "1A"
  ram: number;              // MB
  disk_size_0: number;      // GB
  disk_size_1?: number;
  networks?: { name: string; ip?: string }[];
  dailybackup?: "yes" | "no";
  managed?: "yes" | "no";
  monitoring?: "yes" | "no";
  billingcycle?: "hourly" | "monthly";
  monthlypackage?: string;
  power?: "on" | "off";
};

export async function createServer(input: CreateServerInput) {
  return kamateraRequest<{ commandIds?: string[]; commandId?: string; id?: string }>(
    "/service/server",
    { method: "POST", body: input },
  );
}

export async function getCommandStatus(commandId: string) {
  return kamateraRequest<any>(`/service/queue`, { query: { id: commandId } });
}

export async function listServers() {
  return kamateraRequest<any[]>("/service/servers");
}

export async function getServerInfo(idOrName: string) {
  // The `serversInfo` endpoint returns an array of matches for id/name.
  // Kamatera server IDs are often prefixed (e.g., "EU-ML:6000C29...") so they
  // are NOT 36-char UUIDs. Try as id first, then fall back to name.
  let err: Error | undefined;
  for (const body of [{ id: idOrName }, { name: idOrName }]) {
    try {
      return await kamateraRequest<any>("/service/server/info", { method: "POST", body });
    } catch (e: any) {
      err = e;
      if (e?.message?.toLowerCase().includes("not found")) break;
    }
  }
  throw err ?? new Error(`Kamatera server info failed for ${idOrName}`);
}

export async function powerAction(idOrName: string, action: "poweron" | "poweroff" | "reboot") {
  let err: Error | undefined;
  for (const body of [{ id: idOrName }, { name: idOrName }]) {
    try {
      return await kamateraRequest<any>(`/service/server/${action}`, { method: "POST", body });
    } catch (e: any) {
      err = e;
      if (e?.message?.toLowerCase().includes("not found")) break;
    }
  }
  throw err ?? new Error(`Kamatera ${action} failed for ${idOrName}`);
}

export async function terminateServer(idOrName: string, force = true) {
  let err: Error | undefined;
  for (const body of [{ id: idOrName, force: force ? "yes" : "no" }, { name: idOrName, force: force ? "yes" : "no" }]) {
    try {
      return await kamateraRequest<any>("/service/server/terminate", { method: "POST", body });
    } catch (e: any) {
      err = e;
      if (e?.message?.toLowerCase().includes("not found")) break;
    }
  }
  throw err ?? new Error(`Kamatera terminate failed for ${idOrName}`);
}

export async function ping() {
  // Cheap sanity check that credentials work.
  const dcs = await listDatacenters();
  return { ok: true, datacenterCount: Array.isArray(dcs) ? dcs.length : 0 };
}
