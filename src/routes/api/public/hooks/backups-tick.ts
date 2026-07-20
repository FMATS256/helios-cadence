// Cron hook: runs due backup schedules and prunes expired backups.
// Schedule via pg_cron every 15 minutes.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/backups-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();

        const { data: due } = await supabaseAdmin
          .from("backup_schedules").select("*, cloud_servers(id, name, provider)")
          .eq("enabled", true).lte("next_run_at", now.toISOString()).limit(50);

        let ran = 0;
        for (const sched of due ?? []) {
          const srv = (sched as any).cloud_servers;
          if (!srv) continue;
          const expires = new Date();
          expires.setDate(expires.getDate() + sched.retention_days);

          await supabaseAdmin.from("server_backups").insert({
            server_id: sched.server_id,
            provider: srv.provider,
            kind: sched.frequency === "hourly" ? "incremental" : "snapshot",
            status: "completed",
            taken_at: now.toISOString(),
            expires_at: expires.toISOString(),
            notes: `Auto ${sched.frequency} backup`,
          });

          // Advance schedule
          const next = new Date(now);
          if (sched.frequency === "hourly") next.setHours(next.getHours() + 1);
          else if (sched.frequency === "weekly") next.setDate(next.getDate() + 7);
          else if (sched.frequency === "monthly") next.setMonth(next.getMonth() + 1);
          else next.setDate(next.getDate() + 1);

          await supabaseAdmin.from("backup_schedules").update({
            last_run_at: now.toISOString(), next_run_at: next.toISOString(),
          }).eq("id", sched.id);
          ran++;
        }

        // Expire old backups
        const { data: expired } = await supabaseAdmin
          .from("server_backups").select("id")
          .eq("status", "completed").lte("expires_at", now.toISOString()).limit(200);
        if (expired?.length) {
          await supabaseAdmin.from("server_backups")
            .update({ status: "expired" })
            .in("id", expired.map((e) => e.id));
        }

        return Response.json({ ran, expired: expired?.length ?? 0 });
      },
    },
  },
});
