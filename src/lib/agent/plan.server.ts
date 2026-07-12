// Plan generator — produces the dry-run execution report.
import type { ProvisionRequest, ProviderName } from "../providers/types";
import { getProvider, listProviders } from "../providers/registry.server";
import { TEMPLATES } from "./templates.server";

export interface PlanReport {
  architecture: {
    kind: string;
    provider: ProviderName;
    region: string;
    os?: string;
    template?: string;
  };
  resources: { label: string; detail: string }[];
  software: string[];
  costs: {
    monthly_usd: number;
    hourly_usd: number;
    breakdown: { label: string; monthly_usd: number }[];
    currency: "USD";
    licensing_notes: string[];
    operational_notes: string[];
  };
  estimated_setup_minutes: number;
  workflow_steps: { key: string; label: string; estimated_seconds: number }[];
  dry_run_actions: { step: string; api_call: string; payload_summary: string }[];
  risks: { severity: "low" | "medium" | "high"; description: string }[];
  dependencies: string[];
  security: string[];
  recommendations: string[];
}

const WORKFLOW: { key: string; label: string; estimated_seconds: number }[] = [
  { key: "validate_request", label: "Validate request", estimated_seconds: 1 },
  { key: "validate_permissions", label: "Validate user permissions", estimated_seconds: 1 },
  { key: "select_provider", label: "Determine cloud provider", estimated_seconds: 1 },
  { key: "select_region", label: "Determine best region", estimated_seconds: 2 },
  { key: "select_instance", label: "Choose optimal instance type", estimated_seconds: 2 },
  { key: "estimate_cost", label: "Estimate cost", estimated_seconds: 1 },
  { key: "create_network", label: "Create networking", estimated_seconds: 5 },
  { key: "create_firewall", label: "Create firewall rules", estimated_seconds: 5 },
  { key: "allocate_storage", label: "Allocate storage", estimated_seconds: 5 },
  { key: "provision_vm", label: "Provision virtual machine", estimated_seconds: 120 },
  { key: "assign_ip", label: "Assign public IP", estimated_seconds: 5 },
  { key: "deploy_os", label: "Deploy operating system", estimated_seconds: 60 },
  { key: "init_scripts", label: "Run initialization scripts", estimated_seconds: 30 },
  { key: "install_software", label: "Install requested software", estimated_seconds: 180 },
  { key: "configure_services", label: "Configure services", estimated_seconds: 30 },
  { key: "health_checks", label: "Run health checks", estimated_seconds: 20 },
  { key: "register_asset", label: "Register infrastructure asset", estimated_seconds: 2 },
  { key: "enable_monitoring", label: "Enable monitoring", estimated_seconds: 5 },
  { key: "store_credentials", label: "Securely store credentials", estimated_seconds: 2 },
  { key: "notify_client", label: "Notify client", estimated_seconds: 2 },
];

