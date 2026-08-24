// Server-only helpers for the SOC / security posture engine.

export type PostureSignal = {
  key: string;
  label: string;
  severity: "critical" | "high" | "medium" | "low";
  count: number;
  detail: string;
  items: { id: string; label: string; sub?: string | null }[];
};

const DAY = 86_400_000;

/** Build live posture signals from operational data (no mock values). */
export async function buildPosture(client: any): Promise<{
  signals: PostureSignal[];
  score: number;
  grade: string;
}> {
  const nowIso = new Date().toISOString();
  const in30 = new Date(Date.now() + 30 * DAY).toISOString();
  const sevenAgo = new Date(Date.now() - 7 * DAY).toISOString();

  const [creds, checks, lic, servers, backups, alerts] = await Promise.all([
    client.from("credentials").select("id,name,expires_at,updated_at,created_at").is("archived_at", null),
    client.from("monitoring_checks").select("id,name,target,status,enabled").is("archived_at", null),
    client.from("licenses").select("id,product,vendor,expiry_date,status").is("archived_at", null),
    client.from("cloud_servers").select("id,name,provider,status").is("archived_at", null),
    client.from("server_backups").select("id,server_id,status,taken_at").gte("taken_at", sevenAgo),
    client.from("ops_alerts").select("id,title,severity,status,first_seen_at").in("status", ["open", "acknowledged", "investigating"]),
  ]);

  const credRows = (creds.data ?? []) as any[];
  const expiredCreds = credRows.filter((c) => c.expires_at && c.expires_at < nowIso);
  const staleCreds = credRows.filter(
    (c) => Date.now() - new Date(c.updated_at || c.created_at).getTime() > 180 * DAY,
  );

  const downChecks = ((checks.data ?? []) as any[]).filter(
    (c) => c.enabled && String(c.status).toLowerCase() === "down",
  );

  const expiringLic = ((lic.data ?? []) as any[]).filter(
    (l) => l.expiry_date && l.expiry_date <= in30,
  );

  const backedUp = new Set(
    ((backups.data ?? []) as any[]).filter((b) => b.status === "completed" || b.status === "success").map((b) => b.server_id),
  );
  const unbacked = ((servers.data ?? []) as any[]).filter(
    (s) => String(s.status).toLowerCase() !== "terminated" && !backedUp.has(s.id),
  );

  const staleAlerts = ((alerts.data ?? []) as any[]).filter(
    (a) => ["critical", "high"].includes(String(a.severity).toLowerCase()) &&
      Date.now() - new Date(a.first_seen_at).getTime() > 2 * DAY,
  );

  const signals: PostureSignal[] = [
    {
      key: "expired_credentials",
      label: "Expired credentials",
      severity: "critical",
      count: expiredCreds.length,
      detail: "Vault entries past their expiry date must be rotated.",
      items: expiredCreds.slice(0, 25).map((c) => ({ id: c.id, label: c.name, sub: `expired ${c.expires_at?.slice(0, 10)}` })),
    },
    {
      key: "monitoring_down",
      label: "Monitoring checks down",
      severity: "critical",
      count: downChecks.length,
      detail: "Endpoints currently failing their health probe.",
      items: downChecks.slice(0, 25).map((c) => ({ id: c.id, label: c.name, sub: c.target })),
    },
    {
      key: "servers_without_backup",
      label: "Servers without a 7-day backup",
      severity: "high",
      count: unbacked.length,
      detail: "No successful snapshot recorded in the last seven days.",
      items: unbacked.slice(0, 25).map((s) => ({ id: s.id, label: s.name, sub: s.provider })),
    },
    {
      key: "stale_alerts",
      label: "Unresolved high-severity alerts",
      severity: "high",
      count: staleAlerts.length,
      detail: "Critical/high alerts open for more than 48 hours.",
      items: staleAlerts.slice(0, 25).map((a) => ({ id: a.id, label: a.title, sub: a.status })),
    },
    {
      key: "stale_credentials",
      label: "Credentials not rotated in 180 days",
      severity: "medium",
      count: staleCreds.length,
      detail: "Long-lived secrets increase blast radius.",
      items: staleCreds.slice(0, 25).map((c) => ({ id: c.id, label: c.name })),
    },
    {
      key: "expiring_licenses",
      label: "Licences expiring within 30 days",
      severity: "medium",
      count: expiringLic.length,
      detail: "Renew or decommission before lapse.",
      items: expiringLic.slice(0, 25).map((l) => ({ id: l.id, label: l.product, sub: l.vendor })),
    },
  ];

  const weight: Record<PostureSignal["severity"], number> = { critical: 12, high: 7, medium: 3, low: 1 };
  const penalty = signals.reduce((acc, s) => acc + Math.min(s.count, 5) * weight[s.severity], 0);
  const score = Math.max(0, 100 - penalty);
  const grade = score >= 90 ? "A" : score >= 78 ? "B" : score >= 62 ? "C" : score >= 45 ? "D" : "F";

  return { signals, score, grade };
}

export const INCIDENT_FLOW: Record<string, string[]> = {
  open: ["investigating", "closed"],
  investigating: ["contained", "closed"],
  contained: ["resolved", "investigating"],
  resolved: ["closed", "investigating"],
  closed: [],
};
