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

/* ────────────────────────────────────────────────────────────────────────────
   Latency / path tools for NOC engineers.
   The worker runtime has no raw ICMP, so `ping` samples TCP/HTTP round trips
   and `traceroute`/`mtr` are executed through a public probe API.
   ──────────────────────────────────────────────────────────────────────────── */

function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  const avg = sum / s.length;
  const jitter = s.length > 1 ? Math.sqrt(s.reduce((a, v) => a + (v - avg) ** 2, 0) / s.length) : 0;
  return { min: s[0]!, max: s[s.length - 1]!, avg, jitter };
}

/** Repeated reachability samples with min/avg/max, jitter and loss. */
export async function pingProbe(target: string, opts?: { count?: number; port?: number }): Promise<DiagResult> {
  const host = hostOf(target);
  const count = Math.min(Math.max(Number(opts?.count ?? 5), 1), 10);
  const port = Number(opts?.port ?? 443);
  const samples: number[] = [];
  const attempts: { label: string; value: string }[] = [];

  for (let i = 1; i <= count; i++) {
    const r = await tcpProbe(host, port);
    if (r.ok && r.ms != null) {
      samples.push(r.ms);
      attempts.push({ label: `seq ${i}`, value: `reply from ${host}:${port} — time=${r.ms} ms` });
    } else {
      attempts.push({ label: `seq ${i}`, value: `no reply (${r.summary})` });
    }
    if (i < count) await new Promise((res) => setTimeout(res, 150));
  }

  const loss = Math.round(((count - samples.length) / count) * 100);
  const rows = [...attempts];
  if (samples.length) {
    const st = stats(samples);
    rows.push(
      { label: "Packets", value: `${count} sent, ${samples.length} received, ${loss}% loss` },
      { label: "Latency", value: `min ${st.min} ms / avg ${st.avg.toFixed(1)} ms / max ${st.max} ms` },
      { label: "Jitter", value: `${st.jitter.toFixed(1)} ms` },
      { label: "Method", value: `TCP SYN probe on port ${port} (edge runtime has no ICMP)` },
    );
  } else {
    rows.push({ label: "Packets", value: `${count} sent, 0 received, 100% loss` });
  }

  const st = samples.length ? stats(samples) : null;
  return {
    tool: "ping",
    target: `${host}:${port}`,
    ok: samples.length > 0 && loss < 50,
    ms: st ? Math.round(st.avg) : null,
    summary: st
      ? `${samples.length}/${count} replies · avg ${st.avg.toFixed(1)} ms · jitter ${st.jitter.toFixed(1)} ms · ${loss}% loss`
      : `No replies from ${host}:${port} — 100% loss`,
    rows,
  };
}

const PROBE_API = "https://api.hackertarget.com";

async function probeApi(path: string, host: string, tool: string, title: string): Promise<DiagResult> {
  const t0 = Date.now();
  try {
    const res = await withTimeout((signal) =>
      fetch(`${PROBE_API}/${path}/?q=${encodeURIComponent(host)}`, { signal }),
    );
    const text = (await res.text()).trim();
    const ms = Date.now() - t0;
    if (!text || /error|api count exceeded|invalid/i.test(text.split("\n")[0]!)) {
      return { tool, target: host, ok: false, ms, summary: text || `${title} unavailable`, rows: [], raw: text };
    }
    const lines = text.split("\n").filter((l) => l.trim());
    return {
      tool,
      target: host,
      ok: true,
      ms,
      summary: `${title} completed — ${lines.length} line(s) in ${ms} ms`,
      rows: lines.map((l, i) => ({ label: `${i + 1}`, value: l.trim() })),
      raw: text,
    };
  } catch (e: any) {
    return { tool, target: host, ok: false, ms: null, summary: `${title} failed: ${e?.message ?? e}`, rows: [] };
  }
}

/** Hop-by-hop path to the target. */
export function tracerouteProbe(target: string) {
  return probeApi("mtr", hostOf(target), "traceroute", "Traceroute");
}

/** Continuous path + per-hop loss report. */
export function mtrProbe(target: string) {
  return probeApi("mtr", hostOf(target), "mtr", "MTR path report");
}

