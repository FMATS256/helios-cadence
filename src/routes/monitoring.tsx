import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCustomersLite } from "@/components/module-page";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Activity, Plus, Play, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { runAllChecksNow } from "@/lib/monitoring.functions";

const CHECK_TYPES = ["http", "https", "ping", "tcp", "dns"];

export const Route = createFileRoute("/monitoring")({
  head: () => ({ meta: [{ title: "Monitoring — IMT Operations" }] }),
  component: MonitoringPage,
});

function MonitoringPage() {
  const qc = useQueryClient();
  const runNow = useServerFn(runAllChecksNow);
  const { data: customers = [] } = useCustomersLite();

  const { data: checks = [] } = useQuery({
    queryKey: ["monitoring_checks"],
    queryFn: async () => (await supabase.from("monitoring_checks").select("*").order("name")).data ?? [],
  });
  const { data: incidents = [] } = useQuery({
    queryKey: ["monitoring_incidents_open"],
    queryFn: async () => (await supabase.from("monitoring_incidents").select("*, monitoring_checks:check_id(name,target)").is("ended_at", null).order("started_at", { ascending: false })).data ?? [],
  });

  const run = useMutation({
    mutationFn: () => runNow(),
    onSuccess: (r: any) => { toast.success(`Ran ${r.ran} checks`); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const up = (checks as any[]).filter((c) => c.status === "up").length;
  const down = (checks as any[]).filter((c) => c.status === "down").length;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Services"
        title="Monitoring"
        description="Live uptime and reachability checks. Cron runs due checks every 5 minutes."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending}><Play className="h-4 w-4 mr-1.5" />{run.isPending ? "Running…" : "Run all now"}</Button>
            <NewCheckDialog customers={customers} onDone={() => qc.invalidateQueries({ queryKey: ["monitoring_checks"] })} />
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Total checks" value={checks.length} tone="info" icon={Activity} />
        <Kpi label="Up" value={up} tone="success" icon={Activity} />
        <Kpi label="Down" value={down} tone="danger" icon={AlertTriangle} />
        <Kpi label="Open incidents" value={incidents.length} tone="warning" icon={AlertTriangle} />
      </div>

      {incidents.length > 0 && (
        <Card>
          <div className="p-4 border-b"><h3 className="font-display font-semibold text-destructive">Open incidents</h3></div>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Check</TableHead><TableHead>Target</TableHead><TableHead>Started</TableHead><TableHead>Error</TableHead></TableRow></TableHeader>
              <TableBody>
                {(incidents as any[]).map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-semibold">{i.monitoring_checks?.name}</TableCell>
                    <TableCell className="font-mono text-xs">{i.monitoring_checks?.target}</TableCell>
                    <TableCell className="text-sm">{new Date(i.started_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-destructive">{i.last_error || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className="p-4 border-b"><h3 className="font-display font-semibold">All checks</h3></div>
        <CardContent className="p-0">
          {checks.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No checks configured. Add one to start monitoring.</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Check</TableHead><TableHead>Type</TableHead><TableHead>Customer</TableHead><TableHead>Interval</TableHead><TableHead>Last</TableHead><TableHead>Latency</TableHead><TableHead>Uptime 24h</TableHead></TableRow></TableHeader>
              <TableBody>
                {(checks as any[]).map((r) => <CheckRow key={r.id} row={r} />)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function CheckRow({ row }: { row: any }) {
  const { data: uptime } = useQuery({
    queryKey: ["uptime", row.id],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data } = await supabase.from("monitoring_results").select("status").eq("check_id", row.id).gte("checked_at", since);
      const total = data?.length ?? 0;
      const up = (data || []).filter((r: any) => r.status === "up").length;
      return total ? Math.round((up / total) * 1000) / 10 : null;
    },
  });
  return (
    <TableRow>
      <TableCell><StatusPill tone={row.status === "up" ? "success" : row.status === "down" ? "danger" : "neutral"}>{row.status}</StatusPill></TableCell>
      <TableCell><div className="font-semibold">{row.name}</div><div className="text-xs text-muted-foreground font-mono">{row.target}</div></TableCell>
      <TableCell><StatusPill tone="info">{row.check_type.toUpperCase()}</StatusPill></TableCell>
      <TableCell>{row.account_number ? <Link to="/customers/$accountNumber" params={{ accountNumber: row.account_number }} className="font-mono text-xs text-solar hover:underline">{row.account_number}</Link> : "—"}</TableCell>
      <TableCell className="text-sm">{row.interval_seconds}s</TableCell>
      <TableCell className="text-sm">{row.last_checked_at ? new Date(row.last_checked_at).toLocaleTimeString() : "Never"}</TableCell>
      <TableCell className="font-mono">{row.last_response_ms != null ? `${row.last_response_ms}ms` : "—"}</TableCell>
      <TableCell className="font-mono">{uptime == null ? "—" : `${uptime}%`}</TableCell>
    </TableRow>
  );
}

function Kpi({ label, value, tone, icon: Icon }: any) {
  const map: any = { info: "bg-info/15 text-info", success: "bg-success/15 text-success", danger: "bg-destructive/15 text-destructive", warning: "bg-warning/20 text-[oklch(0.45_0.13_75)]" };
  return (
    <Card><CardContent className="p-5 flex items-start justify-between">
      <div>
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">{label}</p>
        <p className="font-display text-3xl font-bold mt-2 tabular-nums">{value}</p>
      </div>
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${map[tone]}`}><Icon className="h-4 w-4" /></div>
    </CardContent></Card>
  );
}

function NewCheckDialog({ customers, onDone }: { customers: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ customer_id: "", name: "", check_type: "https", target: "", interval_seconds: 300, enabled: true });
  const create = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.target) throw new Error("Name and target required");
      const { error } = await supabase.from("monitoring_checks").insert({ ...form, customer_id: form.customer_id || null, interval_seconds: Number(form.interval_seconds) || 300 } as any);
      if (error) throw error;
    },
    onSuccess: () => { setOpen(false); onDone(); toast.success("Check created"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1.5" />New check</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New monitoring check</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Customer</Label>
              <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Internal / none" /></SelectTrigger>
                <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Type</Label>
              <Select value={form.check_type} onValueChange={(v) => setForm({ ...form, check_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHECK_TYPES.map((t) => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2"><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="col-span-2 space-y-2"><Label>Target *</Label><Input required value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="https://portal.example.com" /></div>
            <div className="space-y-2"><Label>Interval (seconds)</Label><Input type="number" min="60" value={form.interval_seconds} onChange={(e) => setForm({ ...form, interval_seconds: e.target.value })} /></div>
          </div>
          <DialogFooter><Button type="submit" disabled={create.isPending}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
