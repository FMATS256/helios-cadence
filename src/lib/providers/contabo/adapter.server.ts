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
  if (!res.ok) {
    cachedToken = null;
    const body = await res.text();
    if (res.status === 400 || res.status === 401) {
      throw new Error(
        "Contabo rejected the API credentials. Check CONTABO_API_USER / CONTABO_API_PASSWORD (this is the separate API password from the Contabo customer panel, not your website login) and CONTABO_CLIENT_ID / CONTABO_CLIENT_SECRET.",
      );
    }
    throw new Error(`Contabo token ${res.status}: ${body}`);
  }
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
  // Never replay a create/update request: a timed-out POST may still have
  // succeeded and retrying it can create duplicate billable resources.
  const attempts = !init?.method || init.method === "GET" ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
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
    if (res.status < 500 || attempt === attempts - 1) break;
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

// Product families supported by Contabo's public instance-ordering API. The
// general /products catalogue also contains website-only, legacy, duplicate,
// and future products which cannot be passed to /compute/instances.
const API_ORDERABLE_VPS_SLUG = /^cloud-vps-(05|10|20|30|40|50|60)$/i;

// ---- Live product catalogue (only products the account can actually order) ----
let planCache: { at: number; plans: InstanceType[] } | null = null;
// SKUs Contabo lists but refuses to order ("Product X is not available").
const UNAVAILABLE_SKUS = new Set<string>();

function specNum(specs: any[], type: string) {
  const t = specs?.find((s) => s?.type === type)?.title ?? "";
  const m = String(t).match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

async function fetchLivePlans(): Promise<InstanceType[]> {
  if (planCache && Date.now() - planCache.at < 10 * 60_000) return planCache.plans;
  type Tiered = InstanceType & { _tier: number };
  const out: Tiered[] = [];
  for (let page = 1; page <= 3; page++) {
    const r = await contabo<{ data: any[]; _pagination?: any }>(`/products?size=100&page=${page}`);
    for (const p of r.data ?? []) {
      const pi = p?.priceItem;
      if (!pi?.itemId || p?.type !== "vps") continue;
      if (pi.outOfStock?.isOutOfStock) continue;
      if (out.some((o) => o.id === pi.itemId)) continue;
      const specs = pi.specs ?? [];
      const name = String(pi.name ?? "");
      const slug = String(pi.slug ?? "");
      const ramGb = specNum(specs, "ram");
      const storage = specs.find((s: any) => s?.type === "storage")?.title ?? "";
      let diskGb = specNum(specs, "storage");
      if (/\bTB\b/i.test(String(storage))) diskGb *= 1024;
      const cpu = specNum(specs, "cpu");
      if (!cpu || !ramGb) continue;
      // Tier 0 = known API-orderable Cloud VPS families with full spec sheets.
      // Tier 1 = any other in-stock VPS product; used only as a fallback so the
      // form never ends up empty (createServer walks candidates anyway).
      const tier =
        specs.length >= 5 && /^cloud vps/i.test(name) && API_ORDERABLE_VPS_SLUG.test(slug) ? 0 : 1;
      out.push({
        id: pi.itemId,
        cpu_cores: cpu,
        ram_mb: ramGb * 1024,
        disk_gb: diskGb || 50,
        monthly_usd: (pi.price ?? []).find((x: any) => x.currency === "USD")?.amount ?? 0,
        family: name || pi.itemId,
        _tier: tier,
      });
    }
    if (r._pagination && page >= (r._pagination.totalPages ?? 1)) break;
  }
  const priced = out.filter((p) => p.monthly_usd > 0);
  const strict = priced.filter((p) => p._tier === 0);
  const chosen = strict.length ? strict : priced;
  const plans: InstanceType[] = chosen
    .map(({ _tier, ...p }) => p)
    .sort((a, b) => a.monthly_usd - b.monthly_usd);

  if (!plans.length) {
    throw new Error("Contabo returned no VPS products that can be ordered through its API.");
  }
  planCache = { at: Date.now(), plans };
  return plans;
}


async function getPlans(): Promise<InstanceType[]> {
  return fetchLivePlans();
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
    // Ordered candidate list: requested SKU first, then API-orderable matches.
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
    // Contabo can list a product in /products that it refuses to order, and some
    // SKUs are only offered on longer contract periods. Walk candidates x periods.
    // Contabo only accepts these contract lengths on /compute/instances.
    const PERIODS = [1, 12, 24];
    const attempted: string[] = [];
    outer: for (const cand of candidates) {
      attempted.push(cand.id);
      for (const period of PERIODS) {
        const body: Record<string, unknown> = {
          imageId,
          productId: cand.id,
          region: req.region,
          period,
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
          lastErr = e;
          // Period not offered for this SKU — try the next contract length.
          if (/no offer was found|the period must be/i.test(msg)) continue;
          if (/is not available|out of stock|not orderable|only available on the contabo website|cannot be ordered/i.test(msg)) {
            UNAVAILABLE_SKUS.add(cand.id);
            planCache = null; // force a fresh catalogue next time
            continue outer;
          }
          throw e;
        }
      }
      // Every period failed for this SKU — skip it next time too.
      UNAVAILABLE_SKUS.add(cand.id);
      planCache = null;
    }

    // Remove the password secret created for an order that never completed.
    if (rootPasswordSecretId !== undefined) {
      await contabo(`/secrets/${rootPasswordSecretId}`, { method: "DELETE" }).catch(() => undefined);
    }
    throw new Error(
      `Contabo has no API-orderable offer for the selected configuration in ${req.region} ` +
      `(checked ${attempted.join(", ")}). Choose a different region or plan, or enable API ordering on the Contabo account. ` +
      `${String((lastErr as Error)?.message ?? "")}`,
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
