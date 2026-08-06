/**
 * Web Hosting (WHM/cPanel) + Cloud Storage lifecycle — server functions.
 * Every action validates role, ownership and service state, pushes to the
 * provider when configured, and writes ops event + audit + timeline rows.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const HOSTING_ROLES = ["operations_manager", "cloud_engineer", "technical_support"];
const STORAGE_ROLES = ["operations_manager", "cloud_engineer"];

/* ------------------------------------------------------------------ *
 * WHM servers registry
 * ------------------------------------------------------------------ */

export const listWhmServers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whm_servers")
      .select("id,name,hostname,port,api_user,token_secret_name,default_package,nameservers,is_default,active,verified_at,last_error,created_at")
      .order("is_default", { ascending: false })
      .order("created_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveWhmServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string; name: string; hostname: string; port?: number; api_user?: string;
    token_secret_name?: string; default_package?: string | null; is_default?: boolean; active?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin, logOps } = await import("./hosting.server");
    await assertRole(context, ["operations_manager"]);
    if (!data.name?.trim() || !data.hostname?.trim()) throw new Error("Name and hostname are required");
    const db = await admin();
    const payload = {
      name: data.name.trim(),
      hostname: data.hostname.trim(),
      port: data.port ?? 2087,
      api_user: data.api_user?.trim() || "root",
      token_secret_name: data.token_secret_name?.trim() || "WHM_API_TOKEN",
      default_package: data.default_package || null,
      is_default: data.is_default ?? false,
      active: data.active ?? true,
      created_by: context.userId,
    };
    const q = data.id
      ? db.from("whm_servers").update(payload).eq("id", data.id).select("*").single()
      : db.from("whm_servers").insert(payload).select("*").single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    if (payload.is_default) {
      await db.from("whm_servers").update({ is_default: false }).neq("id", row.id);
    }
    await logOps(db, {
      service_type: "web_hosting", entity_id: row.id, action: data.id ? "whm_server_updated" : "whm_server_added",
      message: row.hostname, actor_id: context.userId,
    });
    return row;
  });

export const testWhmServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin } = await import("./hosting.server");
    await assertRole(context, ["operations_manager", "cloud_engineer"]);
    const db = await admin();
    const { loadWhmServer, whm } = await import("./whm.server");
    const server = await loadWhmServer(db, data.id);
    const res = await whm(server).ping();
    await db.from("whm_servers").update({
      verified_at: res.ok ? new Date().toISOString() : null,
      last_error: res.ok ? null : (res as any).error,
    }).eq("id", data.id);
    return { ok: res.ok, error: res.ok ? null : (res as any).error, version: res.ok ? (res as any).data?.version ?? null : null };
  });

/* ------------------------------------------------------------------ *
 * Hosting account detail (usage, events, WHM state)
 * ------------------------------------------------------------------ */

export const getHostingAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { loadHostingAccount } = await import("./hosting.server");
    const account = await loadHostingAccount(context.supabase, data.id);
    const { data: events } = await context.supabase
      .from("service_ops_events")
      .select("*")
      .eq("entity_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return { account, events: events ?? [] };
  });

/* ------------------------------------------------------------------ *
 * Provisioning
 * ------------------------------------------------------------------ */

