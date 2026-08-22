// Contabo adapter — implements CloudProvider against Contabo Cloud API v1.
// Auth: OAuth2 password grant against auth.contabo.com.
import type {
  CloudProvider, InstanceType, PowerAction, PriceEstimate,
  ProvisionRequest, ProvisionResult, Region,
} from "../types";

const BASE = "https://api.contabo.com/v1";
const TOKEN_URL = "https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token";

let cachedToken: { token: string; expires_at: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expires_at > Date.now() + 30_000) return cachedToken.token;
  const cid = process.env.CONTABO_CLIENT_ID;
  const cs = process.env.CONTABO_CLIENT_SECRET;
  const u = process.env.CONTABO_API_USER;
  const p = process.env.CONTABO_API_PASSWORD;
  if (!cid || !cs || !u || !p) throw new Error("Contabo credentials not fully configured");
  const body = new URLSearchParams({
    client_id: cid, client_secret: cs,
    username: u, password: p,
    grant_type: "password",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Contabo token ${res.status}: ${await res.text()}`);
  const j: any = await res.json();
  cachedToken = { token: j.access_token, expires_at: Date.now() + (j.expires_in ?? 300) * 1000 };
  return cachedToken.token;
}

function uuid() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c: any) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
  );
}

async function contabo<T = any>(path: string, init?: RequestInit): Promise<T> {
  let last = "";
  let status = 0;
  // Contabo occasionally answers 5xx transiently — retry idempotent-ish calls twice.
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = await getToken();
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-request-id": uuid(),
        ...(init?.headers ?? {}),
      },
    });
    if (res.ok) {
      if (res.status === 204) return {} as T;
      return (await res.json()) as T;
    }
    status = res.status;
    last = await res.text();
    if (res.status < 500 || attempt === 2) break;
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  if (status >= 500) {
    throw new Error(
      `Contabo rejected this order (${status}). The selected plan or region is not orderable on this account right now — pick another plan/region or contact Contabo support. Details: ${last}`,
    );
  }
  throw new Error(`Contabo ${init?.method ?? "GET"} ${path} ${status}: ${last}`);
}


// Contabo regions (physical DCs). Kept static — endpoint doesn't list them uniformly.
const CONTABO_REGIONS: Region[] = [
  { id: "EU", name: "Nuremberg, Germany", country: "DE", city: "Nuremberg" },
  { id: "US-central", name: "St. Louis, USA", country: "US", city: "St. Louis" },
  { id: "US-east", name: "New York, USA", country: "US", city: "New York" },
  { id: "US-west", name: "Seattle, USA", country: "US", city: "Seattle" },
  { id: "SIN", name: "Singapore", country: "SG", city: "Singapore" },
  { id: "UK", name: "London, UK", country: "GB", city: "London" },
  { id: "AUS", name: "Sydney, Australia", country: "AU", city: "Sydney" },
  { id: "JPN", name: "Tokyo, Japan", country: "JP", city: "Tokyo" },
  { id: "IND", name: "Mumbai, India", country: "IN", city: "Mumbai" },
];

// Fallback SKUs (currently orderable Cloud VPS line) used only if /v1/products fails.
const CONTABO_PLANS: InstanceType[] = [
  { id: "V90", cpu_cores: 3,  ram_mb: 8192,   disk_gb: 75,  monthly_usd: 3.5,  family: "Cloud VPS 05" },
  { id: "V92", cpu_cores: 4,  ram_mb: 8192,   disk_gb: 150, monthly_usd: 6.6,  family: "Cloud VPS 10" },
  { id: "V95", cpu_cores: 6,  ram_mb: 12288,  disk_gb: 200, monthly_usd: 9.0,  family: "Cloud VPS 20" },
  { id: "V98", cpu_cores: 8,  ram_mb: 24576,  disk_gb: 400, monthly_usd: 16.8, family: "Cloud VPS 30" },
];

// ---- Live product catalogue (only products the account can actually order) ----
let planCache: { at: number; plans: InstanceType[] } | null = null;

function specNum(specs: any[], type: string) {
  const t = specs?.find((s) => s?.type === type)?.title ?? "";
  const m = String(t).match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

async function fetchLivePlans(): Promise<InstanceType[]> {
  if (planCache && Date.now() - planCache.at < 10 * 60_000) return planCache.plans;
  const out: InstanceType[] = [];
  for (let page = 1; page <= 3; page++) {
    const r = await contabo<{ data: any[]; _pagination?: any }>(`/products?size=100&page=${page}`);
    for (const p of r.data ?? []) {
      const pi = p?.priceItem;
      if (!pi?.itemId || p?.type !== "vps") continue;
      if (pi.outOfStock?.isOutOfStock) continue;
      if (out.some((o) => o.id === pi.itemId)) continue;
      const specs = pi.specs ?? [];
      // Contabo lists legacy / not-yet-orderable SKUs (e.g. the "(2026)" lines)
      // with an empty spec sheet. Ordering those returns a bare 500 from the
      // API, so only surface products that expose a full spec sheet.
      if (specs.length < 5) continue;
      const name = String(pi.name ?? "");
      if (!/^cloud vps/i.test(name)) continue;
      const ramGb = specNum(specs, "ram");
      const storage = specs.find((s: any) => s?.type === "storage")?.title ?? "";
      let diskGb = specNum(specs, "storage");
      if (/\bTB\b/i.test(String(storage))) diskGb *= 1024;
      const cpu = specNum(specs, "cpu");
      if (!cpu || !ramGb) continue;
      out.push({
        id: pi.itemId,
        cpu_cores: cpu,
        ram_mb: ramGb * 1024,
        disk_gb: diskGb || 50,
        monthly_usd: (pi.price ?? []).find((x: any) => x.currency === "USD")?.amount ?? 0,
        family: name || pi.itemId,
      });
    }
    if (r._pagination && page >= (r._pagination.totalPages ?? 1)) break;
  }
  const plans = out.filter((p) => p.monthly_usd > 0).sort((a, b) => a.monthly_usd - b.monthly_usd);

  if (!plans.length) return CONTABO_PLANS;
  planCache = { at: Date.now(), plans };
  return plans;
}

async function getPlans(): Promise<InstanceType[]> {
  try { return await fetchLivePlans(); } catch { return CONTABO_PLANS; }
}


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let imageCache: { at: number; images: { id: string; name: string; os?: any }[] } | null = null;

// Contabo's create call requires a real image UUID. Standard images live under
// /compute/images?standardImage=true; custom images are in the same endpoint.
async function fetchImages(): Promise<{ id: string; name: string; os?: any }[]> {
  if (imageCache && Date.now() - imageCache.at < 10 * 60_000) return imageCache.images;
  const out: { id: string; name: string; os?: any }[] = [];
  for (const q of ["standardImage=true", "standardImage=false"]) {
    try {
      const r = await contabo<{ data: any[] }>(`/compute/images?size=100&${q}`);
      for (const i of r.data ?? []) {
        if (!i?.imageId || out.some((o) => o.id === i.imageId)) continue;
        out.push({ id: i.imageId, name: i.name ?? i.imageId, os: detectOs(String(i.name ?? "")) });
      }
    } catch { /* ignore page failure */ }
  }
  if (out.length) imageCache = { at: Date.now(), images: out };
  return out;
}

// Map a slug like "ubuntu-22.04" or an OS family to a Contabo image UUID.
async function resolveImageId(image?: string, os?: string): Promise<string> {
  if (image && UUID_RE.test(image)) return image;
  const images = await fetchImages();
  if (!images.length) throw new Error("Could not load Contabo images to resolve the selected OS.");
  const wanted = String(image ?? os ?? "ubuntu-22.04").toLowerCase();
  const tokens = wanted.split(/[^a-z0-9.]+/).filter(Boolean);
  const score = (name: string) => {
    const n = name.toLowerCase();
    return tokens.reduce((s, t) => s + (n.includes(t) ? t.length : 0), 0);
  };
  const best = images
    .map((i) => ({ i, s: score(i.name) }))
    .sort((a, b) => b.s - a.s)[0];
  if (best && best.s > 0) return best.i.id;
  const ubuntu = images.find((i) => i.os === "ubuntu");
  return (ubuntu ?? images[0]).id;
}

function detectOs(id: string): any {
  const n = id.toLowerCase();
  if (n.includes("ubuntu")) return "ubuntu";
  if (n.includes("debian")) return "debian";
  if (n.includes("alma")) return "almalinux";
  if (n.includes("rocky")) return "rocky";
  if (n.includes("windows")) return "windows";
  return undefined;
}

export const contaboAdapter: CloudProvider = {
  name: "contabo" as any,
  displayName: "Contabo",
  supports: ["vm", "block_storage", "object_storage"],

  async listRegions() { return CONTABO_REGIONS; },

  async listImages() {
    return fetchImages();
  },

  async listInstanceTypes() { return getPlans(); },

  async estimatePrice(req: ProvisionRequest): Promise<PriceEstimate> {
    const plans = await getPlans();
    const plan =
      plans.find((p) => p.id === (req.template_params?.plan as string)) ??
      plans.find((p) =>
        p.cpu_cores >= (req.cpu_cores ?? 1) && p.ram_mb >= (req.ram_mb ?? 1024),
      ) ?? plans[0];
    const backup = req.daily_backup ? plan.monthly_usd * 0.2 : 0;
    const total = round(plan.monthly_usd + backup);
    return {
      monthly_usd: total,
      hourly_usd: round(total / 730),
      currency: "USD",
      breakdown: [
        { label: `${plan.family} (${plan.id})`, monthly_usd: plan.monthly_usd },
        ...(backup ? [{ label: "Automated backups", monthly_usd: round(backup) }] : []),
      ],
    };
  },

  async createServer(req: ProvisionRequest): Promise<ProvisionResult> {
    // Only order SKUs Contabo currently lists as available for this account —
    // stale/legacy ids fail with "Product <id> is not available".
    const plans = (await getPlans()).filter((p) => !UNAVAILABLE_SKUS.has(p.id));
    const requested = req.template_params?.plan as string | undefined;
    const bySpec = plans
      .filter((p) => p.cpu_cores >= (req.cpu_cores ?? 1) && p.ram_mb >= (req.ram_mb ?? 1024))
      .sort((a, b) => a.monthly_usd - b.monthly_usd);
    // Ordered candidate list: requested SKU first, then closest matches, then anything.
    const candidates: InstanceType[] = [];
    const push = (p?: InstanceType) => { if (p && !candidates.some((c) => c.id === p.id)) candidates.push(p); };
    if (requested && !UNAVAILABLE_SKUS.has(requested)) push(plans.find((p) => p.id === requested));
    bySpec.forEach(push);
    plans.forEach(push);
    if (!candidates.length) throw new Error("No Contabo VPS products are currently available to order.");

    // Contabo's API expects `rootPassword` to be a numeric *secret id*, not the
    // password itself. Store the password (kept as a string, untouched) in the
    // Contabo secrets store first, then reference the returned id.
    const displayName = sanitizeName(req.name);
    let rootPasswordSecretId: number | undefined;
    if (typeof req.password === "string" && req.password.length > 0) {
      if (!CONTABO_PASSWORD_RE.test(req.password)) {
        throw new Error("Password can only contain letters, numbers, spaces, and hyphens (-).");
      }
      const secret = await contabo<{ data: any[] }>("/secrets", {
        method: "POST",
        body: JSON.stringify({
          name: `${displayName || "server"}-root-${Date.now()}`,
          type: "password",
          value: req.password, // string, verbatim
        }),
      });
      const id = secret.data?.[0]?.secretId;
      if (id === undefined || id === null) throw new Error("Contabo did not return a secret id for the root password");
      rootPasswordSecretId = Number(id);
    }

    const imageId = await resolveImageId(req.image, req.os);

    let lastErr: unknown;
    // Contabo can list a product in /products that it refuses to order. Walk the
    // candidates until one is accepted, remembering the dud SKUs for next time.
    for (const cand of candidates.slice(0, 6)) {
      const body: Record<string, unknown> = {
        imageId,
        productId: cand.id,
        region: req.region,
        period: 1,
        displayName,
        defaultUser: "root",
      };
      if (rootPasswordSecretId !== undefined) body.rootPassword = rootPasswordSecretId;
      if (req.ssh_key && /^\d+$/.test(String(req.ssh_key))) body.sshKeys = [Number(req.ssh_key)];

      try {
        const r = await contabo<{ data: any[] }>("/compute/instances", {
          method: "POST", body: JSON.stringify(body),
        });
        const inst = r.data?.[0] ?? {};
        if (requested && cand.id !== requested) {
          console.warn(`[contabo] product ${requested} unavailable — provisioned ${cand.id} (${cand.family})`);
        }
        return {
          provider_server_id: String(inst.instanceId ?? ""),
          public_ips: inst.ipConfig?.v4?.ip ? [inst.ipConfig.v4.ip] : [],
          private_ips: [],
          raw: inst,
        };
      } catch (e) {
        const msg = String((e as Error)?.message ?? "");
        if (/is not available|out of stock|not orderable/i.test(msg)) {
          UNAVAILABLE_SKUS.add(cand.id);
          planCache = null; // force a fresh catalogue next time
          lastErr = e;
          continue;
        }
        throw e;
      }
    }
    throw new Error(
      `Contabo could not order any of the available VPS products right now (tried ${candidates
        .slice(0, 6)
        .map((c) => c.id)
        .join(", ")}). ${String((lastErr as Error)?.message ?? "")}`,
    );
  },



  async getServer(id: string) {
    const r = await contabo<{ data: any[] }>(`/compute/instances/${id}`);
    const inst = r.data?.[0] ?? {};
    return {
      status: inst.status ?? "unknown",
      power_state: inst.status === "running" ? "on" : inst.status === "stopped" ? "off" : "unknown",
      raw: inst,
    };
  },

  async powerAction(id: string, action: PowerAction) {
    const map = { on: "start", off: "stop", reboot: "restart" } as const;
    await contabo(`/compute/instances/${id}/actions/${map[action]}`, { method: "POST" });
  },

  async terminate(id: string) {
    await contabo(`/compute/instances/${id}`, { method: "DELETE" });
  },
};

function round(n: number) { return Math.round(n * 100) / 100; }

// Contabo accepts only letters, numbers, spaces and hyphens in these fields.
export const CONTABO_PASSWORD_RE = /^[A-Za-z0-9 -]+$/;

function sanitizeName(name: string) {
  return (name || "").replace(/[^A-Za-z0-9 -]/g, "-").slice(0, 255).trim();
}
