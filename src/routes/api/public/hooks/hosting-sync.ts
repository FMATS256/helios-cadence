import { createFileRoute } from "@tanstack/react-router";

/**
 * Hosting + cloud storage sync tick (Block 7).
 * Pulls cPanel usage for every WHM-backed hosting account and flags cloud
 * storage accounts that are near capacity. Scheduled via pg_cron.
 */
async function runTick() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { syncHostingAccount, logOps } = await import("@/lib/hosting.server");

  const { data: accounts } = await supabaseAdmin
    .from("web_hosting_accounts")
    .select("*")
    .eq("provisioning_status", "whm")
    .not("username", "is", null)
    .is("archived_at", null);

  let synced = 0;
  let failed = 0;
  for (const row of (accounts ?? []) as any[]) {
    const res = await syncHostingAccount(supabaseAdmin, row);
    if (res.ok) synced += 1;
    else {
      failed += 1;
      await logOps(supabaseAdmin, {
        service_type: "web_hosting", entity_id: row.id, customer_id: row.customer_id,
        account_number: row.account_number, action: "hosting_sync_failed", status: "failed",
        message: res.error,
      });
    }
  }

  // Cloud storage capacity watch — raise one ops event per account crossing 90%.
  const { data: storage } = await supabaseAdmin
    .from("cloud_storage_accounts")
    .select("id,name,customer_id,account_number,storage_tb,used_tb,status")
    .is("archived_at", null)
    .eq("status", "active");

  let nearFull = 0;
  for (const s of (storage ?? []) as any[]) {
    const cap = Number(s.storage_tb ?? 0);
    const used = Number(s.used_tb ?? 0);
    if (cap <= 0) continue;
    const pct = (used / cap) * 100;
    if (pct < 90) continue;
    nearFull += 1;
    await logOps(supabaseAdmin, {
      service_type: "cloud_storage", entity_id: s.id, customer_id: s.customer_id,
      account_number: s.account_number, action: "storage_capacity_warning", status: "success",
      message: `${s.name} is at ${pct.toFixed(1)}% of allocated capacity`,
      detail: { used_tb: used, storage_tb: cap, pct: Math.round(pct * 10) / 10 },
    });
  }

  return { synced, failed, storage_warnings: nearFull };
}

export const Route = createFileRoute("/api/public/hooks/hosting-sync")({
  server: {
    handlers: {
      POST: async () => new Response(JSON.stringify(await runTick()), { headers: { "content-type": "application/json" } }),
      GET: async () => new Response(JSON.stringify(await runTick()), { headers: { "content-type": "application/json" } }),
    },
  },
});