export const provisionHostingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; plan?: string | null; whm_server_id?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin, loadHostingAccount, recordServiceAction, syncHostingAccount } = await import("./hosting.server");
    await assertRole(context, HOSTING_ROLES);
    const db = await admin();
    const row = await loadHostingAccount(db, data.id);
    if (row.provisioning_status === "whm") throw new Error("This account is already provisioned on WHM");
    if (row.status === "cancelled") throw new Error("Cancelled accounts cannot be provisioned");

    const { loadWhmServer, whm, cpanelUsernameFor, generatePassword } = await import("./whm.server");
    const server = await loadWhmServer(db, data.whm_server_id ?? row.whm_server_id);
    const username = row.username?.trim() || cpanelUsernameFor(row.domain);
    const password = generatePassword();

    const res = await whm(server).createAccount({
      username,
      domain: row.domain,
      password,
      plan: data.plan ?? row.plan ?? null,
      contactemail: row.customers?.primary_email ?? null,
      quota_mb: row.disk_quota_gb ? Number(row.disk_quota_gb) * 1024 : null,
    });

    if (!res.ok) {
      await recordServiceAction(db, {
        service_type: "web_hosting", row, action: "hosting_provision_failed", status: "failed",
        title: `Hosting provisioning failed for ${row.domain}`, description: (res as any).error,
        actor_id: context.userId, major: false,
      });
      throw new Error((res as any).error);
    }

    await db.from("web_hosting_accounts").update({
      username,
      status: "active",
      provisioning_status: "whm",
      whm_server_id: server?.id ?? null,
      control_panel: "cpanel",
      control_panel_url: row.control_panel_url || (server ? `https://${server.hostname}:2083` : null),
      plan: data.plan ?? row.plan,
    }).eq("id", row.id);

    // Store the initial password in the encrypted credential vault.
    const { vaultStoreHostingSecret } = await import("./hosting.server");
    await vaultStoreHostingSecret(db, {
      row, name: `cPanel — ${row.domain}`, username,
      url: row.control_panel_url || (server ? `https://${server.hostname}:2083` : null),
      secret: password, actorId: context.userId,
    });

    await recordServiceAction(db, {
      service_type: "web_hosting", row, action: "service_activated",
      title: `Hosting account provisioned — ${row.domain}`,
      description: `cPanel user ${username} created on ${server?.name ?? "WHM"}`,
      new_value: { username, plan: data.plan ?? row.plan }, actor_id: context.userId,
    });

    await syncHostingAccount(db, { ...row, username, whm_server_id: server?.id ?? null });
    return { ok: true, username };
  });

/* ------------------------------------------------------------------ *
 * Lifecycle: suspend / unsuspend / terminate / change package / password
 * ------------------------------------------------------------------ */

