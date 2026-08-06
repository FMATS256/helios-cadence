// Server-only helpers for the hosting + cloud storage lifecycle (Block 7).
import { recordCustomerEvent, recordAudit } from "./customer-events.server";

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function assertRole(ctx: { supabase: any; userId: string }, roles: string[]) {
  const checks = await Promise.all(
    ["master_admin", ...roles].map((r) => ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: r })),
  );
  if (!checks.some((c: any) => Boolean(c?.data))) {
    throw new Error("You do not have permission to perform this operation.");
  }
}

/** Append a provider/lifecycle event row. Never throws. */
export async function logOps(
  db: any,
  e: {
    service_type: string;
    entity_id?: string | null;
    customer_id?: string | null;
    account_number?: string | null;
    action: string;
    status?: "success" | "failed" | "skipped";
    message?: string | null;
    detail?: Record<string, any>;
    actor_id?: string | null;
  },
) {
  try {
    await db.from("service_ops_events").insert({
      service_type: e.service_type,
      entity_id: e.entity_id ?? null,
      customer_id: e.customer_id ?? null,
      account_number: e.account_number ?? null,
      action: e.action,
      status: e.status ?? "success",
      message: e.message ?? null,
      detail: e.detail ?? {},
      actor_id: e.actor_id ?? null,
    });
  } catch (err) {
    console.error("[logOps]", err);
  }
}

/**
 * One writer for every hosting/storage mutation: ops event + audit log +
 * (when the record belongs to a customer) the Customer 360 timeline.
 */
export async function recordServiceAction(
  db: any,
  opts: {
    service_type: string;
    row: any;
    action: string;
    title: string;
    description?: string | null;
    status?: "success" | "failed" | "skipped";
    old_value?: Record<string, any> | null;
    new_value?: Record<string, any> | null;
    detail?: Record<string, any>;
    actor_id?: string | null;
    actor_email?: string | null;
    major?: boolean;
  },
) {
  const table = opts.service_type === "cloud_storage" ? "cloud_storage_accounts" : "web_hosting_accounts";
  await logOps(db, {
    service_type: opts.service_type,
    entity_id: opts.row?.id ?? null,
    customer_id: opts.row?.customer_id ?? null,
    account_number: opts.row?.account_number ?? null,
    action: opts.action,
    status: opts.status ?? "success",
    message: opts.description ?? null,
    detail: opts.detail ?? {},
    actor_id: opts.actor_id ?? null,
  });

  if (opts.row?.customer_id && opts.row?.account_number) {
    await recordCustomerEvent(db, {
      customer_id: opts.row.customer_id,
      account_number: opts.row.account_number,
      event_type: opts.action,
      title: opts.title,
      description: opts.description ?? null,
      module: opts.service_type === "cloud_storage" ? "cloud_storage" : "web_hosting",
      entity_type: table,
      entity_id: opts.row.id,
      old_value: opts.old_value ?? null,
      new_value: opts.new_value ?? null,
      major: opts.major !== false,
      actor_id: opts.actor_id ?? null,
      actor_email: opts.actor_email ?? null,
      metadata: opts.detail ?? {},
    });
  } else {
    await recordAudit(db, {
      actor_id: opts.actor_id ?? null,
      actor_email: opts.actor_email ?? null,
      action: opts.action,
      entity_type: table,
      entity_id: opts.row?.id ?? null,
      account_number: opts.row?.account_number ?? null,
      module: opts.service_type,
      old_value: opts.old_value ?? null,
      new_value: opts.new_value ?? null,
    });
  }
}

export async function loadHostingAccount(db: any, id: string) {
  const { data, error } = await db
    .from("web_hosting_accounts")
    .select("*, customers(id,account_number,company_name,primary_email)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Hosting account not found");
  return data;
}

export async function loadStorageAccount(db: any, id: string) {
  const { data, error } = await db
    .from("cloud_storage_accounts")
    .select("*, customers(id,account_number,company_name,primary_email)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Cloud storage account not found");
  return data;
}

