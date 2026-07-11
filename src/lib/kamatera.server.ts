// Kamatera provider adapter (server-only).
// Docs: https://kamatera.github.io/kamateratoolbox/
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

export type KamateraDatacenter = { id: string; name: string; subCategory?: string; category?: string };

export async function listDatacenters() {
  return kamateraRequest<KamateraDatacenter[]>("/service/server/datacenter");
}

export type KamateraCapabilities = {
  cpuTypes: { id: string; name: string; description?: string; cpuCores: number[]; ramMB: number[] }[];
  diskSizeGB: number[];
  defaultMonthlyTrafficPackage: string;
  monthlyTrafficPackage: Record<string, string>;
  networks?: { name: string; ips: number[] }[];
  billingCycle?: string[];
};

export async function getCapabilities(datacenter: string) {
  return kamateraRequest<KamateraCapabilities>("/service/server/capabilities", { query: { datacenter } });
}

export async function listImages(datacenter: string) {
  return kamateraRequest<any[]>("/service/server/images", { query: { datacenter } });
}

export type CreateServerInput = {
  name: string;
  password: string;
  passwordValidate: string;
  ssh_key?: string;
  datacenter: string;
  image: string;
  cpu: string;              // e.g. "1A" (cores + type)
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
  return kamateraRequest<any[]>("/service/server");
}
