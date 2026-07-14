import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { HeroPanel, KpiCard, QuickAction, SectionCard } from "./shared";
import {
  GradientAreaChart,
  DonutChart,
  RadialGauge,
  ChartLegend,
  IMT_COLORS,
  IMT_SERIES,
} from "./charts";
import { StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Users, LifeBuoy, KeyRound, Server, Box, DollarSign,
  Plus, FileText, TicketPlus, Building2, ArrowUpRight,
  Cloud, Cpu, Rocket, AlertTriangle, ShieldCheck, Bell, Zap, GitBranch,
} from "lucide-react";

const USD = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

async function load() {
  const [
    customers, tickets, credentials, monitoring, invoices, assets, subs,
    cloudServers, cloudActivity, plans, workflows, incidents, notifications,
  ] = await Promise.all([
    supabase.from("customers").select("id,account_number,company_name,status,created_at,industry").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("tickets").select("id,ticket_number,subject,priority,status,account_number,created_at").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("credentials").select("id,expires_at").is("archived_at", null),
    (supabase.from as any)("monitoring_checks").select("id,status,name,check_type").is("archived_at", null),
    (supabase.from as any)("invoices").select("id,amount_total,status,due_date,issued_at").is("archived_at", null),
    (supabase.from as any)("assets").select("id,status,asset_type").is("archived_at", null),
    (supabase.from as any)("subscriptions").select("id,mrr,status").is("archived_at", null),
    (supabase.from as any)("cloud_servers").select("id,name,provider,status,region,monthly_cost_usd,customer_id,created_at").is("archived_at", null).order("created_at", { ascending: false }),
    (supabase.from as any)("cloud_activity").select("id,action,status,message,created_at,server_id").order("created_at", { ascending: false }).limit(12),
    (supabase.from as any)("provisioning_plans").select("id,provider,region,status,estimated_monthly_usd,created_at,request").order("created_at", { ascending: false }).limit(20),
    (supabase.from as any)("deployment_workflows").select("id,provider,status,current_step,total_steps,created_at").order("created_at", { ascending: false }).limit(10),
    (supabase.from as any)("monitoring_incidents").select("id,severity,summary,status,opened_at").order("opened_at", { ascending: false }).limit(6),
    (supabase.from as any)("notifications").select("id,title,body,link,created_at,read_at").order("created_at", { ascending: false }).limit(8),
  ]);

  const c = customers.data ?? [];
  const t = tickets.data ?? [];
  const cr = credentials.data ?? [];
  const m = (monitoring.data ?? []) as any[];
  const inv = (invoices.data ?? []) as any[];
  const s = (subs.data ?? []) as any[];
  const servers = (cloudServers.data ?? []) as any[];
  const acts = (cloudActivity.data ?? []) as any[];
  const pl = (plans.data ?? []) as any[];
  const wf = (workflows.data ?? []) as any[];
  const inc = (incidents.data ?? []) as any[];
  const notifs = (notifications.data ?? []) as any[];

  const open = t.filter((x: any) => x.status !== "resolved" && x.status !== "closed");
  const soon = new Date(); soon.setDate(soon.getDate() + 30);
  const mrr = s.filter((x) => x.status === "active").reduce((sum, x) => sum + Number(x.mrr || 0), 0);
  const unpaid = inv.filter((x) => x.status !== "paid").reduce((sum, x) => sum + Number(x.amount_total || 0), 0);
  const down = m.filter((x) => x.status === "down").length;

  // Cloud aggregates
  const providerCounts = servers.reduce<Record<string, number>>((acc, x) => {
    acc[x.provider ?? "unknown"] = (acc[x.provider ?? "unknown"] ?? 0) + 1;
    return acc;
  }, {});
  const cloudSpend = servers.reduce((sum, x) => sum + Number(x.monthly_cost_usd || 0), 0);
  const runningServers = servers.filter((x) => x.status === "running" || x.status === "active").length;

  // Revenue trend (last 6 months from invoices.issued_at when paid)
  const trend: { label: string; value: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const total = inv
      .filter((x) => x.status === "paid" && x.issued_at && new Date(x.issued_at) >= d && new Date(x.issued_at) < end)
      .reduce((sum, x) => sum + Number(x.amount_total || 0), 0);
    trend.push({ label: d.toLocaleDateString("en", { month: "short" }), value: total });
  }
  const trendMax = Math.max(1, ...trend.map((x) => x.value));

  return {
    customerCount: c.length,
    openTickets: open.length,
    credentialCount: cr.length,
    expiringSoon: cr.filter((x: any) => x.expires_at && new Date(x.expires_at) < soon).length,
    assetCount: (assets.data ?? []).length,
    monitorsDown: down,
    monitorsTotal: m.length,
    mrr, unpaid,
    recentCustomers: c.slice(0, 5),
    recentTickets: open.slice(0, 6),
    servers, providerCounts, cloudSpend, runningServers,
    activity: acts,
    plans: pl,
    pendingPlans: pl.filter((p) => p.status === "draft" || p.status === "pending_approval"),
    workflows: wf,
    activeWorkflows: wf.filter((w) => w.status === "running" || w.status === "pending"),
    incidents: inc,
    openIncidents: inc.filter((x) => x.status !== "resolved" && x.status !== "closed"),
    notifications: notifs,
    unread: notifs.filter((n) => !n.read_at).length,
    trend, trendMax,
  };
}

