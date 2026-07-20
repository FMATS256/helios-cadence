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
        request: plan.request as unknown as ProvisionRequest,
      });
      return { ...result, workflow_id: wf.id };
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

// --- AI prompt → plan ---
// Natural-language deployment: staff types a prompt, an LLM turns it into a
// ProvisionRequest, and we generate + persist a draft plan for review.

export const deployFromPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { prompt: string; customer_id?: string | null; auto_approve?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    if (!data.prompt?.trim()) throw new Error("Prompt is required");

    const system = `You convert IT operations prompts into a JSON ProvisionRequest for a cloud provisioning agent.
Return ONLY valid JSON matching this TypeScript shape (no prose, no markdown fences):
{
  "kind": "vm",
  "name": string,                              // short server name, lowercase-with-dashes
  "region": string,                            // provider region id, default "EU-FR" (Kamatera Frankfurt) if unspecified
  "os": "ubuntu"|"debian"|"almalinux"|"rocky"|"windows",
  "image": string,                             // e.g. "ubuntu_22.04_64-bit"
  "cpu_cores": number,                         // 1..32
  "ram_mb": number,                            // 1024..65536
  "disk_gb": number,                           // 20..2000
  "template"?: "wordpress"|"nginx"|"nodejs"|"docker"|"lamp",
  "billing_cycle": "monthly"|"hourly",
  "tags": string[],
  "notes": string,
  "provider": "kamatera"|"vultr"|"contabo"     // pick the best fit; default "kamatera"
}
Rules: infer sensible sizing from the workload described. If user says "small/basic" use 1vCPU/2GB/40GB.
"medium" = 2vCPU/4GB/80GB. "large" = 4vCPU/8GB/160GB. Never invent fields not in the schema.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: data.prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`AI gateway error ${resp.status}: ${t.slice(0, 200)}`);
    }
    const json: any = await resp.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { throw new Error("AI returned invalid JSON"); }

    const provider = (parsed.provider ?? "kamatera") as ProviderName;
    const request: ProvisionRequest = {
      kind: "vm",
      name: parsed.name || "ai-server",
      region: parsed.region || "EU-FR",
      os: parsed.os,
      image: parsed.image,
      cpu_cores: parsed.cpu_cores ?? 2,
      ram_mb: parsed.ram_mb ?? 4096,
      disk_gb: parsed.disk_gb ?? 40,
      template: parsed.template,
      billing_cycle: parsed.billing_cycle ?? "monthly",
      tags: [...(parsed.tags ?? []), "ai-prompt"],
      notes: parsed.notes || data.prompt.slice(0, 500),
      customer_id: data.customer_id ?? null,
    };

    const { generatePlan } = await import("./agent/plan.server");
    const report = await generatePlan({ ...request, provider });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const status = data.auto_approve ? "approved" : "draft";
    const { data: row, error } = await supabaseAdmin.from("provisioning_plans").insert({
      created_by: context.userId,
      customer_id: request.customer_id ?? null,
      request: request as any,
      provider: report.architecture.provider,
      region: report.architecture.region,
      status,
      report: report as any,
      estimated_monthly_usd: report.costs.monthly_usd,
      estimated_hourly_usd: report.costs.hourly_usd,
      estimated_setup_minutes: report.estimated_setup_minutes,
      approved_by: data.auto_approve ? context.userId : null,
      approved_at: data.auto_approve ? new Date().toISOString() : null,
    }).select("*").single();
    if (error) throw error;
    return { plan: row, request, report };
  });