/** Reverse DNS (PTR) for an IP, or for the target's resolved address. */
export async function reverseDns(target: string): Promise<DiagResult> {
  const host = hostOf(target);
  let ip = host;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const a = await dnsLookup(host, "A");
    ip = a.rows[0]?.value ?? "";
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return { tool: "ptr", target: host, ok: false, ms: null, summary: "Could not resolve an IPv4 address", rows: [] };
  }
  const arpa = `${ip.split(".").reverse().join(".")}.in-addr.arpa`;
  const r = await dnsLookup(arpa, "PTR");
  return {
    tool: "ptr",
    target: ip,
    ok: r.rows.length > 0,
    ms: r.ms,
    summary: r.rows.length ? `PTR: ${r.rows.map((x) => x.value).join(", ")}` : `No PTR record for ${ip}`,
    rows: [{ label: "IP", value: ip }, { label: "Query", value: arpa }, ...r.rows.map((x) => ({ label: "PTR", value: x.value }))],
  };
}

/** GeoIP and ASN / network owner for the target. */
export async function geoIpLookup(target: string): Promise<DiagResult> {
  const host = hostOf(target);
  let ip = host;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const a = await dnsLookup(host, "A");
    ip = a.rows[0]?.value ?? "";
  }
  if (!ip) return { tool: "geoip", target: host, ok: false, ms: null, summary: "Could not resolve an address", rows: [] };
  const t0 = Date.now();
  try {
    const res = await withTimeout((signal) =>
      fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { headers: { accept: "application/json" }, signal }),
    );
    const j: any = await res.json();
    const ms = Date.now() - t0;
    if (j?.success === false) throw new Error(j?.message || "lookup failed");
    const rows = [
      { label: "IP", value: ip },
      { label: "Country", value: `${j?.country ?? "—"} (${j?.country_code ?? "—"})` },
      { label: "Region / City", value: `${j?.region ?? "—"} / ${j?.city ?? "—"}` },
      { label: "Coordinates", value: j?.latitude != null ? `${j.latitude}, ${j.longitude}` : "—" },
      { label: "ASN", value: j?.connection?.asn ? `AS${j.connection.asn}` : "—" },
      { label: "Network owner", value: j?.connection?.org ?? j?.connection?.isp ?? "—" },
      { label: "ISP", value: j?.connection?.isp ?? "—" },
      { label: "Timezone", value: j?.timezone?.id ?? "—" },
    ];
    return { tool: "geoip", target: ip, ok: true, ms, summary: `${j?.city ?? "?"}, ${j?.country ?? "?"} · ${j?.connection?.org ?? j?.connection?.isp ?? "unknown network"}`, rows };
  } catch (e: any) {
    return { tool: "geoip", target: ip, ok: false, ms: null, summary: `GeoIP lookup failed: ${e?.message ?? e}`, rows: [] };
  }
}

/** TLS certificate posture for an HTTPS endpoint. */
export async function tlsCheck(target: string): Promise<DiagResult> {
  const host = hostOf(target);
  const t0 = Date.now();
  try {
    const res = await withTimeout((signal) => fetch(`https://${host}/`, { method: "GET", redirect: "manual", signal }));
    const ms = Date.now() - t0;
    const cf: any = (res as any).cf ?? null;
    const rows = [
      { label: "Host", value: host },
      { label: "Handshake", value: `TLS connection established in ${ms} ms` },
      { label: "HTTP status", value: `${res.status} ${res.statusText}` },
      { label: "HSTS", value: res.headers.get("strict-transport-security") ?? "not set" },
      { label: "Protocol", value: cf?.tlsVersion ?? "negotiated by edge" },
      { label: "Cipher", value: cf?.tlsCipher ?? "—" },
    ];
    return { tool: "tls", target: host, ok: true, ms, summary: `HTTPS/TLS healthy on ${host} (${ms} ms)`, rows };
  } catch (e: any) {
    return { tool: "tls", target: host, ok: false, ms: null, summary: `TLS handshake failed: ${e?.message ?? e}`, rows: [] };
  }
}
