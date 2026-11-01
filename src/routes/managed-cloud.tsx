import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Server, HardDrive, ShieldCheck, AppWindow, PhoneCall, Activity, Package, ArrowRight, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/managed-cloud")({
  head: () => ({
    meta: [
      { title: "IMT Managed Cloud — Divisions & Packages" },
      { name: "description", content: "One place for IMT cloud servers, storage, security, business apps, voice and managed IT operations." },
      { property: "og:title", content: "IMT Managed Cloud" },
      { property: "og:description", content: "Enterprise infrastructure. Simplified management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagedCloudPage,
});

type Division = {
  key: string; title: string; icon: typeof Server; items: string[];
  links: { label: string; to: string }[]; workloads: string[];
};

const DIVISIONS: Division[] = [
  { key: "infra", title: "Cloud Infrastructure", icon: Server,
    items: ["Managed VPS & cloud servers", "Windows & Linux hosting", "Business application hosting", "Database & DR servers"],
    links: [{ label: "Cloud & VPS Ops", to: "/cloud-ops" }, { label: "Order server", to: "/cloud-ops/new" }],
    workloads: ["accounting", "pastel", "evol", "qbd", "pall", "odoo", "rds", "web"] },
  { key: "storage", title: "Cloud Storage", icon: HardDrive,
    items: ["S3 object storage (500 GB steps)", "Business file storage", "Offsite backups", "Document archiving"],
    links: [{ label: "Storage & NAS", to: "/cloud-storage" }],
    workloads: ["bkp", "nc"] },
  { key: "security", title: "Managed Security", icon: ShieldCheck,
    items: ["WireGuard business VPN", "Firewall port management", "Server hardening", "Patch management"],
    links: [{ label: "Fleet Control & firewalls", to: "/noc?tab=servers" }, { label: "Credential Vault", to: "/techops/vault" }],
    workloads: [] },
  { key: "apps", title: "Business Applications", icon: AppWindow,
    items: ["Nextcloud", "Accounting & ERP hosting", "Document management", "Clinic systems (after compliance review)"],
    links: [{ label: "Industry packages", to: "/catalog" }],
    workloads: ["clinic", "legal", "acctfirm", "nc"] },
  { key: "voice", title: "Communications", icon: PhoneCall,
    items: ["Hosted 3CX / FreePBX", "Business VoIP & IVR", "Call recording", "Multi-branch voice"],
    links: [{ label: "VoIP", to: "/voip" }],
    workloads: ["voip"] },
  { key: "ops", title: "Managed IT Operations", icon: Activity,
    items: ["Monitoring & down alerts", "Server administration", "Managed backups", "Support & SLA tracking"],
    links: [{ label: "NOC Command", to: "/noc" }, { label: "Field TechOps", to: "/techops/dashboard" }],
    workloads: ["mail", "vms"] },
];

const READINESS = [
  { area: "Healthcare", note: "Needs encryption, access auditing, retention policies, tested recovery and proper medical-imaging workflows before selling." },
  { area: "Legal", note: "Enforce encryption, MFA and per-user document permissions." },
  { area: "Accounting", note: "Confirm Sage/SQL licensing and measure latency from the client's office before promising speed." },
  { area: "Windows remote desktop", note: "Never open RDP to the internet — only behind WireGuard VPN with MFA." },
  { area: "Backups", note: "Storage alone isn't a backup: use retention, snapshots and regular restore tests." },
  { area: "Compliance", note: "Check Zimbabwe data protection rules; most storage locations are outside Zimbabwe." },
];

function ManagedCloudPage() {
  const packages = useQuery({
    queryKey: ["managed-cloud-packages"],
    queryFn: async () => (await supabase.from("service_catalog")
      .select("code,name,tier,workload,unit_price")
      .not("tier", "is", null).eq("is_active", true).order("unit_price")).data ?? [],
  });
  const servers = useQuery({
    queryKey: ["managed-cloud-servers"],
    queryFn: async () => {
      const { data } = await supabase.from("cloud_servers" as any).select("status").is("archived_at", null);
      return (data ?? []) as any[];
    },
  });

  const pkgs = (packages.data ?? []) as any[];
  const srv = servers.data ?? [];
  const running = srv.filter((s) => ["active", "running"].includes(String(s.status).toLowerCase())).length;

  return (
    <PageContainer>
      <PageHeader eyebrow="Powering business infrastructure" title="IMT Managed Cloud"
        description="Enterprise infrastructure. Simplified management. Every service is a ready-made product."
        actions={<Button asChild><Link to="/cloud-ops/new">New managed service</Link></Button>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Packages on sale", pkgs.length], ["Servers", srv.length], ["Running", running], ["Divisions", DIVISIONS.length]].map(([l, v]) => (
          <Card key={l as string} className="rounded-none"><CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{l}</p>
            <p className="text-2xl font-semibold mt-1">{v as number}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {DIVISIONS.map((d) => {
          const dp = pkgs.filter((p) => d.workloads.includes(p.workload));
          const Icon = d.icon;
          return (
            <Card key={d.key} className="rounded-none flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-5 w-5 text-primary" />{d.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3">
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  {d.items.map((i) => <li key={i}>{i}</li>)}
                </ul>
                {dp.length > 0 && (
                  <div className="text-xs space-y-1 border-t border-border pt-2">
                    {dp.slice(0, 4).map((p) => (
                      <div key={p.code} className="flex justify-between gap-2">
                        <span className="truncate">{p.name}</span>
                        <span className="font-medium">${Number(p.unit_price).toFixed(2)}/mo</span>
                      </div>
                    ))}
                    {dp.length > 4 && <p className="text-muted-foreground">+{dp.length - 4} more</p>}
                  </div>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  {d.links.map((l) => (
                    <Button key={l.to} asChild size="sm" variant="outline">
                      <Link to={l.to as any}>{l.label}<ArrowRight className="h-3 w-3 ml-1" /></Link>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-none">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Package className="h-5 w-5 text-primary" />Industry packages</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {pkgs.length === 0 ? <p className="text-sm text-muted-foreground">No packages yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="py-2">Package</th><th>Tier</th><th>Workload</th><th className="text-right">Price</th></tr></thead>
              <tbody>{pkgs.map((p) => (
                <tr key={p.code} className="border-t border-border">
                  <td className="py-2">{p.name}</td><td>{p.tier}</td><td>{p.workload ?? "—"}</td>
                  <td className="text-right">${Number(p.unit_price).toFixed(2)}/mo</td>
                </tr>))}</tbody>
            </table>)}
        </CardContent>
      </Card>

      <Card className="rounded-none">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5 text-solar" />Before selling — readiness checks</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {READINESS.map((r) => (
            <div key={r.area} className="border border-border p-3">
              <StatusPill tone="warning">{r.area}</StatusPill>
              <p className="text-sm mt-2 text-muted-foreground">{r.note}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
