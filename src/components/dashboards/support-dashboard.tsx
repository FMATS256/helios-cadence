import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { HeroPanel, KpiCard, QuickAction, SectionCard } from "./shared";
import { StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  LifeBuoy, AlertTriangle, Clock, CheckCircle2, Server, Activity, Plus, ArrowUpRight, KeyRound,
} from "lucide-react";

async function loadSupport() {
  const sb = supabase.from as any;
  const [tickets, monitoring, assets, servers, hosting, voip] = await Promise.all([
    supabase.from("tickets").select("id,ticket_number,subject,priority,status,account_number,created_at,assigned_to").is("archived_at", null).order("created_at", { ascending: false }),
    sb("monitoring_checks").select("id,name,check_type,status,target,last_checked_at").is("archived_at", null),
    sb("assets").select("id,status").is("archived_at", null),
    sb("cloud_servers").select("id,status"),
    sb("hosting_accounts").select("id,status"),
    sb("voip_accounts").select("id,status"),
  ]);
  const t = tickets.data ?? [];
  const m = (monitoring.data ?? []) as any[];
  const a = (assets.data ?? []) as any[];
  const tally = (r: any) => {
    const rows = (r?.data ?? []) as any[];
    const ok = rows.filter((x) => ["active", "running", "up", "online"].includes(String(x.status).toLowerCase())).length;
    return { total: rows.length, ok, issue: rows.length - ok };
  };
  const stale = m.filter((x) => !x.last_checked_at || Date.now() - new Date(x.last_checked_at).getTime() > 15 * 60000).length;
  const byType: Record<string, { up: number; down: number }> = {};
  m.forEach((x) => { const k = x.check_type || "other"; byType[k] ??= { up: 0, down: 0 }; x.status === "down" ? byType[k].down++ : byType[k].up++; });
  const tech = {
    servers: tally(servers), hosting: tally(hosting), voip: tally(voip),
    stale, byType, availability: m.length ? Math.round((m.filter((x) => x.status === "up").length / m.length) * 1000) / 10 : null,
  };
  const open = t.filter((x: any) => x.status !== "resolved" && x.status !== "closed");
  const critical = open.filter((x: any) => x.priority === "critical");
  const high = open.filter((x: any) => x.priority === "high");
  const today = new Date(); today.setHours(0,0,0,0);
  const resolvedToday = t.filter((x: any) => (x.status === "resolved" || x.status === "closed") && new Date(x.created_at) >= today);
  const oldOpen = open.filter((x: any) => (Date.now() - new Date(x.created_at).getTime()) > 3 * 86400000);
  return {
    openCount: open.length,
    critical: critical.length,
    high: high.length,
    resolvedToday: resolvedToday.length,
    aging: oldOpen.length,
    unassigned: open.filter((x: any) => !x.assigned_to).length,
    monitorsUp: m.filter((x) => x.status === "up").length,
    monitorsDown: m.filter((x) => x.status === "down").length,
    monitorsTotal: m.length,
    assetsFaulty: a.filter((x) => x.status === "faulty" || x.status === "repair").length,
    queue: open.slice(0, 8),
    downChecks: m.filter((x) => x.status === "down").slice(0, 6),
    tech,
  };
}

