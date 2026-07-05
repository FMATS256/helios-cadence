import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { HeroPanel, KpiCard, QuickAction, SectionCard } from "./shared";
import { StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Users, LifeBuoy, KeyRound, Activity, Server, Box, DollarSign,
  Plus, FileText, TicketPlus, Building2, ArrowUpRight,
} from "lucide-react";

async function load() {
  const [customers, tickets, credentials, monitoring, invoices, assets, subs] = await Promise.all([
    supabase.from("customers").select("id,account_number,company_name,status,created_at,industry").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("tickets").select("id,ticket_number,subject,priority,status,account_number,created_at").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("credentials").select("id,expires_at").is("archived_at", null),
    (supabase.from as any)("monitoring_checks").select("id,status,name,check_type").is("archived_at", null),
    (supabase.from as any)("invoices").select("id,amount_total,status,due_date").is("archived_at", null),
    (supabase.from as any)("assets").select("id,status").is("archived_at", null),
    (supabase.from as any)("subscriptions").select("id,mrr,status").is("archived_at", null),
  ]);
  const c = customers.data ?? [];
  const t = tickets.data ?? [];
  const cr = credentials.data ?? [];
  const m = (monitoring.data ?? []) as any[];
  const inv = (invoices.data ?? []) as any[];
  const s = (subs.data ?? []) as any[];
  const open = t.filter((x: any) => x.status !== "resolved" && x.status !== "closed");
  const soon = new Date(); soon.setDate(soon.getDate() + 30);
  const mrr = s.filter((x) => x.status === "active").reduce((sum, x) => sum + Number(x.mrr || 0), 0);
  const unpaid = inv.filter((x) => x.status !== "paid").reduce((sum, x) => sum + Number(x.amount_total || 0), 0);
  const down = m.filter((x) => x.status === "down").length;
  return {
    customerCount: c.length,
    openTickets: open.length,
    criticalTickets: open.filter((x: any) => x.priority === "critical" || x.priority === "high").length,
    credentialCount: cr.length,
    expiringSoon: cr.filter((x: any) => x.expires_at && new Date(x.expires_at) < soon).length,
    assetCount: (assets.data ?? []).length,
    monitorsDown: down,
    monitorsTotal: m.length,
    mrr,
    unpaid,
    recentCustomers: c.slice(0, 5),
    recentTickets: open.slice(0, 6),
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
            Everything you run — customers, revenue, uptime, credentials — at a glance.
            <span className="text-solar font-semibold"> {s?.customerCount ?? 0}</span> customers ·
            <span className="text-solar font-semibold"> {s?.openTickets ?? 0}</span> open tickets ·
            <span className="text-solar font-semibold"> £{Math.round(s?.mrr ?? 0).toLocaleString()}</span> MRR
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" className="bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground">
              <Link to="/reports">Reports</Link>
            </Button>
            <Button asChild className="text-solar-foreground border-0" style={{ background: "var(--gradient-solar)" }}>
              <Link to="/customers"><Plus className="h-4 w-4 mr-1.5" />New Customer</Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard label="Customers" value={s?.customerCount ?? 0} icon={Users} tone="info" to="/customers" />
        <KpiCard label="Open Tickets" value={s?.openTickets ?? 0} icon={LifeBuoy} tone="solar" to="/tickets" />
        <KpiCard label="MRR" value={`£${Math.round(s?.mrr ?? 0).toLocaleString()}`} icon={DollarSign} tone="success" to="/subscriptions" />
        <KpiCard label="Unpaid AR" value={`£${Math.round(s?.unpaid ?? 0).toLocaleString()}`} icon={FileText} tone="warning" to="/billing" />
        <KpiCard label="Monitors" value={`${(s?.monitorsTotal ?? 0) - (s?.monitorsDown ?? 0)}/${s?.monitorsTotal ?? 0}`} icon={Server} tone={(s?.monitorsDown ?? 0) > 0 ? "danger" : "success"} to="/monitoring" hint={(s?.monitorsDown ?? 0) > 0 ? `${s?.monitorsDown} down` : "All green"} />
        <KpiCard label="Assets" value={s?.assetCount ?? 0} icon={Box} tone="info" to="/assets" />
      </div>

      <SectionCard title="Quick actions" description="Kick off the most common workflows">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <QuickAction icon={Plus} label="New Customer" to="/customers" />
          <QuickAction icon={TicketPlus} label="Open Ticket" to="/tickets" tone="info" />
          <QuickAction icon={FileText} label="Draft Quote" to="/quotes" tone="warning" />
          <QuickAction icon={DollarSign} label="Log Payment" to="/payments" tone="success" />
          <QuickAction icon={KeyRound} label="Vault Entry" to="/credentials" />
          <QuickAction icon={Building2} label="Add Asset" to="/assets" tone="info" />
        </div>
      </SectionCard>

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
    </>
  );
}

export { load as loadExecStats };
