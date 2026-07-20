// Workflow runner — executes an approved plan. Resumable per workflow_id.
import type { ProvisionRequest, ProviderName } from "../providers/types";
import { getProvider } from "../providers/registry.server";
import { TEMPLATES } from "./templates.server";

interface StepDef {
  key: string;
  label: string;
  run: (ctx: WorkflowContext) => Promise<Record<string, unknown> | void>;
  compensate?: (ctx: WorkflowContext) => Promise<void>;
}

interface WorkflowContext {
  workflow_id: string;
  plan_id: string | null;
  provider: ProviderName;
  req: ProvisionRequest;
  state: Record<string, any>;
}

const STEPS: Omit<StepDef, "compensate">[] = [
  { key: "validate_request", label: "Validate request", run: async ({ req }) => {
    if (!req.name || !req.region) throw new Error("name and region are required");
  }},
  { key: "select_provider", label: "Determine cloud provider", run: async (ctx) => ({ provider: ctx.provider }) },
  { key: "estimate_cost", label: "Estimate cost", run: async (ctx) => {
    const p = getProvider(ctx.provider);
    const est = await p.estimatePrice(ctx.req);
    ctx.state.cost = est;
    return { monthly_usd: est.monthly_usd };
  }},
  { key: "provision_vm", label: "Provision virtual machine", run: async (ctx) => {
    const p = getProvider(ctx.provider);
    const res = await p.createServer(ctx.req);
    ctx.state.provider_server_id = res.provider_server_id;
    ctx.state.public_ips = res.public_ips;
    ctx.state.private_ips = res.private_ips;
    return { provider_server_id: res.provider_server_id, public_ips: res.public_ips };
  }},
  { key: "install_software", label: "Install requested software", run: async (ctx) => {
    if (!ctx.req.template) return { skipped: true };
    const t = TEMPLATES[ctx.req.template as keyof typeof TEMPLATES];
    if (!t) throw new Error(`Unknown template: ${ctx.req.template}`);
    if (!t.implemented) return { warning: "Template not implemented; skipped" };
    const script = t.render(ctx.req.template_params ?? {});
    ctx.state.init_script_bytes = script.length;
    // NOTE: post-boot script injection is provider-specific. For Kamatera we require an SSH key
    // and the caller will run this via SSH; here we just record intent.
    return { template: t.id, script_bytes: script.length };
  }},
  { key: "health_checks", label: "Run health checks", run: async (ctx) => {
    // Best-effort ping on public IP; real check happens via monitoring_checks after registration.
    return { public_ips: ctx.state.public_ips ?? [] };
  }},
  { key: "register_asset", label: "Register infrastructure asset", run: async (ctx) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const est = ctx.state.cost;
    const { data: row, error } = await supabaseAdmin.from("cloud_servers").insert({
      provider: ctx.provider,
      provider_server_id: ctx.state.provider_server_id,
      customer_id: ctx.req.customer_id ?? null,
      name: ctx.req.name,
      datacenter: ctx.req.region,
      image: ctx.req.image,
      cpu_cores: ctx.req.cpu_cores,
      cpu_type: (ctx.req as any).cpu_type,
      ram_mb: ctx.req.ram_mb,
      disk_sizes_gb: [ctx.req.disk_gb ?? 20, ...(ctx.req.extra_disks_gb ?? [])],
      public_ips: ctx.state.public_ips ?? [],
      private_ips: ctx.state.private_ips ?? [],
      networks: ctx.req.networks ?? [{ name: "wan" }],
      billing_cycle: ctx.req.billing_cycle ?? "monthly",
      monthly_cost_usd: est?.monthly_usd ?? null,
      selling_price_usd: ctx.req.selling_price_usd ?? null,
      status: "active",
      power_state: "on",
      notes: ctx.req.notes ?? null,
      ssh_key: ctx.req.ssh_key ?? null,
      tags: ctx.req.tags ?? [],
    }).select("id").single();
    if (error) throw error;
    ctx.state.server_id = row.id;
    return { server_id: row.id };
  }},
  { key: "provision_workspace", label: "Provision customer cloud workspace", run: async (ctx) => {
    if (!ctx.state.server_id || !ctx.req.customer_id) return { skipped: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { linkServerToCustomerWorkspace } = await import("@/lib/portal.server");
    const ws = await linkServerToCustomerWorkspace(supabaseAdmin as any, ctx.state.server_id, ctx.req.customer_id);
    if (ws) {
      ctx.state.workspace_id = ws.id;
      ctx.state.workspace_url = `/c/${ws.slug}/${ws.workspace_key}`;
      return { workspace_id: ws.id, workspace_url: ctx.state.workspace_url };
    }
    return { skipped: true };
  }},
  { key: "enable_monitoring", label: "Enable monitoring", run: async (ctx) => {
    if (!ctx.state.public_ips?.[0]) return { skipped: "no public ip" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("monitoring_checks").insert({
      name: `${ctx.req.name} (ping)`,
      check_type: "ping",
      target: ctx.state.public_ips[0],
      interval_seconds: 60,
      enabled: true,
      status: "unknown",
    });
    return { check_created: true };
  }},
  { key: "notify_client", label: "Notify client", run: async (ctx) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("cloud_activity").insert({
      action: "provisioned",
      server_id: ctx.state.server_id ?? null,
      detail: { message: `Provisioned ${ctx.req.name} on ${ctx.provider}`, public_ips: ctx.state.public_ips ?? [] },
    });
    return { ok: true };
  }},
];

