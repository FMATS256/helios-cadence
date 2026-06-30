import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContainer, StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowUpRight, TrendingUp, Users2, Briefcase, Wrench, DollarSign, Plus, PlayCircle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — RoyEno Solartech CRM" },
      { name: "description", content: "Operations overview for RoyEno Solartech: leads, pipeline, installations, revenue." },
    ],
  }),
  component: Dashboard,
});

type DashStats = {
  leadsCount: number; clientsCount: number; pipelineValue: number; openInstalls: number;
  revenueMtd: number; openTasks: number;
  pipelineByStage: { stage: string; value: number }[];
  recentInstalls: any[]; recentTasks: any[];
  revenueSeries: { month: string; revenue: number }[];
};

async function loadStats(): Promise<DashStats> {
  const [leads, clients, installs, tasks, payments] = await Promise.all([
    supabase.from("leads").select("stage,value"),
    supabase.from("clients").select("id"),
    supabase.from("installations").select("id,client_name,system,city,crew_lead,scheduled_date,status,progress").order("scheduled_date", { ascending: true, nullsFirst: false }),
    supabase.from("tasks").select("id,title,due_date,priority,done").order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("payments").select("amount,paid_on"),
  ]);
  const leadRows = (leads.data ?? []) as { stage: string; value: number }[];
  const taskRows = (tasks.data ?? []) as any[];
  const paymentRows = (payments.data ?? []) as { amount: number; paid_on: string }[];

  const STAGES = ["New", "Qualified", "Proposal", "Negotiation", "Won"];
  const pipelineByStage = STAGES.map((s) => ({ stage: s, value: leadRows.filter(l => l.stage === s).reduce((a, l) => a + Number(l.value || 0), 0) }));
  const pipelineValue = leadRows.filter(l => l.stage !== "Lost").reduce((a, l) => a + Number(l.value || 0), 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const revenueMtd = paymentRows.filter(p => new Date(p.paid_on) >= monthStart).reduce((a, p) => a + Number(p.amount || 0), 0);

  // Revenue last 7 months
  const series: { month: string; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const total = paymentRows.filter(p => { const pd = new Date(p.paid_on); return pd >= d && pd < next; }).reduce((a, p) => a + Number(p.amount || 0), 0);
    series.push({ month: d.toLocaleString("en", { month: "short" }), revenue: total });
  }

  return {
    leadsCount: leadRows.length,
    clientsCount: (clients.data ?? []).length,
    pipelineValue,
    openInstalls: (installs.data ?? []).filter((i: any) => i.status !== "Active" && i.status !== "Cancelled").length,
    revenueMtd,
    openTasks: taskRows.filter(t => !t.done).length,
    pipelineByStage,
    recentInstalls: (installs.data ?? []).slice(0, 4),
    recentTasks: taskRows.filter(t => !t.done).slice(0, 5),
    revenueSeries: series,
  };
}

function fmt(n: number) { return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`; }

function Dashboard() {
  const { data } = useQuery({ queryKey: ["dashboard-stats"], queryFn: loadStats });
  const s = data;
  const kpis = [
    { label: "Leads", value: s?.leadsCount ?? 0, icon: Users2, tone: "solar" as const },
    { label: "Clients", value: s?.clientsCount ?? 0, icon: Briefcase, tone: "info" as const },
    { label: "Pipeline", value: fmt(s?.pipelineValue ?? 0), icon: TrendingUp, tone: "success" as const },
    { label: "Open Installs", value: s?.openInstalls ?? 0, icon: Wrench, tone: "warning" as const },
    { label: "Revenue (MTD)", value: fmt(s?.revenueMtd ?? 0), icon: DollarSign, tone: "solar" as const },
  ];

  return (
    <PageContainer>
      <div className="rounded-3xl p-8 text-navy-foreground relative overflow-hidden" style={{ background: "var(--gradient-navy)" }}>
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-30 blur-3xl" style={{ background: "var(--gradient-solar)" }} />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[3px] text-solar font-semibold mb-3">{new Date().toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" })}</p>
            <h1 className="font-display text-4xl font-bold">Welcome back 👋</h1>
            <p className="text-navy-foreground/70 mt-2 max-w-xl">
              You have <span className="text-solar font-semibold">{s?.openTasks ?? 0}</span> open tasks and <span className="text-solar font-semibold">{fmt(s?.pipelineValue ?? 0)}</span> in active opportunities.
            </p>
          </div>
          <div className="flex gap-3">
            <Button asChild variant="outline" className="bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground">
              <Link to="/getting-started"><PlayCircle className="h-4 w-4 mr-1.5" />Getting started</Link>
            </Button>
            <Button asChild className="text-solar-foreground border-0" style={{ background: "var(--gradient-solar)" }}>
              <Link to="/leads"><Plus className="h-4 w-4 mr-1.5" />Add Lead</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="border-border hover:shadow-[var(--shadow-elegant)] transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{k.label}</p>
                  <p className="font-display text-3xl font-bold text-foreground mt-2">{k.value}</p>
                </div>
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${k.tone === "solar" ? "bg-solar/15 text-solar" : k.tone === "info" ? "bg-info/15 text-info" : k.tone === "success" ? "bg-success/15 text-success" : "bg-warning/20 text-[oklch(0.45_0.13_75)]"}`}>
                  <k.icon className="h-4 w-4" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-xs font-semibold text-muted-foreground">
                <ArrowUpRight className="h-3.5 w-3.5" />Live
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle className="font-display">Revenue trend</CardTitle><p className="text-sm text-muted-foreground mt-1">Payments received, last 7 months</p></div>
            <StatusPill tone="success">Live</StatusPill>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={s?.revenueSeries ?? []}>
                <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.72 0.18 48)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="oklch(0.72 0.18 48)" stopOpacity={0} />
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 255)" />
                <XAxis dataKey="month" stroke="oklch(0.5 0.03 260)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.5 0.03 260)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid oklch(0.92 0.01 255)" }} />
                <Area type="monotone" dataKey="revenue" stroke="oklch(0.72 0.18 48)" strokeWidth={2.5} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-display">Pipeline value</CardTitle><p className="text-sm text-muted-foreground mt-1">By stage</p></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={s?.pipelineByStage ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 255)" />
                <XAxis dataKey="stage" stroke="oklch(0.5 0.03 260)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.5 0.03 260)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid oklch(0.92 0.01 255)" }} />
                <Bar dataKey="value" fill="oklch(0.22 0.09 265)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle className="font-display">Active installations</CardTitle><p className="text-sm text-muted-foreground mt-1">Field operations status</p></div>
            <Button variant="ghost" asChild><Link to="/installations">Open →</Link></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {(s?.recentInstalls ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No installations scheduled yet. <Link to="/installations" className="text-solar font-semibold">Schedule one →</Link></p>}
            {(s?.recentInstalls ?? []).map((i: any) => (
              <div key={i.id} className="flex items-center gap-4 p-3 rounded-lg border border-border">
                <div className="h-10 w-10 rounded-lg bg-navy/10 text-navy flex items-center justify-center font-semibold text-xs">{(i.client_name ?? "—").slice(0,2).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{i.client_name}</p>
                  <p className="text-xs text-muted-foreground">{i.system} {i.city ? `· ${i.city}` : ""}{i.crew_lead ? ` · Lead: ${i.crew_lead}` : ""}</p>
                </div>
                <div className="hidden md:flex flex-col items-end w-48">
                  <span className="text-xs text-muted-foreground mb-1">{i.progress}% · {i.scheduled_date ?? "TBD"}</span>
                  <Progress value={i.progress} className="h-1.5 w-full" />
                </div>
                <StatusPill tone={i.status === "Active" ? "success" : i.status === "Commissioning" ? "solar" : "info"}>{i.status}</StatusPill>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display">My tasks</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link to="/tasks">All →</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {(s?.recentTasks ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No open tasks. <Link to="/tasks" className="text-solar font-semibold">Add one →</Link></p>}
            {(s?.recentTasks ?? []).map((t: any) => (
              <div key={t.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="h-4 w-4 mt-0.5 rounded border-2 border-solar flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.due_date ?? "No date"}</p>
                </div>
                <StatusPill tone={t.priority === "High" ? "danger" : "neutral"}>{t.priority}</StatusPill>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
