// Server-only field-level access control (Block 5).
//
// Cost / margin / profit / wholesale figures are commercially sensitive and are
// stripped from every aggregate payload before it leaves the server unless the
// viewer is a master admin or works in finance. Secret material (API keys,
// tokens, password references) is stripped for EVERYONE — those values are only
// ever released through the credentials vault, which logs each access.
//
// Redaction happens server-side so a crafted client request cannot recover the
// values, and the UI needs no changes: redacted keys simply arrive as null.

export type ViewerScope = {
  userId: string;
  email: string | null;
  roles: string[];
  isMaster: boolean;
  /** may see supplier cost, margin, profit and wholesale pricing */
  canSeeCost: boolean;
};

const COST_ROLES = new Set(["master_admin", "finance", "operations_manager"]);

/** Resolve the caller's role scope once per request. */
export async function viewerScope(context: any): Promise<ViewerScope> {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roles = (data ?? []).map((r: any) => String(r.role));
  const isMaster = roles.includes("master_admin");
  return {
    userId: context.userId,
    email: context.claims?.email ?? null,
    roles,
    isMaster,
    canSeeCost: isMaster || roles.some((r: string) => COST_ROLES.has(r)),
  };
}

/** Commercially sensitive money fields — finance / master admin only. */
const COST_KEY = /(^|_)(cost|cost_usd|unit_cost|monthly_cost|monthly_cost_usd|supplier_cost|buy_price|wholesale_price|wholesale|margin|margin_usd|profit|profit_usd|markup)$/i;

/** Secret material — never returned through aggregate endpoints. */
const SECRET_KEY =
  /(password|passwd|secret|api_key|apikey|access_key|private_key|token|credential_value|encrypted_|root_password|ssh_key)/i;

function scrub(row: any, canSeeCost: boolean): any {
  if (!row || typeof row !== "object") return row;
  if (Array.isArray(row)) return row.map((r) => scrub(r, canSeeCost));
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SECRET_KEY.test(k)) {
      // keep foreign-key pointers (…_credential_id) so the vault can still be opened
      out[k] = /_id$/.test(k) ? v : v == null ? null : "•••••";
      continue;
    }
    if (!canSeeCost && COST_KEY.test(k)) {
      out[k] = null;
      continue;
    }
    out[k] = v && typeof v === "object" ? scrub(v, canSeeCost) : v;
  }
  return out;
}

/** Redact a single row for the given viewer. */
export function redactRow<T>(row: T, viewer: ViewerScope): T {
  return scrub(row, viewer.canSeeCost) as T;
}

/** Redact an array of rows for the given viewer. */
export function redactRows<T>(rows: T[], viewer: ViewerScope): T[] {
  return (rows ?? []).map((r) => scrub(r, viewer.canSeeCost)) as T[];
}

/** Redact each array value of a record (the Customer 360 payload shape). */
export function redactBundle<T extends Record<string, any>>(bundle: T, viewer: ViewerScope): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(bundle)) {
    out[k] = Array.isArray(v) ? redactRows(v, viewer) : v && typeof v === "object" ? redactRow(v, viewer) : v;
  }
  return out as T;
}
