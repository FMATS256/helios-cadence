import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LISTS = ["zen.spamhaus.org", "bl.spamcop.net", "b.barracudacentral.org"];

async function doh(name: string) {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=A`, {
    headers: { accept: "application/dns-json" },
  });
  const j = (await r.json()) as { Answer?: { data: string }[] };
  return j.Answer?.map((a) => a.data) ?? [];
}

/** Read-only reputation + certificate check for an IP or domain. */
export const checkHostReputation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { host: string }) => {
    const host = String(d.host || "").trim().toLowerCase();
    if (!/^[a-z0-9.-]{3,253}$/.test(host)) throw new Error("Enter a valid domain or IPv4 address");
    return { host };
  })
  .handler(async ({ data }) => {
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(data.host);
    let ip = data.host;
    if (!isIp) ip = (await doh(data.host).catch(() => []))[0] ?? "";
    const blacklists: { list: string; listed: boolean }[] = [];
    if (ip) {
      const rev = ip.split(".").reverse().join(".");
      for (const l of LISTS) {
        const ans = await doh(`${rev}.${l}`).catch(() => []);
        blacklists.push({ list: l, listed: ans.some((a) => a.startsWith("127.0.0.")) });
      }
    }
    let ssl: { issuer: string; expires: string; daysLeft: number } | null = null;
    if (!isIp) {
      try {
        const r = await fetch(`https://crt.sh/?q=${encodeURIComponent(data.host)}&output=json&exclude=expired`);
        const certs = (await r.json()) as { issuer_name: string; not_after: string }[];
        const latest = certs.sort((a, b) => b.not_after.localeCompare(a.not_after))[0];
        if (latest) {
          const exp = new Date(latest.not_after + "Z");
          ssl = { issuer: latest.issuer_name, expires: exp.toISOString(), daysLeft: Math.floor((exp.getTime() - Date.now()) / 86400000) };
        }
      } catch { ssl = null; }
    }
    return { host: data.host, ip, blacklists, ssl };
  });
