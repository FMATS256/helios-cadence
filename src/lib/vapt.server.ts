// Edge-safe vulnerability assessment engine (VAPT).
//
// The worker runtime has no raw sockets beyond TCP connect, no ICMP and no
// child_process, so this is an active *black-box* assessment built from HTTP,
// TLS, DNS and TCP probes — the same classes of checks a Kali toolchain runs
// (nikto / whatweb / testssl / nmap service sweep / dnsrecon), implemented with
// primitives the platform can execute safely and without installing binaries.
//
// Everything here is non-destructive: GET/HEAD/OPTIONS requests and TCP connect
// attempts only. No payload injection, no brute forcing, no exploitation.

import { portScan, tcpProbe } from "./netdiag.server";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type Finding = {
  id: string;
  title: string;
  severity: Severity;
  category: string;
  evidence: string;
  impact: string;
  remediation: string;
  reference?: string;
};

export type VaptReport = {
  target: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  score: number; // 0-100, higher is safer
  grade: string;
  counts: Record<Severity, number>;
  findings: Finding[];
  checksRun: string[];
  notes: string[];
};

const TIMEOUT = 10_000;
const UA = "IMT-VAPT/1.0 (+https://imtsolutions.co.zw; authorised security assessment)";

function hostOf(target: string) {
  const t = target.trim();
  try {
    if (/^[a-z]+:\/\//i.test(t)) return new URL(t).hostname;
    return new URL(`http://${t}`).hostname;
  } catch {
    return t.replace(/^\w+:\/\//, "").split("/")[0]!.split(":")[0]!;
  }
}

function baseUrl(target: string) {
  const t = target.trim();
  return /^https?:\/\//i.test(t) ? t.replace(/\/+$/, "") : `https://${hostOf(t)}`;
}

async function req(url: string, init?: RequestInit) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), TIMEOUT);
  try {
    return await fetch(url, {
      redirect: "manual",
      ...init,
      headers: { "user-agent": UA, ...(init?.headers ?? {}) },
      signal: c.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function dns(name: string, type: string) {
  try {
    const res = await req(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
    });
    const j: any = await res.json();
    return { answers: (j?.Answer ?? []) as any[], ad: !!j?.AD };
  } catch {
    return { answers: [] as any[], ad: false };
  }
}

/* ── checks ───────────────────────────────────────────────────────────────── */

const SENSITIVE_PATHS: { path: string; label: string; severity: Severity; match?: RegExp }[] = [
  { path: "/.env", label: "Environment file", severity: "critical", match: /(^|\n)\s*[A-Z_]{3,}\s*=/ },
  { path: "/.git/HEAD", label: "Git repository", severity: "critical", match: /ref:\s*refs\// },
  { path: "/.git/config", label: "Git config", severity: "critical", match: /\[core\]/ },
  { path: "/wp-config.php.bak", label: "WordPress config backup", severity: "critical", match: /DB_PASSWORD/ },
  { path: "/config.json", label: "Application config", severity: "high", match: /[{]/ },
  { path: "/backup.zip", label: "Backup archive", severity: "high" },
  { path: "/db.sql", label: "Database dump", severity: "critical" },
  { path: "/phpinfo.php", label: "phpinfo() page", severity: "high", match: /phpinfo\(\)|PHP Version/i },
  { path: "/server-status", label: "Apache mod_status", severity: "medium", match: /Apache Server Status/i },
  { path: "/.DS_Store", label: "macOS metadata file", severity: "low" },
  { path: "/.svn/entries", label: "Subversion metadata", severity: "high" },
  { path: "/actuator/env", label: "Spring Actuator env", severity: "critical", match: /propertySources|activeProfiles/ },
  { path: "/.well-known/security.txt", label: "security.txt (expected, informational)", severity: "info" },
];

const RISKY_PORTS: Record<number, { name: string; severity: Severity; why: string }> = {
  21: { name: "FTP", severity: "high", why: "Plaintext credentials and file transfer" },
  23: { name: "Telnet", severity: "critical", why: "Plaintext remote shell" },
  25: { name: "SMTP", severity: "low", why: "Verify it is not an open relay" },
  110: { name: "POP3", severity: "medium", why: "Plaintext mailbox access" },
  143: { name: "IMAP", severity: "medium", why: "Plaintext mailbox access" },
  3306: { name: "MySQL", severity: "critical", why: "Database directly reachable from the internet" },
  3389: { name: "RDP", severity: "critical", why: "Prime target for credential stuffing and ransomware" },
  5432: { name: "PostgreSQL", severity: "critical", why: "Database directly reachable from the internet" },
  6379: { name: "Redis", severity: "critical", why: "Often unauthenticated, allows full data access" },
  27017: { name: "MongoDB", severity: "critical", why: "Often unauthenticated, allows full data access" },
  9200: { name: "Elasticsearch", severity: "critical", why: "Often unauthenticated, exposes indexed data" },
  5900: { name: "VNC", severity: "high", why: "Remote desktop, weak default authentication" },
  11211: { name: "Memcached", severity: "high", why: "Unauthenticated cache access and DDoS amplification" },
};

async function checkTransport(target: string, findings: Finding[], notes: string[]) {
  const host = hostOf(target);
  // HTTPS availability
  let httpsOk = false;
  try {
    const res = await req(`https://${host}/`, { method: "GET" });
    httpsOk = true;
    const hsts = res.headers.get("strict-transport-security");
    if (!hsts) {
      findings.push({
        id: "tls-hsts-missing",
        title: "HSTS not enforced",
        severity: "medium",
        category: "Transport security",
        evidence: "No Strict-Transport-Security response header on the HTTPS endpoint.",
        impact: "A downgrade or SSL-strip attack on a hostile network can force the visitor onto plain HTTP.",
        remediation: "Send Strict-Transport-Security: max-age=31536000; includeSubDomains; preload.",
        reference: "OWASP A02:2021 — Cryptographic Failures",
      });
    } else {
      const age = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
      if (age < 15_552_000) {
        findings.push({
          id: "tls-hsts-short",
          title: "HSTS max-age too short",
          severity: "low",
          category: "Transport security",
          evidence: `Strict-Transport-Security: ${hsts}`,
          impact: "A short policy window leaves repeat visitors unprotected between visits.",
          remediation: "Raise max-age to at least 15552000 (180 days), ideally 31536000.",
        });
      }
    }
  } catch (e: any) {
    findings.push({
      id: "tls-unavailable",
      title: "HTTPS endpoint unreachable",
      severity: "high",
      category: "Transport security",
      evidence: `TLS request to https://${host}/ failed: ${e?.message ?? e}`,
      impact: "Traffic cannot be encrypted, so credentials and session tokens travel in clear text.",
      remediation: "Install a valid certificate (Let's Encrypt or commercial) and serve the site over TLS 1.2+.",
    });
  }

  // Plain HTTP must redirect to HTTPS
  try {
    const res = await req(`http://${host}/`, { method: "GET" });
    const loc = res.headers.get("location") ?? "";
    const redirects = res.status >= 300 && res.status < 400 && /^https:/i.test(loc);
    if (!redirects && res.status < 400) {
      findings.push({
        id: "tls-no-redirect",
        title: "Plain HTTP served without redirect to HTTPS",
        severity: httpsOk ? "high" : "medium",
        category: "Transport security",
        evidence: `http://${host}/ returned ${res.status}${loc ? ` → ${loc}` : " with no Location header"}`,
        impact: "Visitors and API clients can be served over an unencrypted channel and intercepted.",
        remediation: "Return a 301 to the https:// URL for every plain HTTP request.",
      });
    }
  } catch {
    notes.push("Plain HTTP port 80 is closed or filtered — no cleartext listener.");
  }
}

async function checkHeaders(url: string, findings: Finding[]) {
  let res: Response;
  try {
    res = await req(`${url}/`, { method: "GET", redirect: "follow" });
  } catch (e: any) {
    findings.push({
      id: "http-unreachable",
      title: "Web endpoint did not respond",
      severity: "info",
      category: "Web application",
      evidence: `${url}/ — ${e?.message ?? e}`,
      impact: "Application-layer checks could not be completed.",
      remediation: "Confirm the host is online and reachable from the internet.",
    });
    return null;
  }

  const wanted: { header: string; name: string; severity: Severity; impact: string; fix: string }[] = [
    { header: "content-security-policy", name: "Content-Security-Policy", severity: "medium", impact: "Cross-site scripting payloads are not constrained by policy.", fix: "Define a CSP restricting script-src, object-src and frame-ancestors." },
    { header: "x-frame-options", name: "X-Frame-Options / frame-ancestors", severity: "medium", impact: "The application can be framed by an attacker for clickjacking.", fix: "Send X-Frame-Options: DENY, or CSP frame-ancestors 'none'." },
    { header: "x-content-type-options", name: "X-Content-Type-Options", severity: "low", impact: "Browsers may MIME-sniff responses and execute them as script.", fix: "Send X-Content-Type-Options: nosniff." },
    { header: "referrer-policy", name: "Referrer-Policy", severity: "low", impact: "Internal URLs and tokens can leak to third parties in the Referer header.", fix: "Send Referrer-Policy: strict-origin-when-cross-origin." },
    { header: "permissions-policy", name: "Permissions-Policy", severity: "info", impact: "Powerful browser features are not explicitly restricted.", fix: "Send Permissions-Policy disabling unused features (camera, microphone, geolocation)." },
  ];

  const csp = res.headers.get("content-security-policy") ?? "";
  for (const w of wanted) {
    if (res.headers.get(w.header)) continue;
    if (w.header === "x-frame-options" && /frame-ancestors/i.test(csp)) continue;
    findings.push({
      id: `hdr-${w.header}`,
      title: `${w.name} header missing`,
      severity: w.severity,
      category: "Web application",
      evidence: `No ${w.header} header on ${res.url}`,
      impact: w.impact,
      remediation: w.fix,
      reference: "OWASP A05:2021 — Security Misconfiguration",
    });
  }

  if (/unsafe-inline|unsafe-eval/i.test(csp)) {
    findings.push({
      id: "hdr-csp-unsafe",
      title: "Content-Security-Policy allows unsafe inline or eval",
      severity: "low",
      category: "Web application",
      evidence: csp.slice(0, 240),
      impact: "The policy no longer blocks the most common XSS execution paths.",
      remediation: "Replace 'unsafe-inline'/'unsafe-eval' with nonces or hashes.",
    });
  }

  // Technology / version disclosure
  const banners = [
    ["server", res.headers.get("server")],
    ["x-powered-by", res.headers.get("x-powered-by")],
    ["x-aspnet-version", res.headers.get("x-aspnet-version")],
    ["x-generator", res.headers.get("x-generator")],
  ].filter(([, v]) => !!v) as [string, string][];
  const versioned = banners.filter(([, v]) => /\d+\.\d+/.test(v));
  if (versioned.length) {
    findings.push({
      id: "info-version-disclosure",
      title: "Software versions disclosed in response headers",
      severity: "low",
      category: "Information disclosure",
      evidence: versioned.map(([k, v]) => `${k}: ${v}`).join(" · "),
      impact: "Attackers can match the exact build against public CVEs before probing further.",
      remediation: "Suppress version banners (Apache ServerTokens Prod, nginx server_tokens off, expose_php Off).",
    });
  }

  // Cookie flags
  const cookies = (res.headers as any).getSetCookie?.() ?? (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []);
  for (const raw of cookies as string[]) {
    const name = raw.split("=")[0]!.trim();
    const problems: string[] = [];
    if (!/;\s*secure/i.test(raw)) problems.push("no Secure");
    if (!/;\s*httponly/i.test(raw)) problems.push("no HttpOnly");
    if (!/;\s*samesite/i.test(raw)) problems.push("no SameSite");
    if (problems.length) {
      findings.push({
        id: `cookie-${name}`,
        title: `Cookie "${name}" missing protection flags`,
        severity: problems.includes("no Secure") || problems.includes("no HttpOnly") ? "medium" : "low",
        category: "Session management",
        evidence: `${raw.slice(0, 160)} — ${problems.join(", ")}`,
        impact: "Session cookies can be read by injected script or sent over plaintext, enabling hijacking or CSRF.",
        remediation: "Set Secure; HttpOnly; SameSite=Lax (or Strict) on every session cookie.",
      });
    }
  }

  // CORS
  try {
    const probe = await req(`${url}/`, { method: "GET", headers: { origin: "https://vapt-probe.invalid" } });
    const acao = probe.headers.get("access-control-allow-origin");
    const acac = probe.headers.get("access-control-allow-credentials");
    if (acao === "https://vapt-probe.invalid" && /true/i.test(acac ?? "")) {
      findings.push({
        id: "cors-reflect-credentials",
        title: "CORS reflects arbitrary origins with credentials",
        severity: "high",
        category: "Web application",
        evidence: `Access-Control-Allow-Origin reflected the probe origin with Allow-Credentials: true`,
        impact: "Any website can read authenticated responses on behalf of a logged-in user.",
        remediation: "Validate Origin against an allow-list; never reflect it while allowing credentials.",
      });
    } else if (acao === "*" && /true/i.test(acac ?? "")) {
      findings.push({
        id: "cors-wildcard-credentials",
        title: "Wildcard CORS combined with credentials",
        severity: "medium",
        category: "Web application",
        evidence: `Access-Control-Allow-Origin: * with Allow-Credentials: ${acac}`,
        impact: "Cross-origin sites may be able to read authenticated data.",
        remediation: "Use an explicit origin allow-list for credentialed endpoints.",
      });
    }
  } catch { /* ignore */ }

  // Dangerous HTTP methods
  try {
    const opt = await req(`${url}/`, { method: "OPTIONS" });
    const allow = (opt.headers.get("allow") ?? opt.headers.get("access-control-allow-methods") ?? "").toUpperCase();
    const bad = ["TRACE", "TRACK", "PUT", "DELETE", "CONNECT"].filter((m) => allow.includes(m));
    if (bad.length) {
      findings.push({
        id: "http-methods",
        title: `Unsafe HTTP methods advertised: ${bad.join(", ")}`,
        severity: bad.includes("PUT") || bad.includes("DELETE") ? "high" : "medium",
        category: "Web application",
        evidence: `Allow: ${allow}`,
        impact: "TRACE enables cross-site tracing; PUT/DELETE can allow file upload or removal.",
        remediation: "Restrict the server to GET, HEAD, POST (and the verbs your API genuinely needs).",
      });
    }
  } catch { /* ignore */ }

  return res;
}

async function checkExposedPaths(url: string, findings: Finding[], notes: string[]) {
  const results = await Promise.all(
    SENSITIVE_PATHS.map(async (p) => {
      try {
        const res = await req(`${url}${p.path}`, { method: "GET", redirect: "manual" });
        if (res.status !== 200) return null;
        const body = (await res.text()).slice(0, 4000);
        if (p.match && !p.match.test(body)) return null;
        if (!p.match && /<html/i.test(body) && body.length > 2000) return null; // soft-404 page
        return { p, body };
      } catch {
        return null;
      }
    }),
  );

  for (const hit of results) {
    if (!hit) continue;
    if (hit.p.severity === "info") {
      notes.push(`${hit.p.path} is published — ${hit.p.label}.`);
      continue;
    }
    findings.push({
      id: `path${hit.p.path.replace(/[^a-z0-9]+/gi, "-")}`,
      title: `${hit.p.label} publicly accessible at ${hit.p.path}`,
      severity: hit.p.severity,
      category: "Information disclosure",
      evidence: `HTTP 200 · first bytes: ${hit.body.replace(/\s+/g, " ").slice(0, 160)}`,
      impact: "Source code, credentials or database contents can be downloaded by anyone.",
      remediation: `Block ${hit.p.path} at the web server or reverse proxy and rotate any credential it exposed.`,
      reference: "OWASP A01:2021 — Broken Access Control",
    });
  }

  // Directory listing
  for (const dir of ["/uploads/", "/files/", "/backup/", "/images/"]) {
    try {
      const res = await req(`${url}${dir}`, { method: "GET", redirect: "manual" });
      if (res.status !== 200) continue;
      const body = (await res.text()).slice(0, 3000);
      if (/Index of \/|<title>Directory listing/i.test(body)) {
        findings.push({
          id: `dirlist${dir.replace(/\W+/g, "-")}`,
          title: `Directory listing enabled on ${dir}`,
          severity: "medium",
          category: "Information disclosure",
          evidence: `Auto-index page returned for ${url}${dir}`,
          impact: "Attackers can enumerate and download files that were never meant to be linked.",
          remediation: "Disable auto-indexing (Apache Options -Indexes, nginx autoindex off).",
        });
      }
    } catch { /* ignore */ }
  }
}

async function checkServices(target: string, findings: Finding[], notes: string[]) {
  const host = hostOf(target);
  const scan = await portScan(host);
  const open = scan.rows.filter((r) => r.value.startsWith("open"));
  notes.push(open.length ? `Service sweep: ${open.length} of 17 common ports answered.` : "Service sweep: no common ports answered (host firewalled or behind a proxy/CDN).");

  const extra = [23, 6379, 27017, 9200, 5900, 11211];
  const extraResults = await Promise.all(extra.map(async (p) => ({ port: p, open: (await tcpProbe(host, p)).ok })));

  const openPorts = new Set<number>();
  for (const r of open) {
    const n = Number(r.label.split("·")[0]!.trim());
    if (Number.isFinite(n)) openPorts.add(n);
  }
  for (const r of extraResults) if (r.open) openPorts.add(r.port);

  for (const port of openPorts) {
    const risk = RISKY_PORTS[port];
    if (!risk) continue;
    findings.push({
      id: `port-${port}`,
      title: `${risk.name} exposed to the internet on port ${port}`,
      severity: risk.severity,
      category: "Network exposure",
      evidence: `TCP connect to ${host}:${port} succeeded`,
      impact: risk.why,
      remediation: `Restrict port ${port} to a management VPN or office IP allow-list, or place it behind a bastion host.`,
      reference: "CIS Controls v8 — 4.4 / 12.2",
    });
  }
}

async function checkMailAndDns(target: string, findings: Finding[], notes: string[]) {
  const host = hostOf(target).replace(/^www\./, "");
  const [mx, txt, dmarc, dsRoot, caa] = await Promise.all([
    dns(host, "MX"),
    dns(host, "TXT"),
    dns(`_dmarc.${host}`, "TXT"),
    dns(host, "DNSKEY"),
    dns(host, "CAA"),
  ]);

  const spf = txt.answers.map((a) => String(a.data)).find((v) => /v=spf1/i.test(v));
  if (!spf) {
    findings.push({
      id: "mail-spf",
      title: "No SPF record published",
      severity: mx.answers.length ? "high" : "medium",
      category: "Email security",
      evidence: `No v=spf1 TXT record on ${host}`,
      impact: "Anyone can send email that appears to come from this domain, enabling invoice fraud and phishing.",
      remediation: `Publish a TXT record such as "v=spf1 include:<your mail provider> -all".`,
    });
  } else if (/[~?]all\s*"?$/.test(spf) || !/-all/.test(spf)) {
    findings.push({
      id: "mail-spf-soft",
      title: "SPF policy is not enforcing",
      severity: "medium",
      category: "Email security",
      evidence: spf.slice(0, 200),
      impact: "Spoofed mail is marked, not rejected, so it still reaches recipients.",
      remediation: "Move the SPF record to a hard fail (-all) once legitimate senders are listed.",
    });
  }

  const dmarcRec = dmarc.answers.map((a) => String(a.data)).find((v) => /v=dmarc1/i.test(v));
  if (!dmarcRec) {
    findings.push({
      id: "mail-dmarc",
      title: "No DMARC policy published",
      severity: "high",
      category: "Email security",
      evidence: `No TXT record at _dmarc.${host}`,
      impact: "Receivers have no instruction to quarantine or reject spoofed mail from this domain.",
      remediation: `Publish "v=DMARC1; p=quarantine; rua=mailto:dmarc@${host}" and tighten to p=reject after monitoring.`,
    });
  } else if (/p=none/i.test(dmarcRec)) {
    findings.push({
      id: "mail-dmarc-none",
      title: "DMARC policy set to p=none",
      severity: "medium",
      category: "Email security",
      evidence: dmarcRec.slice(0, 200),
      impact: "Spoofed mail is only reported, never blocked.",
      remediation: "Progress to p=quarantine, then p=reject.",
    });
  }

  const dkim = await dns(`default._domainkey.${host}`, "TXT");
  if (!dkim.answers.length) {
    notes.push("No DKIM key found at the default selector — DKIM may use a provider-specific selector.");
  }

  if (!dsRoot.answers.length) {
    findings.push({
      id: "dns-dnssec",
      title: "DNSSEC not enabled",
      severity: "low",
      category: "DNS security",
      evidence: `No DNSKEY record for ${host}`,
      impact: "DNS answers for the domain can be spoofed or poisoned without detection.",
      remediation: "Enable DNSSEC signing at the DNS provider and publish DS records at the registrar.",
    });
  }

  if (!caa.answers.length) {
    findings.push({
      id: "dns-caa",
      title: "No CAA record restricting certificate issuance",
      severity: "info",
      category: "DNS security",
      evidence: `No CAA record for ${host}`,
      impact: "Any public CA may issue a certificate for the domain.",
      remediation: `Publish a CAA record naming only your certificate authority, e.g. 0 issue "letsencrypt.org".`,
    });
  }

  // Zone transfer attempt indicator: check NS then port 53/tcp reachability
  const ns = await dns(host, "NS");
  if (ns.answers.length) {
    const nsHost = String(ns.answers[0]!.data).replace(/\.$/, "");
    const open53 = await tcpProbe(nsHost, 53);
    if (open53.ok) {
      notes.push(`Nameserver ${nsHost} accepts TCP/53 — run a manual AXFR check to confirm zone transfers are refused.`);
    }
  }
}

/* ── scoring ──────────────────────────────────────────────────────────────── */

const WEIGHT: Record<Severity, number> = { critical: 30, high: 15, medium: 7, low: 3, info: 0 };

function score(findings: Finding[]) {
  const penalty = findings.reduce((a, f) => a + WEIGHT[f.severity], 0);
  return Math.max(0, 100 - Math.min(100, penalty));
}

function grade(s: number) {
  return s >= 90 ? "A" : s >= 80 ? "B" : s >= 65 ? "C" : s >= 45 ? "D" : s >= 25 ? "E" : "F";
}

const ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export type ScanProfile = "quick" | "standard" | "full";

/**
 * Run a non-destructive vulnerability assessment against a host or URL.
 * quick    — transport + headers only
 * standard — adds exposed paths and email/DNS posture
 * full     — adds the network service sweep
 */
export async function runAssessment(target: string, profile: ScanProfile = "standard"): Promise<VaptReport> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const findings: Finding[] = [];
  const notes: string[] = [];
  const url = baseUrl(target);
  const checksRun: string[] = ["TLS & HTTPS enforcement", "HTTP security headers", "Cookie flags", "CORS policy", "HTTP methods", "Technology disclosure"];

  await checkTransport(target, findings, notes);
  await checkHeaders(url, findings);

  if (profile !== "quick") {
    checksRun.push("Sensitive file & path exposure", "Directory listing", "SPF / DKIM / DMARC posture", "DNSSEC & CAA");
    await Promise.all([
      checkExposedPaths(url, findings, notes),
      checkMailAndDns(target, findings, notes),
    ]);
  }

  if (profile === "full") {
    checksRun.push("Network service sweep (23 ports)", "Risky service exposure");
    await checkServices(target, findings, notes);
  }

  findings.sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  const counts = ORDER.reduce((acc, s) => ({ ...acc, [s]: findings.filter((f) => f.severity === s).length }), {} as Record<Severity, number>);
  const s = score(findings);

  return {
    target: hostOf(target),
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    score: s,
    grade: grade(s),
    counts,
    findings,
    checksRun,
    notes,
  };
}
