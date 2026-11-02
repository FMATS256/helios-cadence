import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  readMigration, writeMigration, nextStage, pointsToImt,
  type MigrationMeta, type MigrationType, type MigrationStage,
} from "./hosting-migration";

const ROLES = ["operations_manager", "cloud_engineer", "technical_support"];

async function doh(name: string, type: string): Promise<string[]> {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
    });
    const j: any = await r.json();
    return (j.Answer ?? []).map((a: any) => String(a.data).replace(/\.$/, "").replace(/^\d+\s+/, ""));
  } catch { return []; }
}

export const listMigrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertRole, admin } = await import("./hosting.server");
    await assertRole(context, ROLES);
    const db = await admin();
    const { data, error } = await db.from("web_hosting_accounts")
      .select("id,domain,username,plan,status,provisioning_status,notes,account_number,customer_id,customers(company_name)")
      .like("notes", "%[imt-migration]%").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({ ...r, notes: undefined, migration: readMigration(r.notes) }))
      .filter((r: any) => r.migration);
  });

export const startMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    customer_id: string; domain: string; type: MigrationType; source_provider?: string | null;
    plan?: string | null; mailboxes?: string[]; old_ip?: string | null;
  }) => {
    const domain = String(d.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new Error("Enter a valid domain");
    if (!d.customer_id) throw new Error("Choose the client");
    if (!["cpanel_full", "imap_email", "manual_web"].includes(d.type)) throw new Error("Choose a migration type");
    return { ...d, domain, mailboxes: (d.mailboxes ?? []).map((m) => m.trim().toLowerCase()).filter(Boolean).slice(0, 200) };
  })
  .handler(async ({ data, context }) => {
    const { assertRole, admin, recordServiceAction } = await import("./hosting.server");
    await assertRole(context, ROLES);
    const db = await admin();
    const { data: existing } = await db.from("web_hosting_accounts").select("id").eq("domain", data.domain).neq("status", "cancelled").maybeSingle();
    if (existing) throw new Error("This domain already has a hosting record — open it instead");
    const { data: cust } = await db.from("customers").select("id,account_number").eq("id", data.customer_id).single();
    const meta: MigrationMeta = {
      type: data.type, stage: "requested", source_provider: data.source_provider ?? null,
      old_ip: data.old_ip ?? null, mailboxes: data.mailboxes,
      history: [{ stage: "requested", at: new Date().toISOString() }], dns: null,
    };
    const { data: row, error } = await db.from("web_hosting_accounts").insert({
      customer_id: cust.id, account_number: cust.account_number, domain: data.domain,
      provider: "IMT (Tremhost WHM)", control_panel: "cpanel", plan: data.plan ?? null,
      status: "pending", email_accounts: data.mailboxes.length || null,
      notes: writeMigration(`Migrating from ${data.source_provider || "another provider"}`, meta),
      created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    await recordServiceAction(db, {
      service_type: "web_hosting", row, action: "hosting_migration_started",
      title: `Migration started — ${data.domain}`, description: `From ${data.source_provider || "another provider"}`,
      actor_id: context.userId,
    });
    return { id: row.id };
  });

export const advanceMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; to?: MigrationStage | "cancelled"; note?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin, recordServiceAction } = await import("./hosting.server");
    await assertRole(context, ROLES);
    const db = await admin();
    const { data: row } = await db.from("web_hosting_accounts").select("*").eq("id", data.id).single();
    const meta = readMigration(row?.notes);
    if (!row || !meta) throw new Error("Migration not found");
    if (meta.stage === "completed") throw new Error("Migration already completed");
    const to = data.to ?? nextStage(meta.stage);
    if (!to) throw new Error("No next step");
    if (to === "cancelled") {
      await db.from("web_hosting_accounts").update({ status: "cancelled" }).eq("id", row.id);
    } else {
      // Guard rails: the step must actually be true before moving on.
      if (["data_restored", "dns_pending", "completed"].includes(to) && row.provisioning_status !== "whm")
        throw new Error("Create the cPanel account on the IMT server first");
      if (to === "target_created" && row.provisioning_status !== "whm")
        throw new Error("Use “Create account on server” — this step completes automatically");
      if (to === "completed" && !meta.dns?.points_to_imt)
        throw new Error("Run the DNS check — the domain does not point to IMT yet");
    }
    const next: MigrationMeta = { ...meta, stage: to === "cancelled" ? meta.stage : to,
      history: [...meta.history, { stage: (to === "cancelled" ? meta.stage : to) as MigrationStage, at: new Date().toISOString(), note: to === "cancelled" ? `Cancelled. ${data.note ?? ""}` : data.note ?? null }] };
    await db.from("web_hosting_accounts").update({
      notes: writeMigration(row.notes, next), ...(to === "completed" ? { status: "active" } : {}),
    }).eq("id", row.id);
    await recordServiceAction(db, {
      service_type: "web_hosting", row, action: `hosting_migration_${to}`,
      title: `Migration ${to.replace("_", " ")} — ${row.domain}`, description: data.note ?? null, actor_id: context.userId,
    });
    return { stage: next.stage };
  });

/** Called after provisioning to mark the target account step done. */
export const markMigrationTargetCreated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin } = await import("./hosting.server");
    await assertRole(context, ROLES);
    const db = await admin();
    const { data: row } = await db.from("web_hosting_accounts").select("id,notes,provisioning_status").eq("id", data.id).single();
    const meta = readMigration(row?.notes);
    if (!meta || row.provisioning_status !== "whm") return { ok: false };
    if (["requested", "backup_received"].includes(meta.stage)) {
      const next = { ...meta, stage: "target_created" as const, history: [...meta.history, { stage: "target_created" as const, at: new Date().toISOString() }] };
      await db.from("web_hosting_accounts").update({ notes: writeMigration(row.notes, next) }).eq("id", row.id);
    }
    return { ok: true };
  });

export const checkMigrationDns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin } = await import("./hosting.server");
    await assertRole(context, ROLES);
    const db = await admin();
    const { data: row } = await db.from("web_hosting_accounts").select("id,domain,notes,ip_address,whm_server_id").eq("id", data.id).single();
    const meta = readMigration(row?.notes);
    if (!meta) throw new Error("Migration not found");
    const { loadWhmServer } = await import("./whm.server");
    const server = await loadWhmServer(db, row.whm_server_id);
    const [a, mx, ns] = await Promise.all([doh(row.domain, "A"), doh(row.domain, "MX"), doh(row.domain, "NS")]);
    let serverIp = row.ip_address as string | null;
    if (!serverIp && server?.hostname) serverIp = (await doh(server.hostname, "A"))[0] ?? null;
    const dns = { checked_at: new Date().toISOString(), a, mx, ns, points_to_imt: pointsToImt(a, ns, serverIp, server?.hostname ?? null) };
    await db.from("web_hosting_accounts").update({ notes: writeMigration(row.notes, { ...meta, dns }) }).eq("id", row.id);
    return { ...dns, server_ip: serverIp, server_host: server?.hostname ?? null };
  });
