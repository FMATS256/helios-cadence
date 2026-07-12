// HMAC-signed webhook for the IMT Account Manager to submit provisioning requests.
// Body: { request: ProvisionRequest, provider?: ProviderName, auto_execute?: boolean }
// Header: X-Agent-Signature: sha256=<hex hmac of raw body using AGENT_WEBHOOK_SECRET>
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/agent/provision")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.AGENT_WEBHOOK_SECRET;
        if (!secret) return new Response("Server not configured", { status: 500 });

        const signature = (request.headers.get("x-agent-signature") ?? "").replace(/^sha256=/i, "");
        const raw = await request.text();
        const expected = createHmac("sha256", secret).update(raw).digest("hex");
        const a = Buffer.from(signature, "hex");
        const b = Buffer.from(expected, "hex");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try { payload = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
        if (!payload?.request?.name || !payload?.request?.region) {
          return new Response("request.name and request.region are required", { status: 400 });
        }

        const { generatePlan } = await import("@/lib/agent/plan.server");
        const report = await generatePlan({ ...payload.request, provider: payload.provider });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: plan, error } = await supabaseAdmin.from("provisioning_plans").insert({
          request: payload.request, provider: report.architecture.provider,
          region: report.architecture.region, status: payload.auto_execute ? "approved" : "draft",
          report: report as any, customer_id: payload.request.customer_id ?? null,
          estimated_monthly_usd: report.costs.monthly_usd,
          estimated_hourly_usd: report.costs.hourly_usd,
          estimated_setup_minutes: report.estimated_setup_minutes,
          approved_at: payload.auto_execute ? new Date().toISOString() : null,
        }).select("*").single();
        if (error) return new Response(error.message, { status: 500 });

        if (payload.auto_execute) {
          const { runWorkflow } = await import("@/lib/agent/workflow.server");
          const { data: wf } = await supabaseAdmin.from("deployment_workflows").insert({
            plan_id: plan.id, provider: plan.provider, customer_id: plan.customer_id, status: "pending",
          }).select("id").single();
          runWorkflow({
            workflow_id: wf!.id, plan_id: plan.id,
            provider: plan.provider as any, request: plan.request as any,
          }).catch((e) => console.error("workflow failed", e));
          return Response.json({ plan_id: plan.id, workflow_id: wf!.id, status: "started" }, { status: 202 });
        }
        return Response.json({ plan_id: plan.id, status: "awaiting_approval", report }, { status: 201 });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type, x-agent-signature",
      }}),
    },
  },
});
