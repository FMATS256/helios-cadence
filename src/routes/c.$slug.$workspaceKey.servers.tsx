import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listWorkspaceServers, getWorkspaceContext } from "@/lib/portal.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Server, Cpu, MemoryStick, HardDrive, Circle } from "lucide-react";

export const Route = createFileRoute("/c/$slug/$workspaceKey/servers")({
  component: ServersPage,
});

function ServersPage() {
  const { slug, workspaceKey } = Route.useParams();
  const ctxFn = useServerFn(getWorkspaceContext);
  const { data: ctx } = useQuery({ queryKey: ["ws-ctx", slug, workspaceKey], queryFn: () => ctxFn({ data: { slug, workspaceKey } }) });
  const workspaceId = (ctx as any)?.workspace?.id;
  const fn = useServerFn(listWorkspaceServers);
  const { data: servers = [], isLoading } = useQuery({
    queryKey: ["ws-servers", workspaceId],
    queryFn: () => fn({ data: { workspaceId } }),
    enabled: !!workspaceId,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Your servers</h1>
        <p className="text-sm text-muted-foreground">Managed and provisioned by IMT Solutions.</p>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (servers as any[]).length === 0 ? (
        <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">No servers assigned to this workspace yet.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(servers as any[]).map((s) => (
            <Link key={s.link_id} to="/c/$slug/$workspaceKey/servers/$serverId" params={{ slug, workspaceKey, serverId: s.server.id }} className="block">
              <Card className="hover:shadow-lg transition">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="h-5 w-5 text-solar" />
                      <span className="font-semibold">{s.display_name}</span>
                    </div>
                    <PowerPill state={s.server.power_state} />
                  </div>
                  <div className="text-xs text-muted-foreground">{s.server.image ?? "—"} · {s.server.datacenter ?? "—"}</div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <Spec icon={<Cpu className="h-3.5 w-3.5" />} label="vCPU" value={String(s.server.cpu_cores ?? "?")} />
                    <Spec icon={<MemoryStick className="h-3.5 w-3.5" />} label="RAM" value={`${((s.server.ram_mb ?? 0) / 1024).toFixed(1)}G`} />
                    <Spec icon={<HardDrive className="h-3.5 w-3.5" />} label="Disk" value={`${(s.server.disk_sizes_gb ?? []).reduce((a: number, b: number) => a + b, 0)}G`} />
                  </div>
                  {(s.server.public_ips ?? [])[0] && <div className="text-xs font-mono text-muted-foreground">{(s.server.public_ips ?? [])[0]}</div>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PowerPill({ state }: { state?: string }) {
  const on = state === "on";
  return <Badge variant="outline" className={on ? "border-green-500/40 text-green-500" : "border-muted text-muted-foreground"}><Circle className={`h-2 w-2 mr-1.5 ${on ? "fill-green-500 text-green-500" : "fill-muted-foreground text-muted-foreground"}`} />{state ?? "unknown"}</Badge>;
}
function Spec({ icon, label, value }: any) {
  return <div><div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">{icon}{label}</div><div className="font-semibold">{value}</div></div>;
}
