// Server firewall rule manager. Vultr exposes a firewall-group API, so rules are
// applied at the provider. Other providers have no firewall API here: we report
// that honestly instead of pretending a port was opened or closed.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FwRule = { id: string; protocol: string; port: string; source: string; notes: string };
type RuleInput = { protocol: "tcp" | "udp" | "icmp"; port: string; source: string; notes?: string };

const VULTR = "https://api.vultr.com/v2";
async function vultr<T = any>(path: string, init?: RequestInit): Promise<T> {
  const k = process.env.VULTR_API_KEY;
  if (!k) throw new Error("Vultr key not configured");
  const res = await fetch(`${VULTR}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Vultr firewall ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (res.status === 204 ? {} : await res.json()) as T;
}

export function validateRule(r: RuleInput): RuleInput {
  if (!["tcp", "udp", "icmp"].includes(r.protocol)) throw new Error("Protocol must be TCP, UDP or ICMP");
  const port = String(r.port ?? "").trim();
  if (r.protocol !== "icmp") {
    const m = /^(\d{1,5})(?::(\d{1,5}))?$/.exec(port);
    if (!m) throw new Error("Port must be a number like 443 or a range like 9000:10999");
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b > 65535 || b < a) throw new Error("Port must be between 1 and 65535");
  }
  const source = String(r.source ?? "").trim() || "0.0.0.0/0";
  const sm = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(source);
  if (!sm || sm[1].split(".").some((o) => +o > 255) || +sm[2] > 32) throw new Error("Source must be an IPv4 range like 41.0.0.0/16 or 0.0.0.0/0");
  if (r.protocol !== "icmp") {
    const prefix = +sm[2];
    const [a, b] = port.split(":").map(Number);
    const hit = (b ?? a) - a <= 200 ? SENSITIVE_PORTS.find((s) => s.port >= a && s.port <= (b ?? a)) : undefined;
    if (hit && prefix < 16) {
      throw new Error(`Security policy: ${hit.name} (port ${hit.port}) must not be open to the internet. Allow only the client's office IP or the VPN range (a /16 or smaller).`);
    }
    if ((b ?? a) - a > 2000 && prefix === 0) throw new Error("Security policy: port ranges wider than 2000 ports cannot be open to everyone");
  }
  return { protocol: r.protocol, port: r.protocol === "icmp" ? "" : port, source, notes: (r.notes ?? "").slice(0, 200) };
}

// Ports that must never be reachable from the whole internet (compliance policy).
export const SENSITIVE_PORTS = [
  { port: 3389, name: "Remote Desktop (RDP)" },
  { port: 5900, name: "VNC remote control" },
  { port: 445, name: "Windows file sharing (SMB)" },
  { port: 139, name: "NetBIOS file sharing" },
  { port: 1433, name: "SQL Server database" },
  { port: 3306, name: "MySQL database" },
  { port: 5432, name: "PostgreSQL database" },
  { port: 27017, name: "MongoDB database" },
  { port: 6379, name: "Redis" },
  { port: 9200, name: "Elasticsearch" },
  { port: 11211, name: "Memcached" },
];

async function loadServer(context: any, server_id: string) {
  const { assertStaff } = await import("./customer360.server");
  await assertStaff(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: srv } = await supabaseAdmin.from("cloud_servers").select("*").eq("id", server_id).single();
  if (!srv) throw new Error("Server not found");
  return { srv: srv as any, admin: supabaseAdmin };
}

async function vultrGroup(srv: any, create: boolean): Promise<string | null> {
  if (!srv.provider_server_id) throw new Error("No provider ID on this server record");
  const inst = await vultr<any>(`/instances/${srv.provider_server_id}`);
  let gid: string = inst.instance?.firewall_group_id || "";
  if (!gid && create) {
    const g = await vultr<any>(`/firewalls`, { method: "POST", body: JSON.stringify({ description: `IMT ${srv.name}`.slice(0, 64) }) });
    gid = g.firewall_group.id;
    await vultr(`/instances/${srv.provider_server_id}`, { method: "PATCH", body: JSON.stringify({ firewall_group_id: gid }) });
  }
  return gid || null;
}

export const listFirewallRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { srv } = await loadServer(context, data.server_id);
    if (srv.provider !== "vultr") return { supported: false, provider: srv.provider, rules: [] as FwRule[] };
    const gid = await vultrGroup(srv, false);
    if (!gid) return { supported: true, provider: srv.provider, rules: [] as FwRule[], unprotected: true };
    const r = await vultr<any>(`/firewalls/${gid}/rules?per_page=500`);
    const rules: FwRule[] = (r.firewall_rules ?? []).filter((x: any) => x.ip_type === "v4").map((x: any) => ({
      id: String(x.id), protocol: x.protocol, port: x.port ?? "", source: `${x.subnet}/${x.subnet_size}`, notes: x.notes ?? "",
    }));
    return { supported: true, provider: srv.provider, rules, unprotected: false };
  });

export const addFirewallRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string; rules: RuleInput[] }) => ({ server_id: d.server_id, rules: (d.rules ?? []).slice(0, 20).map(validateRule) }))
  .handler(async ({ data, context }) => {
    const { srv, admin } = await loadServer(context, data.server_id);
    if (srv.provider !== "vultr") throw new Error(`${srv.provider} has no firewall API — set this rule on the server itself`);
    const gid = (await vultrGroup(srv, true))!;
    for (const r of data.rules) {
      const [subnet, size] = r.source.split("/");
      await vultr(`/firewalls/${gid}/rules`, { method: "POST", body: JSON.stringify({
        ip_type: "v4", protocol: r.protocol, port: r.port || undefined, subnet, subnet_size: +size, notes: r.notes,
      }) });
    }
    await admin.from("cloud_activity").insert({ server_id: srv.id, action: "firewall.open", detail: { rules: data.rules, by: context.userId } as any });
    return { added: data.rules.length };
  });

export const removeFirewallRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string; rule_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { srv, admin } = await loadServer(context, data.server_id);
    if (srv.provider !== "vultr") throw new Error("Provider has no firewall API");
    const gid = await vultrGroup(srv, false);
    if (!gid) throw new Error("No firewall on this server");
    await vultr(`/firewalls/${gid}/rules/${encodeURIComponent(data.rule_id)}`, { method: "DELETE" });
    await admin.from("cloud_activity").insert({ server_id: srv.id, action: "firewall.close", detail: { rule_id: data.rule_id, by: context.userId } as any });
    return { ok: true };
  });
