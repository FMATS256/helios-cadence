import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DiagTool = "http" | "dns" | "tcp" | "whois" | "blacklist" | "mail";

async function ensureStaff(context: { supabase: any; userId: string }) {
  const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
  if (!hasRole) throw new Error("Staff role required");
}

export const runNetworkDiagnostic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tool: DiagTool; target: string; port?: number }) => d)
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const target = (data.target ?? "").trim();
    if (!target) throw new Error("Enter a hostname, domain or IP address");

    const diag = await import("./netdiag.server");
    switch (data.tool) {
      case "http":
        return diag.httpProbe(target);
      case "dns":
        return diag.dnsBundle(target);
      case "tcp":
        return diag.tcpProbe(target, Number(data.port ?? 443));
      case "whois":
        return diag.rdapLookup(target);
      case "blacklist":
        return diag.blacklistCheck(target);
      case "mail":
        return diag.mailHealth(target);
      default:
        throw new Error("Unknown diagnostic tool");
    }
  });

/** Everything the NOC / technical desk can act on, in one round trip. */
export const listRemoteTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureStaff(context);
    const db = context.supabase as any;
    const sel = (table: string, cols: string) =>
      db.from(table).select(cols).is("archived_at", null).limit(500);

    const [servers, hosting, voip, starlink, storage] = await Promise.all([
      sel("cloud_servers", "id, name, provider, status, power_state, public_ips, account_number, provider_server_id, customers(company_name)"),
      sel("web_hosting_accounts", "id, domain, plan, status, provider, ip_address, provisioning_status, account_number, sync_status, customers(company_name)"),
      sel("voip_accounts", "id, voip_number, status, balance_usd, account_number, last_synced_at, customers(company_name)"),
      sel("starlink_accounts", "id, starlink_account_number, kit_serial, plan_type, status, balance_usd, account_number, last_checked_at, customers(company_name)"),
      Promise.resolve(sel("cloud_storage_accounts", "id, status, account_number, customers(company_name)")).catch(() => ({ data: [] })),
    ]);

    return {
      servers: (servers as any).data ?? [],
      hosting: (hosting as any).data ?? [],
      voip: (voip as any).data ?? [],
      starlink: (starlink as any).data ?? [],
      storage: (storage as any).data ?? [],
    };
  });
