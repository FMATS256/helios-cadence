import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCustomersLite } from "@/components/module-page";
import {
  PageShell, SectionHeader, KpiRow, DataGrid, DetailCard, StatusBadge,
  EmptyState, RefreshButton, type ColumnDef,
} from "@/components/enterprise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Activity, Plus, Play, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Gauge, Search } from "lucide-react";
import { toast } from "sonner";
import { runAllChecksNow } from "@/lib/monitoring.functions";
import { getMonitoringOverview } from "@/lib/infra.functions";

const CHECK_TYPES = ["http", "https", "ping", "tcp", "dns"];


export function MonitoringPage() {
  const qc = useQueryClient();
  const runNow = useServerFn(runAllChecksNow);
  const overviewFn = useServerFn(getMonitoringOverview);
  const { data: customers = [] } = useCustomersLite();
  const [search, setSearch] = useState("");

  const overview = useQuery({ queryKey: ["monitoring-overview"], queryFn: () => overviewFn() });
  const checks = overview.data?.checks ?? [];
  const incidents = overview.data?.incidents ?? [];
  const stats = overview.data?.stats;

  const run = useMutation({
    mutationFn: () => runNow(),
    onSuccess: (r: any) => { toast.success(`Ran ${r.ran} checks`); qc.invalidateQueries({ queryKey: ["monitoring-overview"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return checks;
    return checks.filter((c: any) =>
      [c.name, c.target, c.account_number, c.check_type].some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [checks, search]);

  const checkCols: ColumnDef<any>[] = [
    { header: "Status", cell: (r) => <StatusBadge tone={r.status === "up" ? "success" : r.status === "down" ? "danger" : "neutral"}>{r.status ?? "unknown"}</StatusBadge> },
    {
      header: "Check",
      cell: (r) => (
        <div>
          <div className="font-semibold">{r.name}</div>
          <div className="text-xs text-muted-foreground font-mono">{r.target}</div>
        </div>
      ),
    },
    { header: "Type", cell: (r) => <StatusBadge tone="info">{String(r.check_type).toUpperCase()}</StatusBadge> },
    {
      header: "Customer",
      cell: (r) => r.account_number
        ? <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline">{r.account_number}</Link>
        : "—",
    },
    { header: "Interval", cell: (r) => `${r.interval_seconds}s` },
    { header: "Last check", cell: (r) => r.last_checked_at ? new Date(r.last_checked_at).toLocaleTimeString() : "Never" },
    { header: "Latency", align: "right", cell: (r) => <span className="font-mono">{r.last_response_ms != null ? `${r.last_response_ms}ms` : "—"}</span> },
    {
      header: "Avg 24h", align: "right",
      cell: (r) => <span className="font-mono text-muted-foreground">{r.avg_response_ms != null ? `${r.avg_response_ms}ms` : "—"}</span>,
    },
    {
      header: "Uptime 24h", align: "right",
      cell: (r) => (
        <span className={`font-mono font-semibold ${r.uptime_24h == null ? "text-muted-foreground" : r.uptime_24h >= 99 ? "text-success" : r.uptime_24h >= 90 ? "text-warning" : "text-destructive"}`}>
          {r.uptime_24h == null ? "—" : `${r.uptime_24h}%`}
        </span>
      ),
    },
  ];

  const incidentCols: ColumnDef<any>[] = [
    { header: "Check", cell: (r) => <span className="font-semibold">{r.monitoring_checks?.name ?? "—"}</span> },
    { header: "Target", cell: (r) => <span className="font-mono text-xs">{r.monitoring_checks?.target ?? "—"}</span> },
    { header: "Started", cell: (r) => new Date(r.started_at).toLocaleString() },
    {
      header: "Down for",
      cell: (r) => {
        const mins = Math.max(0, Math.round((Date.now() - new Date(r.started_at).getTime()) / 60000));
        return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
      },
    },
    { header: "Error", cell: (r) => <span className="text-xs text-destructive">{r.last_error || "—"}</span> },
  ];

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Services"
        title="Monitoring"
        description="Live uptime and reachability checks. The scheduler runs due checks every 5 minutes."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onClick={() => overview.refetch()} loading={overview.isFetching} />
            <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
              <Play className="h-4 w-4 mr-1.5" />{run.isPending ? "Running…" : "Run all now"}
            </Button>
            <NewCheckDialog customers={customers} onDone={() => qc.invalidateQueries({ queryKey: ["monitoring-overview"] })} />
          </div>
        }
      />

      <KpiRow
        cols={5}
        items={[
          { label: "Monitored endpoints", value: stats?.total ?? 0, icon: Activity, tone: "info", hint: stats ? `${stats.enabled} enabled` : undefined },
          { label: "Up", value: stats?.up ?? 0, icon: ArrowUpCircle, tone: "success" },
          { label: "Down", value: stats?.down ?? 0, icon: ArrowDownCircle, tone: "danger" },
          { label: "Open incidents", value: stats?.openIncidents ?? 0, icon: AlertTriangle, tone: "warning" },
          { label: "Avg uptime 24h", value: stats?.avgUptime24h == null ? "—" : `${stats.avgUptime24h}%`, icon: Gauge, tone: "solar", hint: stats?.samples24h ? `${stats.samples24h} samples` : undefined },
        ]}
      />

      {incidents.length > 0 && (
        <DetailCard title="Open incidents" padded={false}>
          <DataGrid rows={incidents} columns={incidentCols} />
        </DetailCard>
      )}

      <DetailCard
        title="All checks"
        padded={false}
        action={
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search checks…" className="pl-9 h-9" />
          </div>
        }
      >
        <DataGrid
          rows={filtered}
          columns={checkCols}
          loading={overview.isLoading}
          empty={<EmptyState title="No checks configured" description="Add an HTTP or HTTPS check to start monitoring a customer endpoint." icon={Activity} />}
        />
      </DetailCard>
    </PageShell>
  );
}

function NewCheckDialog({ customers, onDone }: { customers: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ customer_id: "", name: "", check_type: "https", target: "", interval_seconds: 300, enabled: true });
  const create = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.target) throw new Error("Name and target required");
      const { error } = await supabase.from("monitoring_checks").insert({
        ...form,
        customer_id: form.customer_id || null,
        interval_seconds: Number(form.interval_seconds) || 300,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { setOpen(false); onDone(); toast.success("Check created"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
          <Plus className="h-4 w-4 mr-1.5" />New check
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New monitoring check</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Client website" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.check_type} onValueChange={(v) => setForm({ ...form, check_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHECK_TYPES.map((t) => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Interval (seconds)</Label>
              <Input type="number" value={form.interval_seconds} onChange={(e) => setForm({ ...form, interval_seconds: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Target *</Label>
            <Input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="https://client.co.zw" />
          </div>
          <div className="space-y-2">
            <Label>Customer</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Optional — link to a customer" /></SelectTrigger>
              <SelectContent>
                {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              {create.isPending ? "Saving…" : "Create check"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
