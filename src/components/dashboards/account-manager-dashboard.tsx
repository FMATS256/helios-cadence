import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { HeroPanel, KpiCard, QuickAction, SectionCard } from "./shared";
import { StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Users, Briefcase, FileText, TrendingUp, Plus, ArrowUpRight, Repeat, HandCoins,
} from "lucide-react";

const CYCLE_TO_MONTHLY: Record<string, number> = {
  monthly: 1, quarterly: 1 / 3, semi_annual: 1 / 6, semiannual: 1 / 6,
  annual: 1 / 12, yearly: 1 / 12, weekly: 4.345, daily: 30.44, one_time: 0,
};
const monthlyOf = (s: any) =>
  Number(s.amount || 0) * (CYCLE_TO_MONTHLY[String(s.billing_cycle || "monthly").toLowerCase()] ?? 1);

async function loadAM() {
  const [customers, quotes, projects, subs, tickets] = await Promise.all([
    supabase.from("customers").select("id,account_number,company_name,status,industry,created_at").is("archived_at", null).order("created_at", { ascending: false }),
    (supabase.from as any)("quotes").select("id,quote_number,amount,currency,status,valid_until,account_number,created_at").order("created_at", { ascending: false }),
    (supabase.from as any)("projects").select("id,project_code,name,status,budget,account_number").is("archived_at", null),
    (supabase.from as any)("subscriptions").select("id,amount,billing_cycle,status,next_renewal,account_number,plan_name"),
    supabase.from("tickets").select("id,account_number,status").is("archived_at", null),
  ]);
  const c = customers.data ?? [];
  const q = (quotes.data ?? []) as any[];
  const p = (projects.data ?? []) as any[];
  const s = (subs.data ?? []) as any[];
  const t = tickets.data ?? [];
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  const openTicketsByAcct = new Map<string, number>();
  t.filter((x: any) => x.status !== "resolved" && x.status !== "closed").forEach((x: any) => {
    openTicketsByAcct.set(x.account_number, (openTicketsByAcct.get(x.account_number) || 0) + 1);
  });
  const activeCustomers = c.filter((x: any) => x.status === "active");
  return {
    customers: c,
    activeCount: activeCustomers.length,
    prospectCount: c.filter((x: any) => x.status === "prospect" || x.status === "lead").length,
    openQuotes: q.filter((x) => x.status === "sent"),
    openQuotesValue: q.filter((x) => x.status === "sent").reduce((a, x) => a + Number(x.amount || 0), 0),
    acceptedThisMonth: q.filter((x) => x.status === "accepted" && new Date(x.created_at).getMonth() === new Date().getMonth()).length,
    activeProjects: p.filter((x) => x.status === "active" || x.status === "in_progress"),
    renewalsSoon: s.filter((x) => x.status === "active" && x.next_renewal && new Date(x.next_renewal) < in30),
    mrr: s.filter((x) => x.status === "active").reduce((a, x) => a + monthlyOf(x), 0),

    topAccounts: activeCustomers.slice(0, 6).map((c: any) => ({
      ...c,
      openTickets: openTicketsByAcct.get(c.account_number) || 0,
    })),
    recentQuotes: q.slice(0, 5),
  };
}

export function AccountManagerDashboard({ displayName }: { displayName: string }) {
  const { data: s } = useQuery({ queryKey: ["dash-am"], queryFn: loadAM });
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  return (
    <>
      <HeroPanel
        eyebrow="Account Management"
        title={`Welcome, ${displayName}`}
        accent="info"
        subtitle={
          <>
            <span className="text-solar font-semibold">{s?.activeCount ?? 0}</span> active accounts ·
            <span className="text-solar font-semibold"> {s?.openQuotes?.length ?? 0}</span> open quotes ·
            <span className="text-solar font-semibold"> {s?.renewalsSoon?.length ?? 0}</span> renewals due
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" className="bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground">
              <Link to="/customers">All accounts</Link>
            </Button>
            <Button asChild className="text-solar-foreground border-0" style={{ background: "var(--gradient-solar)" }}>
              <Link to="/quotes"><Plus className="h-4 w-4 mr-1.5" />New Quote</Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard label="Active Accounts" value={s?.activeCount ?? 0} icon={Users} tone="info" to="/customers" />
        <KpiCard label="Prospects" value={s?.prospectCount ?? 0} icon={TrendingUp} tone="solar" to="/customers" />
        <KpiCard label="Open Quotes" value={s?.openQuotes?.length ?? 0} icon={FileText} tone="warning" to="/quotes" hint={money(s?.openQuotesValue ?? 0)} />
        <KpiCard label="Won MTD" value={s?.acceptedThisMonth ?? 0} icon={HandCoins} tone="success" to="/quotes" />
        <KpiCard label="Active Projects" value={s?.activeProjects?.length ?? 0} icon={Briefcase} tone="info" to="/projects" />
        <KpiCard label="Renewals ≤30d" value={s?.renewalsSoon?.length ?? 0} icon={Repeat} tone="warning" to="/subscriptions" />
      </div>

      <SectionCard title="Account manager workflows">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction icon={Plus} label="Add Customer" to="/customers" />
          <QuickAction icon={FileText} label="Draft Quote" to="/quotes" tone="warning" />
          <QuickAction icon={Briefcase} label="Start Project" to="/projects" tone="info" />
          <QuickAction icon={Repeat} label="Renew Subscription" to="/subscriptions" tone="success" />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard
          className="xl:col-span-2"
          title="Top accounts"
          description="Active portfolio at a glance"
          action={<Button variant="ghost" size="sm" asChild><Link to="/customers">All →</Link></Button>}
        >
          <div className="space-y-2">
            {(s?.topAccounts ?? []).map((c: any) => (
              <Link key={c.id} to="/customers/$accountNumber" params={{ accountNumber: c.account_number }} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                <div className="h-9 w-9 rounded-md bg-solar/15 text-solar flex items-center justify-center font-semibold text-[10px]">{c.account_number}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{c.company_name}</p>
                  <p className="text-xs text-muted-foreground">{c.industry || "—"}</p>
                </div>
                {c.openTickets > 0 && <StatusPill tone="warning">{c.openTickets} tickets</StatusPill>}
                <StatusPill tone="success">{c.status}</StatusPill>
              </Link>
            ))}
            {(s?.topAccounts ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No active accounts yet</p>}
          </div>
        </SectionCard>

        <SectionCard title="Recent quotes" action={<Button variant="ghost" size="sm" asChild><Link to="/quotes">All <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></Button>}>
          <div className="space-y-2">
            {(s?.recentQuotes ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No quotes yet</p>}
            {(s?.recentQuotes ?? []).map((q: any) => (
              <div key={q.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className="h-9 w-9 rounded-md bg-warning/15 text-[oklch(0.45_0.13_75)] flex items-center justify-center font-semibold text-[10px]">{q.quote_number}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{money(Number(q.amount || 0))} <span className="text-xs text-muted-foreground">{q.currency}</span></p>
                  <p className="text-xs text-muted-foreground">{q.account_number}</p>
                </div>
                <StatusPill tone={q.status === "accepted" ? "success" : q.status === "sent" ? "info" : "neutral"}>{q.status}</StatusPill>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