export const hostingLifecycleAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    action: "suspend" | "unsuspend" | "terminate" | "change_package" | "reset_password";
    reason?: string;
    plan?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin, loadHostingAccount, recordServiceAction, syncHostingAccount } = await import("./hosting.server");
    await assertRole(context, data.action === "terminate" ? ["operations_manager"] : HOSTING_ROLES);
    const db = await admin();
    const row = await loadHostingAccount(db, data.id);

    // State validation
    if (data.action === "suspend" && row.status === "suspended") throw new Error("Account is already suspended");
    if (data.action === "unsuspend" && row.status === "active") throw new Error("Account is already active");
    if (data.action === "terminate" && row.status === "cancelled") throw new Error("Account is already cancelled");
    if (data.action === "change_package" && !data.plan?.trim()) throw new Error("Choose a package");

    const { loadWhmServer, whm, generatePassword } = await import("./whm.server");
    const server = await loadWhmServer(db, row.whm_server_id);
    const api = whm(server);
    const remote = row.provisioning_status === "whm" && row.username;

    let providerNote = "Local record only (not provisioned on WHM)";
    let newPassword: string | null = null;
    if (remote) {
      const res =
        data.action === "suspend" ? await api.suspend(row.username, data.reason)
        : data.action === "unsuspend" ? await api.unsuspend(row.username)
        : data.action === "terminate" ? await api.terminate(row.username)
        : data.action === "change_package" ? await api.changePackage(row.username, data.plan!)
        : await (async () => { newPassword = generatePassword(); return api.changePassword(row.username, newPassword); })();
      if (!res.ok) {
        await recordServiceAction(db, {
          service_type: "web_hosting", row, action: `hosting_${data.action}_failed`, status: "failed",
          title: `WHM ${data.action.replace("_", " ")} failed — ${row.domain}`,
          description: (res as any).error, actor_id: context.userId, major: false,
        });
        throw new Error((res as any).error);
      }
      providerNote = `Applied on ${server?.name ?? "WHM"}`;
    }

    const patch: Record<string, any> =
      data.action === "suspend" ? { status: "suspended", suspend_reason: data.reason ?? "Billing suspension" }
      : data.action === "unsuspend" ? { status: "active", suspend_reason: null }
      : data.action === "terminate" ? { status: "cancelled", provisioning_status: remote ? "terminated" : row.provisioning_status, archived_at: new Date().toISOString() }
      : data.action === "change_package" ? { plan: data.plan }
      : {};
    if (Object.keys(patch).length) {
      const { error } = await db.from("web_hosting_accounts").update(patch).eq("id", row.id);
      if (error) throw new Error(error.message);
    }

    const titles: Record<string, string> = {
      suspend: `Hosting suspended — ${row.domain}`,
      unsuspend: `Hosting restored — ${row.domain}`,
      terminate: `Hosting terminated — ${row.domain}`,
      change_package: `Hosting package changed — ${row.domain}`,
      reset_password: `cPanel password reset — ${row.domain}`,
    };
    const events: Record<string, string> = {
      suspend: "service_suspended", unsuspend: "service_resumed", terminate: "service_cancelled",
      change_package: "package_changed", reset_password: "credentials_rotated",
    };

    await recordServiceAction(db, {
      service_type: "web_hosting", row, action: events[data.action], title: titles[data.action],
      description: [data.reason, providerNote].filter(Boolean).join(" · "),
      old_value: { status: row.status, plan: row.plan },
      new_value: { ...patch },
      actor_id: context.userId,
      major: data.action !== "reset_password",
    });

    if (data.action === "reset_password" && newPassword) {
      const { vaultStoreHostingSecret } = await import("./hosting.server");
      await vaultStoreHostingSecret(db, {
        row, name: `cPanel — ${row.domain} (rotated)`, username: row.username,
        url: row.control_panel_url, secret: newPassword, actorId: context.userId,
      });
    }

    if (remote && data.action !== "terminate") await syncHostingAccount(db, row);
    return { ok: true, password: newPassword, provider: providerNote };
  });

/** One-time SSO link into cPanel — no password sharing, fully audited. */
export const hostingSsoLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin, loadHostingAccount, recordServiceAction } = await import("./hosting.server");
    await assertRole(context, HOSTING_ROLES);
    const db = await admin();
    const row = await loadHostingAccount(db, data.id);
    if (row.provisioning_status !== "whm" || !row.username) throw new Error("Account is not provisioned on WHM");
    const { loadWhmServer, whm } = await import("./whm.server");
    const server = await loadWhmServer(db, row.whm_server_id);
    const res = await whm(server).ssoSession(row.username);
    if (!res.ok) throw new Error((res as any).error);
    const url = (res as any).data?.url as string | undefined;
    if (!url) throw new Error("WHM did not return a session URL");
    await recordServiceAction(db, {
      service_type: "web_hosting", row, action: "cpanel_sso_opened",
      title: `cPanel session opened — ${row.domain}`, description: `Staff SSO into ${row.username}`,
      actor_id: context.userId, major: false,
    });
    return { url };
  });

/** Sync usage for one account, or every WHM-backed account. */
export const syncHosting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin, syncHostingAccount } = await import("./hosting.server");
    await assertRole(context, HOSTING_ROLES);
    const db = await admin();

    if (data.id) {
      const { data: row } = await db.from("web_hosting_accounts").select("*").eq("id", data.id).maybeSingle();
      if (!row) throw new Error("Hosting account not found");
      const res = await syncHostingAccount(db, row);
      if (!res.ok) throw new Error(res.error);
      return { synced: 1, failed: 0 };
    }

    const { data: rows } = await db
      .from("web_hosting_accounts").select("*")
      .eq("provisioning_status", "whm").not("username", "is", null).is("archived_at", null);
    let synced = 0, failed = 0;
    for (const row of (rows ?? []) as any[]) {
      const res = await syncHostingAccount(db, row);
      res.ok ? (synced += 1) : (failed += 1);
    }
    return { synced, failed };
  });

