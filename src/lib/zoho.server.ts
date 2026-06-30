// Server-only Zoho Books client. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ZohoRegion = "com" | "eu" | "in" | "com.au" | "jp" | "ca";

export function zohoAccountsUrl(region: ZohoRegion = "com") {
  return `https://accounts.zoho.${region}`;
}
export function zohoApiUrl(region: ZohoRegion = "com") {
  // Zoho Books API base
  return `https://www.zohoapis.${region}/books/v3`;
}

export const ZOHO_SCOPES = [
  "ZohoBooks.fullaccess.READ",
  "ZohoBooks.settings.READ",
].join(",");

interface ZohoConnectionRow {
  id: string;
  region: ZohoRegion;
  organization_id: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
}

export async function getActiveConnection(): Promise<ZohoConnectionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("zoho_connections")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ZohoConnectionRow) ?? null;
}

async function refreshAccessToken(conn: ZohoConnectionRow): Promise<ZohoConnectionRow> {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET not configured");

  const body = new URLSearchParams({
    refresh_token: conn.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const res = await fetch(`${zohoAccountsUrl(conn.region)}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`Zoho refresh failed: ${json.error ?? res.statusText}`);
  }

  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("zoho_connections")
    .update({ access_token: json.access_token, expires_at: expiresAt })
    .eq("id", conn.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as ZohoConnectionRow;
}

async function getValidConnection(): Promise<ZohoConnectionRow> {
  const conn = await getActiveConnection();
  if (!conn) throw new Error("Zoho not connected. Visit /zoho to connect.");
  const ms = new Date(conn.expires_at).getTime() - Date.now();
  if (ms < 60_000) return refreshAccessToken(conn);
  return conn;
}

// Generic GET with auto-refresh + simple 429 retry
export async function zohoGet<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  let conn = await getValidConnection();
  const url = new URL(`${zohoApiUrl(conn.region)}${path}`);
  if (conn.organization_id) url.searchParams.set("organization_id", conn.organization_id);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const doFetch = async (token: string) =>
    fetch(url.toString(), {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

  let res = await doFetch(conn.access_token);
  if (res.status === 401) {
    conn = await refreshAccessToken(conn);
    res = await doFetch(conn.access_token);
  }
  // Rate limit handling: simple backoff retry once
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    res = await doFetch(conn.access_token);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// Paginate through a Zoho list endpoint
export async function zohoPaginate<T>(
  path: string,
  arrayKey: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  const perPage = 200;
  // Safety cap
  for (let i = 0; i < 50; i++) {
    const data = (await zohoGet<Record<string, unknown>>(path, {
      ...params,
      page,
      per_page: perPage,
    })) as Record<string, unknown>;
    const list = (data[arrayKey] as T[] | undefined) ?? [];
    all.push(...list);
    const pc = (data.page_context as { has_more_page?: boolean } | undefined) ?? undefined;
    if (!pc?.has_more_page) break;
    page += 1;
  }
  return all;
}

// First-org bootstrap. Picks the first available organization if not set.
export async function ensureOrganizationId(): Promise<string> {
  const conn = await getValidConnection();
  if (conn.organization_id) return conn.organization_id;
  const data = await zohoGet<{ organizations: Array<{ organization_id: string }> }>(
    "/organizations",
  );
  const orgId = data.organizations?.[0]?.organization_id;
  if (!orgId) throw new Error("No Zoho Books organization found for this account");
  await supabaseAdmin.from("zoho_connections").update({ organization_id: orgId }).eq("id", conn.id);
  return orgId;
}
