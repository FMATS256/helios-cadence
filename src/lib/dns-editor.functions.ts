import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DnsRecordInput } from "./dns-records";

const DNS_ROLES = ["operations_manager", "cloud_engineer", "technical_support"];

async function ctxFor(context: any, hostingId: string) {
  const { assertRole, admin, loadHostingAccount } = await import("./hosting.server");
  await assertRole(context, DNS_ROLES);
  const db = await admin();
  const row = await loadHostingAccount(db, hostingId);
  if (row.provisioning_status !== "whm") throw new Error("This domain's hosting isn't linked to a WHM server yet");
  const { loadWhmServer } = await import("./whm.server");
  const server = await loadWhmServer(db, row.whm_server_id);
  if (!server) throw new Error("No active WHM server");
  const token = process.env[server.token_secret_name || "WHM_API_TOKEN"] ?? process.env["WHM_API_TOKEN"];
  if (!token) throw new Error("WHM API token is not set");
  const host = server.hostname.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const call = async (fn: string, params: Record<string, string | number | undefined>) => {
    const s = new URLSearchParams({ "api.version": "1" });
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
    const res = await fetch(`https://${host}:${server.port || 2087}/json-api/${fn}?${s}`, {
      headers: { Authorization: `whm ${server.api_user}:${token}`, Accept: "application/json" },
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json || Number(json?.metadata?.result) === 0) {
      throw new Error(json?.metadata?.reason || `WHM ${res.status}`);
    }
    return json.data;
  };
  return { db, row, call };
}

export const listDnsRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { hostingId: string }) => d)
  .handler(async ({ data, context }) => {
    const { row, call } = await ctxFor(context, data.hostingId);
    const res = await call("dumpzone", { domain: row.domain });
    const recs: any[] = res?.zone?.[0]?.record ?? [];
    return recs
      .filter((r) => ["A", "MX", "NS"].includes(r.type))
      .map((r) => ({
        line: Number(r.Line ?? r.line),
        type: r.type as "A" | "MX" | "NS",
        name: String(r.name ?? ""),
        value: String(r.address ?? r.exchange ?? r.nsdname ?? ""),
        priority: r.preference != null ? Number(r.preference) : undefined,
        ttl: Number(r.ttl ?? 14400),
      }));
  });

export const saveDnsRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { hostingId: string; line?: number; remove?: boolean; record?: DnsRecordInput }) => d)
  .handler(async ({ data, context }) => {
    const { validateDnsRecord, fqdn } = await import("./dns-records");
    const { row, call, db } = await ctxFor(context, data.hostingId);
    let summary: string;
    if (data.remove) {
      if (!data.line) throw new Error("Missing record line");
      await call("removezonerecord", { zone: row.domain, line: data.line });
      summary = `Removed DNS record line ${data.line}`;
    } else {
      const r = data.record;
      if (!r) throw new Error("Missing record");
      const err = validateDnsRecord(r);
      if (err) throw new Error(err);
      const v = r.value.trim();
      const params: Record<string, string | number | undefined> = {
        name: fqdn(r.name, row.domain), type: r.type, ttl: r.ttl ?? 14400, class: "IN",
        address: r.type === "A" ? v : undefined,
        exchange: r.type === "MX" ? v.replace(/\.?$/, ".") : undefined,
        preference: r.type === "MX" ? r.priority : undefined,
        nsdname: r.type === "NS" ? v.replace(/\.?$/, ".") : undefined,
      };
      if (data.line) await call("editzonerecord", { domain: row.domain, line: data.line, ...params });
      else await call("addzonerecord", { domain: row.domain, ...params });
      summary = `${data.line ? "Updated" : "Added"} ${r.type} ${params.name} → ${v}`;
    }
    const { recordServiceAction } = await import("./hosting.server");
    await recordServiceAction(db, {
      service_type: "web_hosting", row, action: "dns_change", title: summary, actor_id: context.userId,
    }).catch(() => {});
    return { ok: true, summary };
  });
