import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STEP_UP_MINUTES = 10;

/** Roles allowed to reveal secret material. */
export const VAULT_ROLES = [
  "master_admin",
  "operations_manager",
  "cloud_engineer",
  "technical_support",
  "cyber_security",
];

/** Returns the caller's active step-up grant (if any) plus vault permission. */
export const vaultSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRows } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r) => String(r.role));
    const canReveal = roles.some((r) => VAULT_ROLES.includes(r));

    const { data: grant } = await (context.supabase as any)
      .from("vault_step_up_grants")
      .select("id,expires_at,granted_at,method")
      .eq("user_id", context.userId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      canReveal,
      roles,
      stepUpActive: !!grant,
      stepUpExpiresAt: grant?.expires_at ?? null,
    };
  });

/** Re-authenticate with the caller's own password to unlock secret reveals. */
export const requestVaultStepUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { password: string }) => {
    if (!input?.password || input.password.length < 4) throw new Error("Password is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const email = (context.claims as any)?.email as string | undefined;
    if (!email) throw new Error("No email on session — cannot step up.");

    const { data: roleRows } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r) => String(r.role));
    if (!roles.some((r) => VAULT_ROLES.includes(r))) {
      throw new Error("You do not have permission to unlock the vault.");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const verifier = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      global: {
        fetch: (input: any, init: any) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { data: auth, error } = await verifier.auth.signInWithPassword({ email, password: data.password });
    const ok = !error && auth?.user?.id === context.userId;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordAudit } = await import("./customer-events.server");
    await recordAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: email,
      action: ok ? "vault_step_up_granted" : "vault_step_up_failed",
      entity_type: "vault",
      entity_id: context.userId,
      module: "credentials",
      new_value: { method: "password" },
    });

    if (!ok) throw new Error("Incorrect password — vault stays locked.");

    const expires = new Date(Date.now() + STEP_UP_MINUTES * 60_000).toISOString();
    await (supabaseAdmin as any).from("vault_step_up_grants").insert({
      user_id: context.userId,
      method: "password",
      expires_at: expires,
    });

    return { ok: true, expiresAt: expires, minutes: STEP_UP_MINUTES };
  });

/** Immediately re-lock the vault for the caller. */
export const lockVault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("vault_step_up_grants")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("revoked_at", null);
    return { ok: true };
  });

/** Vault overview: credentials with hygiene flags + recent access log. */
export const vaultOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [credsRes, logRes, profilesRes] = await Promise.all([
      context.supabase
        .from("credentials")
        .select("id,name,credential_type,username,url,account_number,customer_id,expires_at,rotated_at,created_at,updated_at,tags,owner_id")
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("credential_access_log")
        .select("id,credential_id,accessed_by,action,created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      context.supabase.from("profiles").select("id,full_name,email"),
    ]);

    const creds = (credsRes.data ?? []) as any[];
    const nameById = new Map<string, string>();
    for (const p of (profilesRes.data ?? []) as any[]) nameById.set(p.id, p.full_name || p.email || "Unknown");
    const credName = new Map<string, string>();
    for (const c of creds) credName.set(c.id, c.name);

    const now = Date.now();
    const day = 86_400_000;
    const enriched = creds.map((c) => {
      const expMs = c.expires_at ? new Date(c.expires_at).getTime() : null;
      const lastChange = new Date(c.rotated_at || c.updated_at || c.created_at).getTime();
      const ageDays = Math.floor((now - lastChange) / day);
      const expiresInDays = expMs === null ? null : Math.floor((expMs - now) / day);
      const hygiene =
        expiresInDays !== null && expiresInDays < 0 ? "expired"
        : expiresInDays !== null && expiresInDays <= 30 ? "expiring"
        : ageDays > 180 ? "stale"
        : "healthy";
      return { ...c, ageDays, expiresInDays, hygiene };
    });

    const accessLog = ((logRes.data ?? []) as any[]).map((l) => ({
      ...l,
      actor: nameById.get(l.accessed_by) ?? "Unknown",
      credential: credName.get(l.credential_id) ?? "(archived)",
    }));

    return {
      credentials: enriched,
      accessLog,
      stats: {
        total: enriched.length,
        expired: enriched.filter((c) => c.hygiene === "expired").length,
        expiring: enriched.filter((c) => c.hygiene === "expiring").length,
        stale: enriched.filter((c) => c.hygiene === "stale").length,
        reveals7d: accessLog.filter((l) => now - new Date(l.created_at).getTime() < 7 * day).length,
      },
    };
  });
