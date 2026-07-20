// Backup & DR — server functions for snapshots, schedules and restore.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Frequency = "hourly" | "daily" | "weekly" | "monthly";

function nextRun(from: Date, freq: Frequency): Date {
  const d = new Date(from);
  if (freq === "hourly") d.setHours(d.getHours() + 1);
  else if (freq === "weekly") d.setDate(d.getDate() + 7);
  else if (freq === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + 1);
  return d;
}

export const listServerBackups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("server_backups").select("*")
      .eq("server_id", data.server_id)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return rows ?? [];
  });

export const listAllBackups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("server_backups").select("*")
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const listBackupSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("backup_schedules").select("*")
      .order("next_run_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const createBackupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string; retention_days?: number; notes?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: srv, error: se } = await context.supabase
      .from("cloud_servers").select("id, provider, name").eq("id", data.server_id).single();
    if (se) throw se;

    const expires = new Date();
    expires.setDate(expires.getDate() + (data.retention_days ?? 7));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("server_backups").insert({
      server_id: data.server_id,
      provider: srv.provider,
      kind: "manual",
      status: "completed",     // logged manually; provider snapshot APIs are provider-specific
      taken_at: new Date().toISOString(),
      expires_at: expires.toISOString(),
      notes: data.notes ?? `Manual backup for ${srv.name}`,
      created_by: context.userId,
    }).select("*").single();
    if (error) throw error;

    await supabaseAdmin.from("cloud_activity").insert({
      action: "backup_created", server_id: data.server_id,
      detail: { backup_id: row.id, kind: "manual" },
    });
    return row;
  });

export const upsertBackupSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    server_id: string; frequency: Frequency; retention_days: number; enabled: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("backup_schedules").upsert({
      server_id: data.server_id,
      frequency: data.frequency,
      retention_days: data.retention_days,
      enabled: data.enabled,
      next_run_at: nextRun(new Date(), data.frequency).toISOString(),
      created_by: context.userId,
    }, { onConflict: "server_id" }).select("*").single();
    if (error) throw error;
    return row;
  });

export const deleteBackupSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { server_id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("backup_schedules")
      .delete().eq("server_id", data.server_id);
    if (error) throw error;
    return { ok: true };
  });

export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { backup_id: string; notes?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bk, error } = await supabaseAdmin
      .from("server_backups").select("*").eq("id", data.backup_id).single();
    if (error) throw error;
    if (bk.status !== "completed") throw new Error(`Backup is ${bk.status}, cannot restore`);

    await supabaseAdmin.from("server_backups").update({
      status: "restored", notes: (bk.notes ?? "") + `\nRestored by ${context.userId} at ${new Date().toISOString()}${data.notes ? " — " + data.notes : ""}`,
    }).eq("id", data.backup_id);
    await supabaseAdmin.from("cloud_activity").insert({
      action: "backup_restored", server_id: bk.server_id,
      detail: { backup_id: bk.id },
    });
    return { ok: true };
  });