/* ------------------------------------------------------------------ *
 * Cloud storage lifecycle
 * ------------------------------------------------------------------ */

export const storageLifecycleAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    action: "provision" | "suspend" | "resume" | "terminate" | "resize" | "record_usage";
    reason?: string;
    storage_tb?: number;
    used_tb?: number;
    connected_devices?: number;
    last_backup_at?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin, loadStorageAccount, recordServiceAction } = await import("./hosting.server");
    await assertRole(context, data.action === "terminate" ? ["operations_manager"] : STORAGE_ROLES);
    const db = await admin();
    const row = await loadStorageAccount(db, data.id);
    const now = new Date().toISOString();

    if (data.action === "suspend" && row.status === "suspended") throw new Error("Account is already suspended");
    if (data.action === "resume" && row.status === "active") throw new Error("Account is already active");
    if (data.action === "terminate" && row.status === "cancelled") throw new Error("Account is already cancelled");
    if (data.action === "resize") {
      const tb = Number(data.storage_tb ?? 0);
      if (!(tb > 0)) throw new Error("Enter the new capacity in TB");
      if (tb < Number(row.used_tb ?? 0)) throw new Error("New capacity is below the storage already in use");
    }

    const patch: Record<string, any> =
      data.action === "provision" ? { status: "active", provisioning_status: "provisioned", suspended_at: null, suspend_reason: null }
      : data.action === "suspend" ? { status: "suspended", suspended_at: now, suspend_reason: data.reason ?? "Billing suspension" }
      : data.action === "resume" ? { status: "active", suspended_at: null, suspend_reason: null }
      : data.action === "terminate" ? { status: "cancelled", archived_at: now }
      : data.action === "resize" ? { storage_tb: data.storage_tb }
      : {
          used_tb: data.used_tb ?? row.used_tb,
          connected_devices: data.connected_devices ?? row.connected_devices,
          last_backup_at: data.last_backup_at ?? row.last_backup_at,
          last_sync_at: now, sync_status: "ok", sync_error: null,
        };

    const { error } = await db.from("cloud_storage_accounts").update(patch).eq("id", row.id);
    if (error) throw new Error(error.message);

    const titles: Record<string, string> = {
      provision: `Cloud storage provisioned — ${row.name}`,
      suspend: `Cloud storage suspended — ${row.name}`,
      resume: `Cloud storage restored — ${row.name}`,
      terminate: `Cloud storage terminated — ${row.name}`,
      resize: `Cloud storage resized — ${row.name}`,
      record_usage: `Cloud storage usage updated — ${row.name}`,
    };
    const events: Record<string, string> = {
      provision: "service_activated", suspend: "service_suspended", resume: "service_resumed",
      terminate: "service_cancelled", resize: "package_changed", record_usage: "usage_recorded",
    };

    await recordServiceAction(db, {
      service_type: "cloud_storage", row, action: events[data.action], title: titles[data.action],
      description: data.reason ?? null,
      old_value: { status: row.status, storage_tb: row.storage_tb, used_tb: row.used_tb },
      new_value: patch, actor_id: context.userId,
      major: data.action !== "record_usage",
    });

    return { ok: true };
  });

export const getStorageAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { loadStorageAccount } = await import("./hosting.server");
    const account = await loadStorageAccount(context.supabase, data.id);
    const { data: events } = await context.supabase
      .from("service_ops_events").select("*").eq("entity_id", data.id)
      .order("created_at", { ascending: false }).limit(50);
    return { account, events: events ?? [] };
  });
