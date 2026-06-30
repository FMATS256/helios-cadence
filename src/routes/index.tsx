import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContainer, StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Users, KeyRound, LifeBuoy, Activity, Plus, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — IMT Operations Platform" },
      { name: "description", content: "Operations overview: customers, tickets, credentials, system health." },
    ],
  }),
  component: Dashboard,
});

type Stats = {
  customerCount: number;
  openTickets: number;
  criticalTickets: number;
  credentialCount: number;
  expiringSoon: number;
  recentCustomers: any[];
  recentTickets: any[];
};

async function loadStats(): Promise<Stats> {
  const [customers, tickets, credentials] = await Promise.all([
    supabase.from("customers").select("id,account_number,company_name,status,created_at,industry").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("tickets").select("id,ticket_number,subject,priority,status,account_number,created_at").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("credentials").select("id,expires_at").is("archived_at", null),
  ]);
  const c = customers.data ?? [];
  const t = tickets.data ?? [];
  const cr = credentials.data ?? [];
  const open = t.filter((x: any) => x.status !== "resolved" && x.status !== "closed");
  const soon = new Date(); soon.setDate(soon.getDate() + 30);
  return {
    customerCount: c.length,
    openTickets: open.length,
    criticalTickets: open.filter((x: any) => x.priority === "critical" || x.priority === "high").length,
    credentialCount: cr.length,
    expiringSoon: cr.filter((x: any) => x.expires_at && new Date(x.expires_at) < soon).length,
    recentCustomers: c.slice(0, 5),
    recentTickets: open.slice(0, 6),
  };
}

function Dashboard() {
  const { data } = useQuery({ queryKey: ["imt-dashboard"], queryFn: loadStats });
  const s = data;
  const kpis = [
    { label: "Customers", value: s?.customerCount ?? 0, icon: Users, tone: "info" as const },
    { label: "Open Tickets", value: s?.openTickets ?? 0, icon: LifeBuoy, tone: "solar" as const },
    { label: "Critical / High", value: s?.criticalTickets ?? 0, icon: Activity, tone: "warning" as const },
    { label: "Credentials", value: s?.credentialCount ?? 0, icon: KeyRound, tone: "success" as const },
    { label: "Expiring soon", value: s?.expiringSoon ?? 0, icon: Shield, tone: "warning" as const },
  ];

  return (
    <PageContainer>
      <div className="rounded-3xl p-8 text-navy-foreground relative overflow-hidden" style={{ background: "var(--gradient-navy)" }}>
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-30 blur-3xl" style={{ background: "var(--gradient-solar)" }} />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[3px] text-solar font-semibold mb-3">
              {new Date().toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="font-display text-4xl font-bold">IMT Operations Platform</h1>
            <p className="text-navy-foreground/70 mt-2 max-w-xl">
              Your single source of truth for every customer, service, asset, and ticket.
              <span className="text-solar font-semibold"> {s?.customerCount ?? 0}</span> customers ·
              <span className="text-solar font-semibold"> {s?.openTickets ?? 0}</span> open tickets.
            </p>
          </div>
          <div className="flex gap-3">
            <Button asChild variant="outline" className="bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground">
              <Link to="/customers">Browse customers</Link>
            </Button>
            <Button asChild className="text-solar-foreground border-0" style={{ background: "var(--gradient-solar)" }}>
              <Link to="/customers"><Plus className="h-4 w-4 mr-1.5" />Add Customer</Link>
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle className="font-display">Open tickets</CardTitle><p className="text-sm text-muted-foreground mt-1">Latest unresolved support requests</p></div>
            <Button variant="ghost" asChild><Link to="/tickets">Open desk →</Link></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {(s?.recentTickets ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No open tickets. <Link to="/tickets" className="text-solar font-semibold">Create one →</Link></p>}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display">Recent customers</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link to="/customers">All →</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {(s?.recentCustomers ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No customers yet. <Link to="/customers" className="text-solar font-semibold">Add one →</Link></p>}
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
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