export function ExecutiveDashboard({ displayName }: { displayName: string }) {
  const { data: s } = useQuery({ queryKey: ["dash-exec"], queryFn: load });

  return (
    <>
      <HeroPanel
        eyebrow={new Date().toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" })}
        title={`Command Center · ${displayName}`}
        subtitle={
          <>
            Everything you run — customers, cloud, revenue, uptime — at a glance.
            <span className="text-solar font-semibold"> {s?.customerCount ?? 0}</span> customers ·
            <span className="text-solar font-semibold"> {s?.servers?.length ?? 0}</span> servers ·
            <span className="text-solar font-semibold"> {USD(s?.mrr ?? 0)}</span> MRR
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" className="bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground">
              <Link to="/cloud-ops">Cloud Ops</Link>
            </Button>
            <Button asChild className="text-solar-foreground border-0" style={{ background: "var(--gradient-solar)" }}>
              <Link to="/cloud-ops/new"><Rocket className="h-4 w-4 mr-1.5" />Provision</Link>
            </Button>
          </>
        }
      />

      {/* Business KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard label="Customers" value={s?.customerCount ?? 0} icon={Users} tone="info" to="/customers" />
        <KpiCard label="Open Tickets" value={s?.openTickets ?? 0} icon={LifeBuoy} tone="solar" to="/tickets" />
        <KpiCard label="MRR" value={USD(s?.mrr ?? 0)} icon={DollarSign} tone="success" to="/subscriptions" />
        <KpiCard label="Unpaid AR" value={USD(s?.unpaid ?? 0)} icon={FileText} tone="warning" to="/billing" />
        <KpiCard label="Monitors" value={`${(s?.monitorsTotal ?? 0) - (s?.monitorsDown ?? 0)}/${s?.monitorsTotal ?? 0}`} icon={Server} tone={(s?.monitorsDown ?? 0) > 0 ? "danger" : "success"} to="/monitoring" hint={(s?.monitorsDown ?? 0) > 0 ? `${s?.monitorsDown} down` : "All green"} />
        <KpiCard label="Assets" value={s?.assetCount ?? 0} icon={Box} tone="info" to="/assets" />
      </div>

      {/* Cloud infra KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Cloud Servers" value={s?.servers?.length ?? 0} icon={Cloud} tone="info" to="/cloud-ops" hint={`${s?.runningServers ?? 0} running`} />
        <KpiCard label="Cloud Spend / mo" value={USD(s?.cloudSpend ?? 0)} icon={DollarSign} tone="solar" to="/cloud-ops" />
        <KpiCard label="Active Workflows" value={s?.activeWorkflows?.length ?? 0} icon={Zap} tone="warning" to="/cloud-ops" hint={`${s?.workflows?.length ?? 0} total`} />
        <KpiCard label="Plans Pending" value={s?.pendingPlans?.length ?? 0} icon={ShieldCheck} tone="info" to="/cloud-ops" hint="Awaiting approval" />
      </div>

      <SectionCard title="Quick actions" description="Kick off the most common workflows">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <QuickAction icon={Rocket} label="Provision Server" to="/cloud-ops/new" tone="solar" />
          <QuickAction icon={Plus} label="New Customer" to="/customers" />
          <QuickAction icon={TicketPlus} label="Open Ticket" to="/tickets" tone="info" />
          <QuickAction icon={FileText} label="Draft Quote" to="/quotes" tone="warning" />
          <QuickAction icon={DollarSign} label="Log Payment" to="/payments" tone="success" />
          <QuickAction icon={KeyRound} label="Vault Entry" to="/credentials" />
          <QuickAction icon={Building2} label="Add Asset" to="/assets" tone="info" />
          <QuickAction icon={Server} label="Monitoring" to="/monitoring" tone="success" />
        </div>
      </SectionCard>

      {/* Revenue trend + Provider spread */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard className="xl:col-span-2" title="Revenue trend" description="Paid invoices, last 6 months (USD)">
          <div className="flex items-end gap-3 h-40 pt-2">
            {(s?.trend ?? []).map((b) => (
              <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-t-md"
                    style={{
                      height: `${Math.max(4, (b.value / (s?.trendMax || 1)) * 100)}%`,
                      background: "var(--gradient-solar)",
                    }}
                    title={USD(b.value)}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground font-medium">{b.label}</div>
                <div className="text-[11px] font-semibold tabular-nums">{USD(b.value)}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Cloud provider spread" description="Servers by provider">
          <div className="space-y-3">
            {Object.entries(s?.providerCounts ?? {}).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No cloud servers yet</p>
            )}
            {Object.entries(s?.providerCounts ?? {}).map(([prov, count]) => {
              const pct = Math.round(((count as number) / (s?.servers?.length || 1)) * 100);
              return (
                <div key={prov}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium capitalize">{prov}</span>
                    <span className="text-muted-foreground tabular-nums">{count as number} · {pct}%</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Provisioning plans + Workflows */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionCard
          title="Provisioning plans"
          description="Awaiting engineer approval"
          action={<Button variant="ghost" size="sm" asChild><Link to="/cloud-ops">All <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></Button>}
        >
          <div className="space-y-2">
            {(s?.pendingPlans ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No pending plans</p>}
            {(s?.pendingPlans ?? []).slice(0, 6).map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className="h-9 w-9 rounded-lg bg-info/15 text-info flex items-center justify-center">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {(p.request as any)?.name ?? "Untitled"} · <span className="text-muted-foreground capitalize">{p.provider}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{p.region} · {USD(Number(p.estimated_monthly_usd || 0))}/mo</p>
                </div>
                <StatusPill tone="warning">{p.status}</StatusPill>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Active workflows"
          description="Live deployment progress"
          action={<Button variant="ghost" size="sm" asChild><Link to="/cloud-ops">Console <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></Button>}
        >
          <div className="space-y-3">
            {(s?.activeWorkflows ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No workflows running</p>}
            {(s?.activeWorkflows ?? []).slice(0, 6).map((w: any) => {
              const pct = w.total_steps ? Math.round((w.current_step / w.total_steps) * 100) : 0;
              return (
                <div key={w.id} className="p-3 rounded-lg border border-border">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-mono text-xs truncate">{w.id.slice(0, 8)} · <span className="capitalize">{w.provider}</span></span>
                    <StatusPill tone={w.status === "running" ? "info" : "warning"}>{w.status}</StatusPill>
                  </div>
                  <Progress value={pct} className="h-2" />
                  <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                    Step {w.current_step ?? 0}/{w.total_steps ?? 20}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Incidents + Activity + Notifications */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard title="Open incidents" description="Monitoring alerts requiring attention">
          <div className="space-y-2">
            {(s?.openIncidents ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No open incidents</p>}
            {(s?.openIncidents ?? []).map((i: any) => (
              <div key={i.id} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                <AlertTriangle className={`h-4 w-4 mt-0.5 ${i.severity === "critical" ? "text-destructive" : "text-warning"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{i.summary}</p>
                  <p className="text-xs text-muted-foreground">{new Date(i.opened_at).toLocaleString()}</p>
                </div>
                <StatusPill tone={i.severity === "critical" ? "danger" : "warning"}>{i.severity}</StatusPill>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Cloud activity" description="Latest agent events">
          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {(s?.activity ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>}
            {(s?.activity ?? []).map((a: any) => (
              <div key={a.id} className="flex items-start gap-2 text-xs">
                <GitBranch className={`h-3.5 w-3.5 mt-0.5 ${a.status === "success" ? "text-success" : a.status === "error" ? "text-destructive" : "text-info"}`} />
                <div className="flex-1 min-w-0">
                  <p className="truncate"><span className="font-semibold">{a.action}</span> · {a.message}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Notifications" description={`${s?.unread ?? 0} unread`}>
          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {(s?.notifications ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nothing here</p>}
            {(s?.notifications ?? []).map((n: any) => (
              <div key={n.id} className={`flex items-start gap-2 p-2 rounded-lg ${!n.read_at ? "bg-solar/5 border border-solar/20" : "border border-border"}`}>
                <Bell className="h-3.5 w-3.5 mt-1 text-solar" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{n.title}</p>
                  {n.body && <p className="text-[11px] text-muted-foreground truncate">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Tickets + customers */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard
          className="xl:col-span-2"
          title="Open tickets"
          description="Latest unresolved requests"
          action={<Button variant="ghost" size="sm" asChild><Link to="/tickets">Open desk <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></Button>}
        >
          <div className="space-y-2">
            {(s?.recentTickets ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">All caught up ✨</p>}
            {(s?.recentTickets ?? []).map((t: any) => (
              <Link key={t.id} to="/tickets/$id" params={{ id: t.id }} className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                <div className="h-10 w-10 rounded-lg bg-navy/10 text-navy flex items-center justify-center font-semibold text-xs">{t.ticket_number}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{t.subject}</p>
                  <p className="text-xs text-muted-foreground">{t.account_number} · {new Date(t.created_at).toLocaleDateString()}</p>
                </div>
                <StatusPill tone={t.priority === "critical" ? "danger" : t.priority === "high" ? "warning" : "info"}>{t.priority}</StatusPill>
                <StatusPill tone="neutral">{t.status}</StatusPill>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Recent customers"
          action={<Button variant="ghost" size="sm" asChild><Link to="/customers">All →</Link></Button>}
        >
          <div className="space-y-2">
            {(s?.recentCustomers ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No customers yet</p>}
            {(s?.recentCustomers ?? []).map((c: any) => (
              <Link key={c.id} to="/customers/$accountNumber" params={{ accountNumber: c.account_number }} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="h-8 w-8 rounded-md bg-solar/15 text-solar flex items-center justify-center font-semibold text-[10px]">{c.account_number}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.company_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.industry || "—"}</p>
                </div>
                <StatusPill tone={c.status === "active" ? "success" : "neutral"}>{c.status}</StatusPill>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Fleet snapshot */}
      <SectionCard
        title="Cloud fleet"
        description="All provisioned servers across providers"
        action={<Button variant="ghost" size="sm" asChild><Link to="/cloud-ops">Manage <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></Button>}
      >
        {(s?.servers ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No servers provisioned yet</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(s?.servers ?? []).slice(0, 9).map((sv: any) => (
              <Link key={sv.id} to="/cloud-ops/$id" params={{ id: sv.id }} className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition">
                <div className="h-10 w-10 rounded-lg bg-navy/10 text-navy flex items-center justify-center">
                  <Cpu className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{sv.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{sv.provider} · {sv.region}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">{USD(Number(sv.monthly_cost_usd || 0))}/mo</p>
                </div>
                <StatusPill tone={sv.status === "running" || sv.status === "active" ? "success" : sv.status === "error" ? "danger" : "neutral"}>{sv.status}</StatusPill>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}

export { load as loadExecStats };