export function SupportDashboard({ displayName }: { displayName: string }) {
  const { data: s } = useQuery({ queryKey: ["dash-support"], queryFn: loadSupport });
  return (
    <>
      <HeroPanel
        eyebrow="Support Operations"
        title={`Welcome, ${displayName}`}
        accent={(s?.monitorsDown ?? 0) > 0 || (s?.critical ?? 0) > 0 ? "warning" : "info"}
        subtitle={
          <>
            <span className="text-solar font-semibold">{s?.openCount ?? 0}</span> open ·
            <span className="text-solar font-semibold"> {s?.critical ?? 0}</span> critical ·
            <span className="text-solar font-semibold"> {s?.monitorsDown ?? 0}</span> monitors down
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" className="bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground">
              <Link to="/noc">Monitors</Link>
            </Button>
            <Button asChild className="text-solar-foreground border-0" style={{ background: "var(--gradient-solar)" }}>
              <Link to="/tickets"><Plus className="h-4 w-4 mr-1.5" />New Ticket</Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard label="Open Tickets" value={s?.openCount ?? 0} icon={LifeBuoy} tone="solar" to="/tickets" />
        <KpiCard label="Critical" value={s?.critical ?? 0} icon={AlertTriangle} tone="danger" to="/tickets" />
        <KpiCard label="High" value={s?.high ?? 0} icon={Activity} tone="warning" to="/tickets" />
        <KpiCard label="Unassigned" value={s?.unassigned ?? 0} icon={Clock} tone="warning" to="/tickets" />
        <KpiCard label="Resolved Today" value={s?.resolvedToday ?? 0} icon={CheckCircle2} tone="success" to="/tickets" />
        <KpiCard label="Monitors" value={`${s?.monitorsUp ?? 0}/${s?.monitorsTotal ?? 0}`} icon={Server} tone={(s?.monitorsDown ?? 0) > 0 ? "danger" : "success"} to="/noc" hint={(s?.monitorsDown ?? 0) > 0 ? `${s?.monitorsDown} down` : "All up"} />
      </div>

      <SectionCard title="Service health" description="Live technical status across managed services">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard label="Availability" value={s?.tech.availability == null ? "—" : `${s.tech.availability}%`} icon={Activity} tone={(s?.tech.availability ?? 100) < 99 ? "warning" : "success"} to="/noc" hint="Monitors up" />
          <KpiCard label="Cloud servers" value={`${s?.tech.servers.ok ?? 0}/${s?.tech.servers.total ?? 0}`} icon={Server} tone={(s?.tech.servers.issue ?? 0) > 0 ? "warning" : "success"} to="/noc" search={{ tab: "servers" }} hint={`${s?.tech.servers.issue ?? 0} not running`} />
          <KpiCard label="Web hosting" value={`${s?.tech.hosting.ok ?? 0}/${s?.tech.hosting.total ?? 0}`} icon={Server} tone={(s?.tech.hosting.issue ?? 0) > 0 ? "warning" : "success"} to="/web-hosting" hint={`${s?.tech.hosting.issue ?? 0} suspended/other`} />
          <KpiCard label="VoIP lines" value={`${s?.tech.voip.ok ?? 0}/${s?.tech.voip.total ?? 0}`} icon={Activity} tone={(s?.tech.voip.issue ?? 0) > 0 ? "warning" : "success"} to="/noc" hint={`${s?.tech.voip.issue ?? 0} inactive`} />
          <KpiCard label="Stale checks" value={s?.tech.stale ?? 0} icon={Clock} tone={(s?.tech.stale ?? 0) > 0 ? "warning" : "success"} to="/noc" hint="No result in 15 min" />
        </div>
        {Object.keys(s?.tech.byType ?? {}).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {Object.entries(s!.tech.byType).map(([k, v]) => (
              <StatusPill key={k} tone={v.down > 0 ? "danger" : "success"}>{k}: {v.up} up{v.down ? ` · ${v.down} down` : ""}</StatusPill>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Support workflows">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction icon={Plus} label="Log Ticket" to="/tickets" tone="solar" />
          <QuickAction icon={Server} label="Add Monitor" to="/noc" tone="info" />
          <QuickAction icon={KeyRound} label="Access Vault" to="/techops/vault" tone="warning" />
          <QuickAction icon={Activity} label="Knowledge Base" to="/knowledge" tone="success" />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard
          className="xl:col-span-2"
          title="Ticket queue"
          description="Newest open items — critical first"
          action={<Button variant="ghost" size="sm" asChild><Link to="/tickets">Open desk <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></Button>}
        >
          <div className="space-y-2">
            {(s?.queue ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Inbox zero ✨</p>}
            {(s?.queue ?? []).sort((a: any, b: any) => (a.priority === "critical" ? -1 : b.priority === "critical" ? 1 : 0)).map((t: any) => (
              <Link key={t.id} to="/tickets/$id" params={{ id: t.id }} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
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

        <SectionCard title="Monitors down" action={<Button variant="ghost" size="sm" asChild><Link to="/noc">All <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></Button>}>
          <div className="space-y-2">
            {(s?.downChecks ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">All systems nominal ✅</p>}
            {(s?.downChecks ?? []).map((m: any) => (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                <div className="h-9 w-9 rounded-md bg-destructive/15 text-destructive flex items-center justify-center"><Server className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.check_type} · {m.target}</p>
                </div>
                <StatusPill tone="danger">down</StatusPill>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
