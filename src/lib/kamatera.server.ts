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

/** Kamatera frequently answers HTTP 200 with an error envelope; normalise both shapes. */
export class KamateraError extends Error {
  code: string;
  constructor(message: string, code = "kamatera_error") {
    super(message);
    this.name = "KamateraError";
    this.code = code;
  }
}

function friendly(raw: string): { message: string; code: string } {
  const low = raw.toLowerCase();
  if (low.includes("billing profile") || low.includes("account state")) {
    return {
      code: "account_denied",
      message:
        "Kamatera rejected the request: the API account has no usable billing profile (or is suspended). Provisioning stays blocked until a valid payment method is attached to the Kamatera account and the API key is re-enabled.",
    };
  }
  if (low.includes("authentication") || low.includes("unauthorized") || low.includes("access denied")) {
    return { code: "auth_failed", message: `Kamatera authentication failed: ${raw}` };
  }
  return { code: "kamatera_error", message: `Kamatera API error: ${raw}` };
}

function assertOk(data: any, status: number, text: string) {
  const errs = Array.isArray(data?.errors) ? data.errors : null;
  if (errs?.length) {
    const raw = errs.map((e: any) => e?.info ?? e?.message ?? JSON.stringify(e)).join("; ");
    const f = friendly(raw);
    throw new KamateraError(f.message, f.code);
  }
  if (data && data.error === true && data.message) {
    const f = friendly(String(data.message));
    throw new KamateraError(f.message, f.code);
  }
  if (status < 200 || status >= 300) {
    const raw = data?.message || data?.error || text || `HTTP ${status}`;
    const f = friendly(String(raw));
    throw new KamateraError(f.message, f.code);
  }
}

export async function kamateraRequest<T = any>(
  path: string,
  init: { method?: string; body?: any; query?: Record<string, string> } = {},
): Promise<T> {
  const { clientId, secret } = creds();
  const url = new URL(BASE + path);
  if (init.query) for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: init.method ?? "GET",
      headers: {
        AuthClientId: clientId,
        AuthSecret: secret,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (e: any) {
    throw new KamateraError(`Could not reach the Kamatera API: ${e?.message ?? e}`, "network");
  }
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  assertOk(data, res.status, text);
  return data as T;
}

export type KamateraDatacenter = { id: string; name?: string; region?: string; subCategory?: string; category?: string };

/** Static fallback — the public datacenters option endpoint is currently failing upstream. */
const FALLBACK_DATACENTERS: KamateraDatacenter[] = [
  { id: "EU", name: "Amsterdam, Netherlands", region: "Europe" },
  { id: "EU-LO", name: "London, United Kingdom", region: "Europe" },
  { id: "EU-FR", name: "Frankfurt, Germany", region: "Europe" },
  { id: "EU-ES", name: "Madrid, Spain", region: "Europe" },
  { id: "US-NY2", name: "New York, USA", region: "North America" },
  { id: "US-TX", name: "Dallas, USA", region: "North America" },
  { id: "US-SC", name: "Santa Clara, USA", region: "North America" },
  { id: "US-CH", name: "Chicago, USA", region: "North America" },
  { id: "CA-TR", name: "Toronto, Canada", region: "North America" },
  { id: "IL", name: "Rosh Haayin, Israel", region: "Middle East" },
  { id: "AS", name: "Hong Kong, China", region: "Asia" },
];

export async function listDatacenters() {
  try {
    const raw = await kamateraRequest<any[]>("/service/server/options/datacenters");
    if (Array.isArray(raw) && raw.length) {
      return raw.map((d) => ({ ...d, name: d.name ?? d.region ?? d.id })) as KamateraDatacenter[];
    }
  } catch (e: any) {
    if (e instanceof KamateraError && (e.code === "account_denied" || e.code === "auth_failed")) throw e;
  }
  return FALLBACK_DATACENTERS;
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
