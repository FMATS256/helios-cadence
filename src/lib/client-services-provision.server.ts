/**
 * When a client's portal login is created, provision their pending hosting
 * accounts on the default WHM server and create the matching mailbox.
 * Passwords go only to the Credential Vault; failures are recorded, never thrown.
 */
export async function autoProvisionClientServices(db: any, customer: { id: string; primary_email: string | null }) {
  const results: Array<{ domain: string; hosting: string; mailbox?: string }> = [];
  const { data: rows } = await db.from("web_hosting_accounts").select("id")
    .eq("customer_id", customer.id).neq("status", "cancelled").or("provisioning_status.is.null,provisioning_status.neq.whm");
  if (!rows?.length) return results;
  const { loadHostingAccount, recordServiceAction, vaultStoreHostingSecret, syncHostingAccount } = await import("./hosting.server");
  const { loadWhmServer, whm, cpanelUsernameFor, generatePassword } = await import("./whm.server");
  for (const { id } of rows) {
    const row = await loadHostingAccount(db, id);
    if (!row.domain) continue;
    const server = await loadWhmServer(db, row.whm_server_id);
    const api = whm(server);
    const username = row.username?.trim() || cpanelUsernameFor(row.domain);
    const password = generatePassword();
    const created = await api.createAccount({
      username, domain: row.domain, password, plan: row.plan ?? null,
      contactemail: customer.primary_email, quota_mb: row.disk_quota_gb ? Number(row.disk_quota_gb) * 1024 : null,
    });
    if (!created.ok) {
      await recordServiceAction(db, { service_type: "web_hosting", row, action: "hosting_provision_failed", status: "failed",
        title: `Automatic hosting setup failed for ${row.domain}`, description: (created as any).error, actor_id: null, major: false });
      results.push({ domain: row.domain, hosting: "failed" });
      continue;
    }
    const cpUrl = row.control_panel_url || (server ? `https://${server.hostname}:2083` : null);
    await db.from("web_hosting_accounts").update({ username, status: "active", provisioning_status: "whm",
      whm_server_id: server?.id ?? null, control_panel: "cpanel", control_panel_url: cpUrl }).eq("id", row.id);
    await vaultStoreHostingSecret(db, { row, name: `cPanel — ${row.domain}`, username, url: cpUrl, secret: password });
    await recordServiceAction(db, { service_type: "web_hosting", row, action: "service_activated",
      title: `Hosting account provisioned automatically — ${row.domain}`, description: `cPanel user ${username}`, actor_id: null });
    const entry: { domain: string; hosting: string; mailbox?: string } = { domain: row.domain, hosting: "created" };
    const email = customer.primary_email?.trim().toLowerCase();
    if (email && email.endsWith(`@${row.domain.toLowerCase()}`)) {
      const mbPass = generatePassword(16);
      const mb = await api.mailboxCreate(username, email, mbPass, 2048);
      entry.mailbox = mb.ok ? "created" : "failed";
      if (mb.ok) await vaultStoreHostingSecret(db, { row, name: `Mailbox — ${email}`, username: email, url: server ? `https://${server.hostname}:2096` : null, secret: mbPass });
      await recordServiceAction(db, { service_type: "web_hosting", row, action: mb.ok ? "mailbox_created" : "mailbox_create_failed",
        status: mb.ok ? undefined : "failed", title: `Mailbox ${email} ${mb.ok ? "created" : "failed"}`,
        description: mb.ok ? null : (mb as any).error, actor_id: null, major: false } as any);
    }
    await syncHostingAccount(db, { ...row, username, whm_server_id: server?.id ?? null }).catch(() => null);
    results.push(entry);
  }
  return results;
}
