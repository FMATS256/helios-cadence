import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listWorkspaceServers, listWorkspaceAudit, getWorkspaceContext } from "@/lib/portal.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Server, Activity, ShieldCheck, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/c/$slug/$workspaceKey/")({
  component: Overview,
});

function Overview() {
  const { slug, workspaceKey } = Route.useParams();
  const ctxFn = useServerFn(getWorkspaceContext);
  const { data: ctx } = useQuery({ queryKey: ["ws-ctx", slug, workspaceKey], queryFn: () => ctxFn({ data: { slug, workspaceKey } }) });
  const workspaceId = (ctx as any)?.workspace?.id;

  const sFn = useServerFn(listWorkspaceServers);
  const aFn = useServerFn(listWorkspaceAudit);
  const { data: servers = [] } = useQuery({ queryKey: ["ws-servers", workspaceId], queryFn: () => sFn({ data: { workspaceId } }), enabled: !!workspaceId });
  const { data: audit = [] } = useQuery({ queryKey: ["ws-audit", workspaceId], queryFn: () => aFn({ data: { workspaceId, limit: 8 } }), enabled: !!workspaceId });

  const totalCpu = (servers as any[]).reduce((s, x) => s + (x.server?.cpu_cores ?? 0), 0);
  const totalRam = (servers as any[]).reduce((s, x) => s + (x.server?.ram_mb ?? 0), 0) / 1024;
  const running = (servers as any[]).filter((x) => x.server?.power_state === "on").length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-8 border" style={{ background: "var(--gradient-navy)" }}>
        <p className="text-xs tracking-[3px] text-solar/80 uppercase mb-2">IMT Cloud Portal</p>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-navy-foreground">Welcome, {(ctx as any)?.workspace?.name ?? "Customer"}</h1>
        <p className="mt-2 text-navy-foreground/70 max-w-2xl">Manage your IMT-provisioned servers, invite team members, and track activity across your cloud footprint.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/c/$slug/$workspaceKey/servers" params={{ slug, workspaceKey }} className="inline-flex items-center gap-2 rounded-md bg-solar text-solar-foreground px-4 py-2 text-sm font-semibold hover:opacity-90">
            <Server className="h-4 w-4" /> Manage servers <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link to="/c/$slug/$workspaceKey/team" params={{ slug, workspaceKey }} className="inline-flex items-center gap-2 rounded-md border border-solar/40 text-navy-foreground px-4 py-2 text-sm font-semibold hover:bg-solar/10">
            Invite team
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi icon={<Server className="h-4 w-4" />} label="Servers" value={String((servers as any[]).length)} sub={`${running} running`} />
        <Kpi icon={<Activity className="h-4 w-4" />} label="vCPU cores" value={String(totalCpu)} />
        <Kpi icon={<ShieldCheck className="h-4 w-4" />} label="RAM (GB)" value={totalRam.toFixed(1)} />
        <Kpi icon={<Activity className="h-4 w-4" />} label="Recent activity" value={String((audit as any[]).length)} sub="last events" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(audit as any[]).length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
          {(audit as any[]).map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b last:border-0 py-2 text-sm">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="uppercase text-[10px]">{r.actor_kind}</Badge>
                <span className="font-medium">{r.action.replace(/_/g, " ")}</span>
                {r.resource_kind && <span className="text-muted-foreground">· {r.resource_kind}</span>}
              </div>
              <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-widest">{icon}<span>{label}</span></div>
        <div className="mt-2 text-3xl font-display font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