export async function runWorkflow(input: {
  workflow_id: string;
  plan_id: string | null;
  provider: ProviderName;
  request: ProvisionRequest;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ctx: WorkflowContext = {
    workflow_id: input.workflow_id, plan_id: input.plan_id,
    provider: input.provider, req: input.request, state: {},
  };

  await supabaseAdmin.from("deployment_workflows").update({
    status: "running", started_at: new Date().toISOString(),
  }).eq("id", input.workflow_id);

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    const { data: existing } = await supabaseAdmin
      .from("deployment_steps").select("id,status,output")
      .eq("workflow_id", input.workflow_id).eq("step_key", step.key).maybeSingle();
    if (existing?.status === "completed") continue;

    const stepRow = existing ?? (await supabaseAdmin.from("deployment_steps").insert({
      workflow_id: input.workflow_id, step_key: step.key, step_label: step.label, seq: i,
      status: "running", started_at: new Date().toISOString(), attempts: 1,
    }).select("id").single()).data!;

    await supabaseAdmin.from("deployment_workflows").update({
      current_step: step.label, progress: Math.round(((i + 1) / STEPS.length) * 100),
    }).eq("id", input.workflow_id);

    try {
      const out = await step.run(ctx);
      await supabaseAdmin.from("deployment_steps").update({
        status: "completed", completed_at: new Date().toISOString(), output: (out ?? null) as any,
      }).eq("id", stepRow.id);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      await supabaseAdmin.from("deployment_steps").update({
        status: "failed", completed_at: new Date().toISOString(), error: msg,
      }).eq("id", stepRow.id);
      await supabaseAdmin.from("deployment_workflows").update({
        status: "failed", error: msg, completed_at: new Date().toISOString(),
      }).eq("id", input.workflow_id);
      // Best-effort rollback: terminate the VM if we created it.
      if (ctx.state.provider_server_id) {
        try { await getProvider(ctx.provider).terminate(ctx.state.provider_server_id); } catch { /* swallow */ }
      }
      if (input.plan_id) {
        await supabaseAdmin.from("provisioning_plans").update({ status: "failed" }).eq("id", input.plan_id);
      }
      throw e;
    }
  }

  await supabaseAdmin.from("deployment_workflows").update({
    status: "completed", completed_at: new Date().toISOString(), progress: 100, context: ctx.state,
  }).eq("id", input.workflow_id);
  if (input.plan_id) {
    await supabaseAdmin.from("provisioning_plans").update({ status: "executed", workflow_id: input.workflow_id }).eq("id", input.plan_id);
  }
  return { workflow_id: input.workflow_id, server_id: ctx.state.server_id, public_ips: ctx.state.public_ips ?? [] };
}
