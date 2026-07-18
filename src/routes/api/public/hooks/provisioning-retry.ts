// Cron hook: retries failed provisioning workflows (Phase 4 agent completion).
// Marks stale running workflows as failed after 30 min of inactivity, then
// re-runs any recently-failed workflow up to MAX_RETRIES times.
import { createFileRoute } from "@tanstack/react-router";

const MAX_RETRIES = 3;
const STALE_MINUTES = 30;

export const Route = createFileRoute("/api/public/hooks/provisioning-retry")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runWorkflow } = await import("@/lib/agent/workflow.server");
        const staleCutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

        // 1. Mark stuck workflows as failed so they can be retried.
        await supabaseAdmin
          .from("deployment_workflows")
          .update({ status: "failed", error: "stalled — no progress" })
          .eq("status", "running")
          .lt("started_at", staleCutoff);

        // 2. Retry failed workflows (bounded).
        const { data: failed } = await supabaseAdmin
          .from("deployment_workflows")
          .select("id, plan_id, provider, retry_count, created_at")
          .eq("status", "failed")
          .order("created_at", { ascending: true })
          .limit(5);

        const results: any[] = [];
        for (const wf of failed ?? []) {
          const retryCount = (wf as any).retry_count ?? 0;
          if (retryCount >= MAX_RETRIES) continue;
          const { data: plan } = await supabaseAdmin
            .from("provisioning_plans").select("request").eq("id", wf.plan_id!).maybeSingle();
          if (!plan) continue;
          await supabaseAdmin.from("deployment_workflows").update({
            status: "pending", error: null, retry_count: retryCount + 1,
          } as any).eq("id", wf.id);
          runWorkflow({
            workflow_id: wf.id, plan_id: wf.plan_id, provider: wf.provider as any,
            request: plan.request as any,
          }).catch(async (e) => {
            console.error(`retry ${wf.id} failed`, e);
          });
          results.push({ id: wf.id, retry: retryCount + 1 });
        }

        return Response.json({ ok: true, retried: results });
      },
    },
  },
});
