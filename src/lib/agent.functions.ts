// Cloud Provisioning Agent — server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProviderName, ProvisionRequest } from "./providers/types";

// --- Providers & templates catalog ---

export const listAgentProviders = createServerFn({ method: "GET" }).handler(async () => {
  const { listProviders } = await import("./providers/registry.server");
  return listProviders();
});

export const listAgentTemplates = createServerFn({ method: "GET" }).handler(async () => {
  const { listTemplateSummaries } = await import("./agent/templates.server");
  return listTemplateSummaries();
});

// --- Plan (dry-run) ---

export const generateProvisioningPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { request: ProvisionRequest; provider?: ProviderName }) => d)
  .handler(async ({ data, context }) => {
    const { generatePlan } = await import("./agent/plan.server");
    const report = await generatePlan({ ...data.request, provider: data.provider });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("provisioning_plans").insert({
      created_by: context.userId,
      customer_id: data.request.customer_id ?? null,
      request: data.request as any,
      provider: report.architecture.provider,
      region: report.architecture.region,
      status: "draft",
      report: report as any,
      estimated_monthly_usd: report.costs.monthly_usd,
      estimated_hourly_usd: report.costs.hourly_usd,
      estimated_setup_minutes: report.estimated_setup_minutes,
    }).select("*").single();
    if (error) throw error;
    return row;
  });

export const listProvisioningPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("provisioning_plans").select("*")
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data;
  });

export const getProvisioningPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: plan, error } = await context.supabase
      .from("provisioning_plans").select("*").eq("id", data.id).single();
    if (error) throw error;
    return plan;
  });

export const approveProvisioningPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plan, error } = await supabaseAdmin
      .from("provisioning_plans").select("*").eq("id", data.id).single();
    if (error) throw error;
    if (plan.status !== "draft") throw new Error(`Plan is ${plan.status}, cannot approve`);
    await supabaseAdmin.from("provisioning_plans").update({
      status: "approved", approved_by: context.userId, approved_at: new Date().toISOString(),
    }).eq("id", data.id);
    return { ok: true };
  });

export const rejectProvisioningPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reason: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("provisioning_plans").update({
      status: "rejected", rejected_reason: data.reason,
    }).eq("id", data.id);
    return { ok: true };
  });

// --- Execute ---

export const executeProvisioningPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { plan_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plan, error } = await supabaseAdmin
      .from("provisioning_plans").select("*").eq("id", data.plan_id).single();
    if (error) throw error;
    if (plan.status !== "approved") throw new Error(`Plan must be approved (current: ${plan.status})`);

    const { data: wf, error: wfErr } = await supabaseAdmin.from("deployment_workflows").insert({
      plan_id: plan.id, provider: plan.provider,
      customer_id: plan.customer_id, created_by: context.userId,
      status: "pending",
    }).select("id").single();
    if (wfErr) throw wfErr;

    const { runWorkflow } = await import("./agent/workflow.server");
    try {
      const result = await runWorkflow({
        workflow_id: wf.id,
        plan_id: plan.id,
        provider: plan.provider as ProviderName,
        request: plan.request as ProvisionRequest,
      });
      return { workflow_id: wf.id, ...result };
    } catch (e: any) {
      throw new Error(e?.message ?? "Workflow failed");
    }
  });

export const getWorkflow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: wf, error } = await context.supabase
      .from("deployment_workflows").select("*").eq("id", data.id).single();
    if (error) throw error;
    const { data: steps } = await context.supabase
      .from("deployment_steps").select("*").eq("workflow_id", data.id).order("seq");
    return { workflow: wf, steps: steps ?? [] };
  });

// --- Cost estimate (standalone) ---

export const estimateProvisionCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { request: ProvisionRequest; provider?: ProviderName }) => d)
  .handler(async ({ data }) => {
    const { getProvider } = await import("./providers/registry.server");
    const provider = data.provider ?? "kamatera";
    return getProvider(provider).estimatePrice(data.request);
  });
