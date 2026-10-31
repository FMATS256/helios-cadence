import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { powerProviderServer, refreshProviderServer } from "@/lib/providers.functions";
import { sampleServerMetrics } from "@/lib/servers.functions";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Power, PowerOff, RotateCw, RefreshCw, Settings2, Loader2 } from "lucide-react";
import { FirewallManager } from "@/components/firewall-manager";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield } from "lucide-react";
import { ServerApprovals } from "@/components/server-tools-panel";
import { workloadGuide, WORKLOAD_GUIDES } from "@/lib/server-config-guides";

export const Route = createFileRoute("/cloud-ops/fleet")({
  head: () => ({
    meta: [
      { title: "Server Fleet Control — IMT Solutions" },
      { name: "description", content: "Monitor, manage and configure every client server from one place." },
      { property: "og:title", content: "Server Fleet Control — IMT Solutions" },
      { property: "og:description", content: "Health checks, power controls and setup guides for client servers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FleetPage,
});

function FleetPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [fw, setFw] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fnSample = useServerFn(sampleServerMetrics);
  const fnPower = useServerFn(powerProviderServer);
  const fnRefresh = useServerFn(refreshProviderServer);

  const { data: servers = [], isLoading } = useQuery({
    queryKey: ["fleet_servers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cloud_servers" as any).select("*").order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const { data: metrics = [] } = useQuery({
    queryKey: ["fleet_metrics"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600e3).toISOString();
      const { data } = await supabase.from("server_metrics" as any).select("*").gte("sampled_at", since).order("sampled_at", { ascending: false }).limit(1000);
      return (data ?? []) as any[];
    },
  });
  const latest = new Map<string, any>();
  for (const m of metrics) if (!latest.has(m.server_id)) latest.set(m.server_id, m);

  const refreshAll = () => { qc.invalidateQueries({ queryKey: ["fleet_servers"] }); qc.invalidateQueries({ queryKey: ["fleet_metrics"] }); };

  const checkAll = useMutation({
    mutationFn: async () => {
      let ok = 0, fail = 0;
      for (const s of servers) {
        try { await fnSample({ data: { server_id: s.id } }); ok++; } catch { fail++; }
      }
      return { ok, fail };
    },
    onSuccess: (r) => { toast.success(`Checked ${r.ok} server(s)${r.fail ? `, ${r.fail} failed` : ""}`); refreshAll(); },
  });

  async function act(id: string, kind: "on" | "off" | "reboot" | "check" | "sync") {
    if ((kind === "off" || kind === "reboot") && !confirm(`Confirm ${kind === "off" ? "power off" : "reboot"}?`)) return;
    setBusy(id + kind);
    try {
      if (kind === "check") await fnSample({ data: { server_id: id } });
      else if (kind === "sync") await fnRefresh({ data: { server_id: id } });
      else await fnPower({ data: { server_id: id, action: kind } });
      toast.success("Done");
      refreshAll();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }

  const list = servers.filter((s) => !q || `${s.name} ${s.ip_address ?? ""} ${s.provider} ${s.image ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const down = servers.filter((s) => latest.get(s.id)?.reachable === false).length;
  const off = servers.filter((s) => s.power_state === "off").length;

  return (
    <PageContainer>
      <PageHeader title="Server Fleet Control" description="Monitor, manage and configure every server." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Servers" value={servers.length} />
        <Stat label="Unreachable" value={down} tone={down ? "bad" : undefined} />
        <Stat label="Powered off" value={off} />
        <Stat label="Checked (24h)" value={latest.size} />
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder="Search name, IP, provider…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Button onClick={() => checkAll.mutate()} disabled={checkAll.isPending || !servers.length}>
          {checkAll.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Activity className="h-4 w-4 mr-1.5" />}Check all now
        </Button>
      </div>

      <div className="mb-4"><ServerApprovals /></div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Server</TableHead><TableHead>Provider</TableHead><TableHead>Power</TableHead>
            <TableHead>Health</TableHead><TableHead>Latency</TableHead><TableHead>Template</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && list.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No servers yet.</TableCell></TableRow>}
            {list.map((s) => {
              const m = latest.get(s.id);
              const g = workloadGuide(`${s.name} ${s.image ?? ""} ${s.notes ?? ""}`);
              return (
                <TableRow key={s.id}>
                  <TableCell><Link to="/cloud-ops/$id" params={{ id: s.id }} className="font-medium hover:underline">{s.name}</Link><div className="text-xs text-muted-foreground font-mono">{s.ip_address ?? "—"}</div></TableCell>
                  <TableCell className="capitalize">{s.provider}</TableCell>
                  <TableCell><Badge variant={s.power_state === "on" ? "default" : "outline"}>{s.power_state ?? s.status ?? "—"}</Badge></TableCell>
                  <TableCell>{!m ? <span className="text-xs text-muted-foreground">Not checked</span> : m.reachable ? <Badge className="bg-success text-success-foreground">Up</Badge> : <Badge variant="destructive">Down</Badge>}</TableCell>
                  <TableCell className="font-mono text-xs">{m?.latency_ms != null ? `${m.latency_ms} ms` : "—"}</TableCell>
                  <TableCell className="text-xs">{g?.label ?? "General"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <IconBtn title="Health check" onClick={() => act(s.id, "check")} busy={busy === s.id + "check"}><Activity className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn title="Sync from provider" onClick={() => act(s.id, "sync")} busy={busy === s.id + "sync"}><RefreshCw className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn title="Power on" onClick={() => act(s.id, "on")} busy={busy === s.id + "on"}><Power className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn title="Reboot" onClick={() => act(s.id, "reboot")} busy={busy === s.id + "reboot"}><RotateCw className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn title="Power off" onClick={() => act(s.id, "off")} busy={busy === s.id + "off"}><PowerOff className="h-3.5 w-3.5" /></IconBtn>
                    <Button size="icon" variant="ghost" title="Firewall" onClick={() => setFw(s)}><Shield className="h-3.5 w-3.5" /></Button>
                    <Link to="/cloud-ops/$id" params={{ id: s.id }}><Button size="icon" variant="ghost" title="Manage"><Settings2 className="h-3.5 w-3.5" /></Button></Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={!!fw} onOpenChange={(o) => !o && setFw(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Firewall — {fw?.name}</DialogTitle></DialogHeader>
          {fw && <FirewallManager server={fw} />}
        </DialogContent>
      </Dialog>

      <h2 className="text-lg font-semibold mt-8 mb-3">Configuration guides</h2>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {WORKLOAD_GUIDES.map((g) => (
          <Card key={g.key}><CardContent className="p-4">
            <div className="font-semibold">{g.label}</div>
            <div className="text-xs text-muted-foreground mb-2">{g.os} · Ports: {g.ports}</div>
            <ul className="text-sm list-disc pl-4 space-y-1">{g.steps.map((x) => <li key={x}>{x}</li>)}</ul>
          </CardContent></Card>
        ))}
      </div>
    </PageContainer>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={tone ? "text-2xl font-bold text-destructive" : "text-2xl font-bold"}>{value}</div></CardContent></Card>;
}
function IconBtn({ children, onClick, busy, title }: { children: React.ReactNode; onClick: () => void; busy: boolean; title: string }) {
  return <Button size="icon" variant="ghost" title={title} onClick={onClick} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}</Button>;
}
