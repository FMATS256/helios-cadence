// Edge-safe network diagnostics helpers.
// The worker runtime has no ICMP and no child_process, so "ping" is an HTTP/TCP
// reachability probe, DNS goes over DNS-over-HTTPS and WHOIS over RDAP.

export type DiagResult = {
  tool: string;
  target: string;
  ok: boolean;
  ms: number | null;
  summary: string;
  rows: { label: string; value: string }[];
  raw?: string;
};

const TIMEOUT = 12_000;

function hostOf(target: string) {
  const t = target.trim();
  try {
    if (/^[a-z]+:\/\//i.test(t)) return new URL(t).hostname;
    return new URL(`http://${t}`).hostname;
  } catch {
    return t.replace(/^\w+:\/\//, "").split("/")[0]!.split(":")[0]!;
  }
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), TIMEOUT);
  try {
    return await fn(c.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function httpProbe(target: string): Promise<DiagResult> {
  const url = /^https?:\/\//i.test(target.trim()) ? target.trim() : `https://${target.trim()}`;
  const t0 = Date.now();
  try {
    const res = await withTimeout((signal) => fetch(url, { method: "GET", redirect: "follow", signal }));
    const ms = Date.now() - t0;
    const rows = [
      { label: "URL", value: res.url },
      { label: "Status", value: `${res.status} ${res.statusText}` },
      { label: "Latency", value: `${ms} ms` },
      { label: "Server", value: res.headers.get("server") ?? "—" },
      { label: "Content-Type", value: res.headers.get("content-type") ?? "—" },
      { label: "TLS", value: url.startsWith("https") ? "HTTPS reachable" : "plain HTTP" },
    ];
    return {
      tool: "http",
      target: url,
      ok: res.status < 500,
      ms,
      summary: res.status < 400 ? `Reachable — HTTP ${res.status} in ${ms} ms` : `HTTP ${res.status} in ${ms} ms`,
      rows,
    };
  } catch (e: any) {
    const ms = Date.now() - t0;
    return { tool: "http", target: url, ok: false, ms, summary: `Unreachable: ${e?.message ?? e}`, rows: [] };
  }
}

const DOH = "https://cloudflare-dns.com/dns-query";

export async function dnsLookup(target: string, type = "A"): Promise<DiagResult> {
  const host = hostOf(target);
  const t0 = Date.now();
  try {
    const res = await withTimeout((signal) =>
      fetch(`${DOH}?name=${encodeURIComponent(host)}&type=${encodeURIComponent(type)}`, {
        headers: { accept: "application/dns-json" },
        signal,
      }),
    );
    const j: any = await res.json();
    const ms = Date.now() - t0;
    const answers: any[] = j?.Answer ?? [];
    const rows = answers.map((a) => ({ label: `${a.type === 5 ? "CNAME" : type} · TTL ${a.TTL}s`, value: String(a.data) }));
    return {
      tool: `dns:${type}`,
      target: host,
      ok: answers.length > 0,
      ms,
      summary: answers.length ? `${answers.length} ${type} record(s) in ${ms} ms` : `No ${type} records found`,
      rows,
    };
  } catch (e: any) {
    return { tool: `dns:${type}`, target: host, ok: false, ms: null, summary: `DNS lookup failed: ${e?.message ?? e}`, rows: [] };
  }
}

export async function dnsBundle(target: string): Promise<DiagResult> {
  const host = hostOf(target);
  const types = ["A", "AAAA", "CNAME", "MX", "NS", "TXT"];
  const results = await Promise.all(types.map((t) => dnsLookup(host, t)));
  const rows = results.flatMap((r) =>
    r.rows.length ? r.rows.map((x) => ({ label: `${r.tool.split(":")[1]} · ${x.label.split("·")[1]?.trim() ?? ""}`, value: x.value })) : [],
  );
  const found = results.filter((r) => r.ok).map((r) => r.tool.split(":")[1]);
  return {
    tool: "dns",
    target: host,
    ok: rows.length > 0,
    ms: null,
    summary: rows.length ? `Records found: ${found.join(", ")}` : "No DNS records resolved",
    rows,
  };
}

/** TCP reachability. Uses Cloudflare sockets when available, else node:net. */
export async function tcpProbe(target: string, port: number): Promise<DiagResult> {
  const host = hostOf(target);
  const t0 = Date.now();
  const label = `${host}:${port}`;
  try {
    const dyn = (s: string) => import(/* @vite-ignore */ s);
    const mod: any = await dyn("cloudflare:sockets").catch(() => null);
    if (mod?.connect) {
      const socket = mod.connect({ hostname: host, port });
      await Promise.race([
        socket.opened,
        new Promise((_, rej) => setTimeout(() => rej(new Error("timed out")), TIMEOUT)),
      ]);
      const ms = Date.now() - t0;
      try { await socket.close(); } catch { /* ignore */ }
      return { tool: "tcp", target: label, ok: true, ms, summary: `Port ${port} open (${ms} ms)`, rows: [{ label: "Host", value: host }, { label: "Port", value: String(port) }] };
    }
    const net: any = await import("node:net");
    const ms = await new Promise<number>((resolve, reject) => {
      const sock = new net.Socket();
      sock.setTimeout(TIMEOUT);
      sock.once("connect", () => { const d = Date.now() - t0; sock.destroy(); resolve(d); });
      sock.once("timeout", () => { sock.destroy(); reject(new Error("timed out")); });
      sock.once("error", (err: any) => { sock.destroy(); reject(err); });
      sock.connect(port, host);
    });
    return { tool: "tcp", target: label, ok: true, ms, summary: `Port ${port} open (${ms} ms)`, rows: [{ label: "Host", value: host }, { label: "Port", value: String(port) }] };
  } catch (e: any) {
    return { tool: "tcp", target: label, ok: false, ms: Date.now() - t0, summary: `Port ${port} closed or filtered: ${e?.message ?? e}`, rows: [] };
  }
}

export async function rdapLookup(target: string): Promise<DiagResult> {
  const host = hostOf(target);
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const url = isIp ? `https://rdap.org/ip/${host}` : `https://rdap.org/domain/${host}`;
  const t0 = Date.now();
  try {
    const res = await withTimeout((signal) => fetch(url, { headers: { accept: "application/json" }, signal }));
    if (!res.ok) throw new Error(`RDAP ${res.status}`);
    const j: any = await res.json();
    const ms = Date.now() - t0;
    const events: any[] = j?.events ?? [];
    const ev = (a: string) => events.find((e) => e.eventAction === a)?.eventDate?.slice(0, 10) ?? "—";
    const registrar = (j?.entities ?? []).find((e: any) => (e.roles ?? []).includes("registrar"));
    const rows = isIp
      ? [
          { label: "Network", value: `${j?.startAddress ?? "?"} – ${j?.endAddress ?? "?"}` },
          { label: "Name", value: j?.name ?? "—" },
          { label: "Country", value: j?.country ?? "—" },
          { label: "Type", value: j?.type ?? "—" },
          { label: "Handle", value: j?.handle ?? "—" },
        ]
      : [
          { label: "Domain", value: j?.ldhName ?? host },
          { label: "Status", value: (j?.status ?? []).join(", ") || "—" },
          { label: "Registrar", value: registrar?.vcardArray?.[1]?.find((v: any) => v[0] === "fn")?.[3] ?? "—" },
          { label: "Registered", value: ev("registration") },
          { label: "Expires", value: ev("expiration") },
          { label: "Last changed", value: ev("last changed") },
          { label: "Nameservers", value: (j?.nameservers ?? []).map((n: any) => n.ldhName).join(", ") || "—" },
        ];
    return { tool: "whois", target: host, ok: true, ms, summary: isIp ? `IP allocation for ${host}` : `Registry record for ${host}`, rows };
  } catch (e: any) {
    return { tool: "whois", target: host, ok: false, ms: null, summary: `RDAP lookup failed: ${e?.message ?? e}`, rows: [] };
  }
}

export async function blacklistCheck(target: string): Promise<DiagResult> {
  const host = hostOf(target);
  const a = await dnsLookup(host, "A");
  const ip = a.rows[0]?.value;
  if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return { tool: "blacklist", target: host, ok: false, ms: null, summary: "Could not resolve an IPv4 address to check", rows: [] };
  }
  const reversed = ip.split(".").reverse().join(".");
  const zones = ["zen.spamhaus.org", "bl.spamcop.net", "b.barracudacentral.org", "dnsbl.sorbs.net"];
  const checks = await Promise.all(
    zones.map(async (z) => {
      const r = await dnsLookup(`${reversed}.${z}`, "A");
      return { label: z, value: r.rows.length ? `LISTED (${r.rows[0]!.value})` : "clean" };
    }),
  );
  const listed = checks.filter((c) => c.value.startsWith("LISTED"));
  return {
    tool: "blacklist",
    target: `${host} (${ip})`,
    ok: listed.length === 0,
    ms: null,
    summary: listed.length ? `Listed on ${listed.length} blocklist(s)` : `Clean on all ${zones.length} blocklists`,
    rows: checks,
  };
}

export async function mailHealth(target: string): Promise<DiagResult> {
  const host = hostOf(target);
  const [mx, spf, dmarc] = await Promise.all([
    dnsLookup(host, "MX"),
    dnsLookup(host, "TXT"),
    dnsLookup(`_dmarc.${host}`, "TXT"),
  ]);
  const spfRec = spf.rows.map((r) => r.value).find((v) => v.toLowerCase().includes("v=spf1"));
  const dmarcRec = dmarc.rows.map((r) => r.value).find((v) => v.toLowerCase().includes("v=dmarc1"));
  const rows = [
    { label: "MX", value: mx.rows.map((r) => r.value).join(" | ") || "none" },
    { label: "SPF", value: spfRec ?? "missing" },
    { label: "DMARC", value: dmarcRec ?? "missing" },
  ];
  const ok = !!(mx.rows.length && spfRec && dmarcRec);
  return { tool: "mail", target: host, ok, ms: null, summary: ok ? "Mail records complete" : "Mail records incomplete", rows };
}