/**
 * Sync one hosting account's usage from WHM into the database.
 * Returns the patch that was written (or the failure reason).
 */
export async function syncHostingAccount(db: any, account: any) {
  const { loadWhmServer, fetchHostingUsage } = await import("./whm.server");
  if (!account.username) {
    return { ok: false as const, configured: true, error: "Account has no cPanel username" };
  }
  const server = await loadWhmServer(db, account.whm_server_id);
  const res = await fetchHostingUsage(server, account.username);

  if (!res.ok) {
    await db.from("web_hosting_accounts").update({
      last_sync_at: new Date().toISOString(),
      sync_status: res.configured ? "failed" : "not_configured",
      sync_error: res.error,
    }).eq("id", account.id);
    return { ok: false as const, configured: res.configured, error: res.error };
  }

  const u = res.data;
  const patch: Record<string, any> = {
    disk_used_mb: u.disk_used_mb,
    bandwidth_used_mb: u.bandwidth_used_mb,
    email_accounts: u.email_accounts,
    databases_count: u.databases_count,
    subdomains_count: u.subdomains_count,
    addon_domains_count: u.addon_domains_count,
    ssl_status: u.ssl_status,
    php_version: u.php_version,
    ip_address: u.ip_address,
    last_sync_at: new Date().toISOString(),
    sync_status: "ok",
    sync_error: null,
    whm_server_id: account.whm_server_id ?? server?.id ?? null,
  };
  if (u.disk_quota_gb != null) patch.disk_quota_gb = u.disk_quota_gb;
  if (u.plan) patch.plan = u.plan;
  // WHM is authoritative for suspension state.
  if (u.suspended === true && account.status !== "suspended") patch.status = "suspended";
  if (u.suspended === false && account.status === "suspended") patch.status = "active";

  const { error } = await db.from("web_hosting_accounts").update(patch).eq("id", account.id);
  if (error) return { ok: false as const, configured: true, error: error.message };
  return { ok: true as const, configured: true, patch };
}

/**
 * Billing-driven unsuspend: called after a payment clears. Pushes the
 * unsuspend to WHM for every hosting account that just came back.
 */
export async function unsuspendHostingForCustomer(db: any, customerId: string, actorId?: string | null) {
  const { data: rows } = await db
    .from("web_hosting_accounts")
    .select("*")
    .eq("customer_id", customerId)
    .eq("provisioning_status", "whm");
  let pushed = 0;
  for (const row of (rows ?? []) as any[]) {
    if (!row.username) continue;
    const { loadWhmServer, whm } = await import("./whm.server");
    const server = await loadWhmServer(db, row.whm_server_id);
    const res = await whm(server).unsuspend(row.username);
    await logOps(db, {
      service_type: "web_hosting",
      entity_id: row.id,
      customer_id: customerId,
      account_number: row.account_number,
      action: "hosting_unsuspended",
      status: res.ok ? "success" : "failed",
      message: res.ok ? "Auto-unsuspended after payment" : (res as any).error,
      actor_id: actorId ?? null,
    });
    if (res.ok) pushed += 1;
  }
  return pushed;
}

/** Store a hosting credential in the encrypted vault. Never throws. */
export async function vaultStoreHostingSecret(
  db: any,
  opts: { row: any; name: string; username: string; url?: string | null; secret: string; actorId?: string | null },
) {
  try {
    const { encryptSecret } = await import("./encryption.server");
    const enc = encryptSecret(opts.secret);
    await db.from("credentials").insert({
      customer_id: opts.row.customer_id ?? null,
      account_number: opts.row.account_number ?? null,
      name: opts.name,
      username: opts.username,
      credential_type: "hosting",
      url: opts.url ?? null,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      auth_tag: enc.authTag,
      key_id: enc.keyId,
      created_by: opts.actorId ?? null,
      owner_id: opts.actorId ?? null,
    });
  } catch (e) {
    console.error("[vaultStoreHostingSecret]", e);
  }
}
