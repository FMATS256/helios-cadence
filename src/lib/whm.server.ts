/**
 * WHM / cPanel integration (Block 7)
 * ==================================
 * Server-only client for the WHM JSON API v1 plus the cPanel UAPI proxy.
 *
 * Credentials never live in code: each `whm_servers` row names the secret
 * holding its API token (default `WHM_API_TOKEN`). When no server is
 * registered — or the secret is missing — every call resolves to a
 * `configured: false` result so the platform degrades to local-only
 * bookkeeping instead of throwing at the user.
 */

export type WhmServer = {
  id: string;
  name: string;
  hostname: string;
  port: number;
  api_user: string;
  token_secret_name: string;
  default_package: string | null;
  nameservers: string[] | null;
  is_default: boolean;
  active: boolean;
};

export type WhmResult<T = any> =
  | { configured: false; ok: false; error: string }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string };

export const WHM_NOT_CONFIGURED =
  "No active WHM server is configured. Add one under Web Hosting → WHM servers and store its API token.";

function tokenFor(server: WhmServer): string | null {
  const name = server.token_secret_name || "WHM_API_TOKEN";
  return process.env[name] ?? process.env["WHM_API_TOKEN"] ?? null;
}

function baseUrl(server: WhmServer) {
  const host = server.hostname.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${host}:${server.port || 2087}`;
}

/** Load the WHM server for an account (or the default one). */
export async function loadWhmServer(db: any, serverId?: string | null): Promise<WhmServer | null> {
  let q = db.from("whm_servers").select("*").eq("active", true);
  q = serverId ? q.eq("id", serverId) : q.order("is_default", { ascending: false }).order("created_at");
  const { data } = await q.limit(1);
  return (data?.[0] as WhmServer) ?? null;
}

async function call<T = any>(
  server: WhmServer | null,
  fn: string,
  params: Record<string, string | number | undefined> = {},
  opts: { cpanelUser?: string; uapi?: { module: string; func: string } } = {},
): Promise<WhmResult<T>> {
  if (!server) return { configured: false, ok: false, error: WHM_NOT_CONFIGURED };
  const token = tokenFor(server);
  if (!token) {
    return {
      configured: false,
      ok: false,
      error: `WHM API token secret "${server.token_secret_name}" is not set.`,
    };
  }

  const search = new URLSearchParams({ "api.version": "1" });
  if (opts.uapi) {
    search.set("cpanel.user", opts.cpanelUser ?? "");
    search.set("cpanel.module", opts.uapi.module);
    search.set("cpanel.function", opts.uapi.func);
  }
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  }

  const endpoint = opts.uapi ? "cpanel" : fn;
  const url = `${baseUrl(server)}/json-api/${endpoint}?${search.toString()}`;

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25_000);
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `whm ${server.api_user}:${token}`, Accept: "application/json" },
      signal: ctl.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) return { configured: true, ok: false, error: `WHM ${res.status}: ${text.slice(0, 300)}` };

    let json: any;
    try { json = JSON.parse(text); } catch { return { configured: true, ok: false, error: "WHM returned non-JSON response" }; }

    // WHM v1 wraps status in metadata; UAPI proxy wraps in result.
    const meta = json?.metadata;
    if (meta && Number(meta.result) === 0) {
      return { configured: true, ok: false, error: String(meta.reason || "WHM call failed") };
    }
    const uapi = json?.result ?? json?.cpanelresult?.result;
    if (uapi && Number(uapi.status) === 0) {
      return { configured: true, ok: false, error: String(uapi.errors?.[0] ?? "cPanel call failed") };
    }
    return { configured: true, ok: true, data: (json?.data ?? uapi?.data ?? json) as T };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "WHM request timed out" : (e?.message ?? "WHM request failed");
    return { configured: true, ok: false, error: msg };
  }
}

/* ------------------------------------------------------------------ *
 * Account lifecycle
 * ------------------------------------------------------------------ */

export function whm(server: WhmServer | null) {
  return {
    server,
    ping: () => call(server, "version"),
    listPackages: () => call(server, "listpkgs"),
 
    createAccount: (a: {
      username: string; domain: string; password: string; plan?: string | null;
      contactemail?: string | null; quota_mb?: number | null;
    }) =>
      call(server, "createacct", {
        username: a.username, domain: a.domain, password: a.password,
        plan: a.plan ?? server?.default_package ?? undefined,
        contactemail: a.contactemail ?? undefined,
        quota: a.quota_mb ? Math.round(a.quota_mb) : undefined,
        useregns: 1,
      }),

    suspend: (user: string, reason?: string) =>
      call(server, "suspendacct", { user, reason: reason ?? "Billing suspension" }),

    unsuspend: (user: string) => call(server, "unsuspendacct", { user }),

    terminate: (user: string, keepdns = 0) => call(server, "removeacct", { user, keepdns }),

    changePackage: (user: string, pkg: string) => call(server, "changepackage", { user, pkg }),

    changePassword: (user: string, password: string) =>
      call(server, "passwd", { user, password, db_pass_update: 1 }),

    /** One-time SSO URL into cPanel (no password sharing). */
    ssoSession: (user: string) =>
      call<{ url?: string; cp_security_token?: string }>(server, "create_user_session", {
        user, service: "cpaneld",
      }),

    summary: (user: string) => call(server, "accountsummary", { user }),

    listAccounts: () => call(server, "listaccts", {}),

    /** cPanel UAPI passthroughs used for the usage snapshot. */
    domains: (user: string) => call(server, "", {}, { cpanelUser: user, uapi: { module: "DomainInfo", func: "list_domains" } }),
    databases: (user: string) => call(server, "", {}, { cpanelUser: user, uapi: { module: "Mysql", func: "list_databases" } }),
    emailAccounts: (user: string) => call(server, "", {}, { cpanelUser: user, uapi: { module: "Email", func: "list_pops" } }),
    /** Mailbox management (cPanel Email module). */
    mailboxes: (user: string) => call(server, "", {}, { cpanelUser: user, uapi: { module: "Email", func: "list_pops_with_disk" } }),
    mailboxPassword: (user: string, email: string, password: string) => {
      const [u, domain] = email.split("@");
      return call(server, "", { email: u, domain, password }, { cpanelUser: user, uapi: { module: "Email", func: "passwd_pop" } });
    },
    mailboxQuota: (user: string, email: string, quotaMb: number) => {
      const [u, domain] = email.split("@");
      return call(server, "", { email: u, domain, quota: quotaMb }, { cpanelUser: user, uapi: { module: "Email", func: "edit_pop_quota" } });
    },
    mailboxCreate: (user: string, email: string, password: string, quotaMb: number) => {
      const [u, domain] = email.split("@");
      return call(server, "", { email: u, domain, password, quota: quotaMb }, { cpanelUser: user, uapi: { module: "Email", func: "add_pop" } });
    },
    mailboxLogin: (user: string, email: string, suspend: boolean) =>
      call(server, "", { email }, { cpanelUser: user, uapi: { module: "Email", func: suspend ? "suspend_login" : "unsuspend_login" } }),
    sslHosts: (user: string) => call(server, "", {}, { cpanelUser: user, uapi: { module: "SSL", func: "installed_hosts" } }),
    phpVersion: (user: string) =>
      call(server, "", {}, { cpanelUser: user, uapi: { module: "LangPHP", func: "php_get_system_default_version" } }),
  };
}

/* ------------------------------------------------------------------ *
 * Usage snapshot
 * ------------------------------------------------------------------ */

export type HostingUsage = {
  disk_used_mb: number | null;
  disk_quota_gb: number | null;
  bandwidth_used_mb: number | null;
  email_accounts: number | null;
  databases_count: number | null;
  subdomains_count: number | null;
  addon_domains_count: number | null;
  ssl_status: string | null;
  php_version: string | null;
  ip_address: string | null;
  suspended: boolean | null;
  plan: string | null;
};

const toMb = (v: any) => {
  if (v == null || v === "unlimited") return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Pull a full usage snapshot for one cPanel user. Never throws. */
export async function fetchHostingUsage(server: WhmServer | null, user: string): Promise<WhmResult<HostingUsage>> {
  const api = whm(server);
  const sum = await api.summary(user);
  if (!sum.ok) return sum as WhmResult<HostingUsage>;

  const acct = (sum as any).data?.acct?.[0] ?? (sum as any).data?.[0] ?? {};
  const [dom, db, mail, ssl, php] = await Promise.all([
    api.domains(user), api.databases(user), api.emailAccounts(user), api.sslHosts(user), api.phpVersion(user),
  ]);

  const domData: any = dom.ok ? (dom as any).data : null;
  const sslList: any[] = ssl.ok ? ((ssl as any).data ?? []) : [];
  const dbList: any = db.ok ? (db as any).data : null;
  const mailList: any = mail.ok ? (mail as any).data : null;

  return {
    configured: true,
    ok: true,
    data: {
      disk_used_mb: toMb(acct.diskused),
      disk_quota_gb: acct.disklimit && acct.disklimit !== "unlimited"
        ? Math.round((toMb(acct.disklimit) ?? 0) / 1024 * 100) / 100
        : null,
      bandwidth_used_mb: toMb(acct.totalbytes != null ? Number(acct.totalbytes) / 1_048_576 : acct.bwused),
      email_accounts: Array.isArray(mailList) ? mailList.length : null,
      databases_count: Array.isArray(dbList) ? dbList.length : null,
      subdomains_count: Array.isArray(domData?.sub_domains) ? domData.sub_domains.length : null,
      addon_domains_count: Array.isArray(domData?.addon_domains) ? domData.addon_domains.length : null,
      ssl_status: sslList.length ? "secured" : ssl.ok ? "none" : null,
      php_version: php.ok ? ((php as any).data?.version ?? null) : null,
      ip_address: acct.ip ?? null,
      suspended: acct.suspended != null ? Boolean(Number(acct.suspended)) : null,
      plan: acct.plan ?? null,
    },
  };
}

/** Deterministic cPanel username from a domain (max 8 chars, alnum, no leading digit). */
export function cpanelUsernameFor(domain: string, salt = "") {
  const base = domain.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "site";
  const suffix = (salt || Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/g, "").slice(0, 2);
  const user = `${/^[0-9]/.test(base) ? "s" : ""}${base}${suffix}`.slice(0, 8);
  return user;
}

/** Strong random password for new cPanel accounts. */
export function generatePassword(len = 20) {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%^*_-";
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