export async function generatePlan(req: ProvisionRequest & { provider?: ProviderName }): Promise<PlanReport> {
  const providers = listProviders().filter((p) => p.enabled);
  if (providers.length === 0) throw new Error("No cloud providers are configured");

  const template = req.template ? TEMPLATES[req.template as keyof typeof TEMPLATES] : undefined;

  // Provider selection: explicit → first supporting kind → first enabled.
  const providerName: ProviderName =
    req.provider ??
    (providers.find((p) => getProvider(p.name).supports.includes(req.kind))?.name as ProviderName) ??
    providers[0].name;

  const provider = getProvider(providerName);

  // Pull provider price estimate.
  const price = await provider.estimatePrice(req);

  const setupSeconds = WORKFLOW.reduce((s, w) => s + w.estimated_seconds, 0);

  const risks: PlanReport["risks"] = [];
  if (req.cost_cap_monthly_usd && price.monthly_usd > req.cost_cap_monthly_usd) {
    risks.push({
      severity: "high",
      description: `Estimated cost $${price.monthly_usd} exceeds cap $${req.cost_cap_monthly_usd}`,
    });
  }
  if (template && !template.implemented) {
    risks.push({ severity: "high", description: `Template ${template.id} is not yet implemented` });
  }
  if (template && req.cpu_cores !== undefined && req.cpu_cores < template.min_cpu) {
    risks.push({ severity: "medium", description: `CPU (${req.cpu_cores}) below template minimum (${template.min_cpu})` });
  }
  if (template && req.ram_mb !== undefined && req.ram_mb < template.min_ram_mb) {
    risks.push({ severity: "medium", description: `RAM (${req.ram_mb} MB) below template minimum (${template.min_ram_mb} MB)` });
  }
  if (!req.ssh_key && !req.password) {
    risks.push({ severity: "high", description: "No SSH key or root password provided" });
  }

  const security = [
    "Root password stored encrypted in credentials vault",
    "SSH key-based auth enforced when provided",
    "Firewall configured with least-privilege ingress",
    "Provider credentials never exposed to client",
    "Audit log entry written for provisioning and lifecycle operations",
  ];

  const recommendations: string[] = [];
  if (!req.daily_backup) recommendations.push("Enable daily backups for production workloads");
  if (!req.monitoring) recommendations.push("Enable provider monitoring for baseline metrics");
  if (!req.ssh_key) recommendations.push("Provide an SSH key to disable password auth after provisioning");
  if (template?.ports.some((p) => p === 80 || p === 443)) {
    recommendations.push("Issue a Let's Encrypt certificate and force HTTPS after DNS is pointed");
  }

  return {
    architecture: {
      kind: req.kind,
      provider: providerName,
      region: req.region,
      os: req.os,
      template: template?.id,
    },
    resources: [
      { label: "Compute", detail: `${req.cpu_cores ?? 1} vCPU / ${(req.ram_mb ?? 1024) / 1024} GB RAM` },
      { label: "Primary disk", detail: `${req.disk_gb ?? 20} GB SSD` },
      ...(req.extra_disks_gb?.map((g, i) => ({ label: `Additional disk ${i + 1}`, detail: `${g} GB SSD` })) ?? []),
      { label: "Networks", detail: (req.networks ?? [{ name: "wan" }]).map((n) => n.name).join(", ") },
      { label: "OS", detail: req.os ?? req.image ?? "unspecified" },
    ],
    software: template ? [template.label, ...(template.id === "wordpress" ? ["Apache", "MariaDB", "PHP"] : [])] : [],
    costs: {
      monthly_usd: price.monthly_usd,
      hourly_usd: price.hourly_usd,
      breakdown: price.breakdown,
      currency: "USD",
      licensing_notes: template?.id === "3cx" || template?.id === "active-directory"
        ? [`${template.label} requires a valid license (not included)`]
        : [],
      operational_notes: [
        req.daily_backup ? "Daily backup enabled (retention 7 days)" : "No backup enabled",
        req.monitoring ? "Monitoring enabled" : "Monitoring disabled",
      ],
    },
    estimated_setup_minutes: Math.ceil(setupSeconds / 60),
    workflow_steps: WORKFLOW,
    dry_run_actions: [
      { step: "provision_vm", api_call: `${providerName}.createServer`, payload_summary: `name=${req.name} region=${req.region} image=${req.image ?? "-"}` },
      { step: "assign_ip", api_call: `${providerName}.attachPublicIp`, payload_summary: `network=wan` },
      { step: "install_software", api_call: template ? `templates.${template.id}.render()` : "n/a", payload_summary: template ? `params=${JSON.stringify(req.template_params ?? {})}` : "no template" },
      { step: "register_asset", api_call: "supabase.cloud_servers.upsert", payload_summary: `customer=${req.customer_id ?? "-"}` },
      { step: "enable_monitoring", api_call: "supabase.monitoring_checks.insert", payload_summary: `check for public ip` },
    ],
    risks,
    dependencies: [
      "Provider API reachable",
      "Chosen region has capacity",
      req.customer_id ? "Customer record exists" : "No customer linked",
    ],
    security,
    recommendations,
  };
}
