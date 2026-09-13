import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  refreshProviderServer, powerProviderServer, terminateProviderServer, sendServerHandover,
} from "@/lib/providers.functions";
import {
  getServerOps, sampleServerMetrics, snapshotServer, deleteServerSnapshot,
  accrueServerCost, addServerCostEntry,
} from "@/lib/servers.functions";
import { upsertBackupSchedule, restoreBackup } from "@/lib/backups.functions";
import { GradientAreaChart, IMT_COLORS } from "@/components/dashboards/charts";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, RefreshCw, Power, PowerOff, RotateCw, Trash2, Server as ServerIcon,
  Cpu, HardDrive, Network, Shield, Save, Key, DollarSign, Rocket, Bell, ScrollText, Gauge,
  Send, CheckCircle2, Loader2, Camera, History as HistoryIcon, Undo2, Plus, Activity as ActivityIcon,
} from "lucide-react";

import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/cloud-ops/$id")({
  head: () => ({ meta: [{ title: "Server — IMT Cloud Ops" }] }),
  component: ServerDetailPage,
});

function ServerDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fnRefresh = useServerFn(refreshProviderServer);
  const fnPower = useServerFn(powerProviderServer);
  const fnTerminate = useServerFn(terminateProviderServer);

  const fnHandover = useServerFn(sendServerHandover);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverForm, setHandoverForm] = useState({ contact_email: "", root_password: "", message: "" });

  const server = useQuery({
    queryKey: ["cloud_server", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cloud_servers" as any)
        .select("*, customer:customer_id(id,account_number,company_name)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    // Auto-poll while provisioning
    refetchInterval: (q) => {
      const s = q.state.data as any;
      return s && s.status === "provisioning" ? 3000 : false;
    },
  });

  const activity = useQuery({
    queryKey: ["cloud_activity", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("cloud_activity" as any).select("*")
        .eq("server_id", id).order("created_at", { ascending: false }).limit(50);
      return (data ?? []) as any[];
    },
  });

  const deployments = useQuery({
    queryKey: ["cloud_deployments", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("cloud_deployments" as any).select("*")
        .eq("server_id", id).order("created_at", { ascending: false }).limit(50);
      return (data ?? []) as any[];
    },
    refetchInterval: (q) => {
      const s = server.data as any;
      return s && s.status === "provisioning" ? 3000 : false;
    },
  });

  const credentials = useQuery({
    queryKey: ["server_credentials", id, server.data?.customer_id],
    enabled: !!server.data?.customer_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("credentials" as any)
        .select("id,name,credential_type,expires_at,created_at")
        .eq("customer_id", server.data.customer_id)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  // ---- Servers workspace: metrics, snapshots, history and cost tracking ----
  const fnOps = useServerFn(getServerOps);
  const fnSample = useServerFn(sampleServerMetrics);
  const fnSnapshot = useServerFn(snapshotServer);
  const fnDeleteSnap = useServerFn(deleteServerSnapshot);
  const fnRestore = useServerFn(restoreBackup);
  const fnSchedule = useServerFn(upsertBackupSchedule);
  const fnAccrue = useServerFn(accrueServerCost);
  const fnAddCost = useServerFn(addServerCostEntry);

  const [liveOn, setLiveOn] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);
  const [snapForm, setSnapForm] = useState({ retention_days: "7", notes: "" });
  const [costOpen, setCostOpen] = useState(false);
  const [costForm, setCostForm] = useState({ period_start: "", period_end: "", provider_cost_usd: "", selling_price_usd: "", notes: "" });
  const [schedForm, setSchedForm] = useState({ frequency: "daily", retention_days: "7", enabled: true });

  const ops = useQuery({
    queryKey: ["server_ops", id],
    queryFn: () => fnOps({ data: { server_id: id } }),
  });
  const opsData = ops.data as any;
  const invalidateOps = () => {
    qc.invalidateQueries({ queryKey: ["server_ops", id] });
    qc.invalidateQueries({ queryKey: ["cloud_server", id] });
  };

  const sample = useMutation({
    mutationFn: () => fnSample({ data: { server_id: id } }),
    onSuccess: (r: any) => {
      if (r?.provider_error) toast.warning(`Recorded locally. Provider said: ${r.provider_error}`);
      invalidateOps();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Live polling: take a fresh sample every 30s while "Live" is on.
  useEffect(() => {
    if (!liveOn) return;
    sample.mutate();
    const t = setInterval(() => sample.mutate(), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveOn, id]);

  const snapshot = useMutation({
    mutationFn: () => fnSnapshot({
      data: {
        server_id: id,
        retention_days: Number(snapForm.retention_days) || 7,
        notes: snapForm.notes || undefined,
      },
    }),
    onSuccess: () => { toast.success("Snapshot taken"); setSnapOpen(false); invalidateOps(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeSnap = useMutation({
    mutationFn: (backup_id: string) => fnDeleteSnap({ data: { backup_id } }),
    onSuccess: () => { toast.success("Snapshot removed"); invalidateOps(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: (backup_id: string) => fnRestore({ data: { backup_id } }),
    onSuccess: () => { toast.success("Restore recorded"); invalidateOps(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSchedule = useMutation({
    mutationFn: () => fnSchedule({
      data: {
        server_id: id,
        frequency: schedForm.frequency as any,
        retention_days: Number(schedForm.retention_days) || 7,
        enabled: schedForm.enabled,
      },
    }),
    onSuccess: () => { toast.success("Backup schedule saved"); invalidateOps(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const accrue = useMutation({
    mutationFn: () => fnAccrue({ data: { server_id: id } }),
    onSuccess: () => { toast.success("Month-to-date cost updated"); invalidateOps(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCost = useMutation({
    mutationFn: () => fnAddCost({
      data: {
        server_id: id,
        period_start: costForm.period_start,
        period_end: costForm.period_end,
        provider_cost_usd: Number(costForm.provider_cost_usd) || 0,
        selling_price_usd: Number(costForm.selling_price_usd) || 0,
        notes: costForm.notes || undefined,
      },
    }),
    onSuccess: () => { toast.success("Cost recorded"); setCostOpen(false); invalidateOps(); },
    onError: (e: Error) => toast.error(e.message),
  });


  const refresh = useMutation({
    mutationFn: () => fnRefresh({ data: { server_id: id } }),
    onSuccess: () => {
      toast.success("Refreshed from Kamatera");
      qc.invalidateQueries({ queryKey: ["cloud_server", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const power = useMutation({
    mutationFn: (action: "poweron" | "poweroff" | "reboot") => {
      const map = { poweron: "on", poweroff: "off", reboot: "reboot" } as const;
      return fnPower({ data: { server_id: id, action: map[action] } });
    },
    onSuccess: (_, action) => {
      toast.success(`Command sent: ${action}`);
      qc.invalidateQueries({ queryKey: ["cloud_server", id] });
      qc.invalidateQueries({ queryKey: ["cloud_activity", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const terminate = useMutation({
    mutationFn: () => fnTerminate({ data: { server_id: id } }),
    onSuccess: () => {
      toast.success("Server terminated");
      navigate({ to: "/cloud-ops" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // (handover mutation defined below as sendHandover)
  const sendHandover = useMutation({
    mutationFn: (payload: { contact_email?: string; root_password?: string; message?: string }) =>
      fnHandover({ data: { server_id: id, ...payload } }),
    onSuccess: (r) => {
      if (r.email_status === "sent") {
        toast.success(`Handover email sent to ${r.to}`);
      } else {
        toast.warning(`Handover recorded. Email not sent: ${r.email_error ?? "email not configured"}`);
      }
      setHandoverOpen(false);
      qc.invalidateQueries({ queryKey: ["cloud_server", id] });
      qc.invalidateQueries({ queryKey: ["cloud_activity", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (server.isLoading) return <PageContainer><p className="p-8 text-center">Loading…</p></PageContainer>;
  if (!server.data) return <PageContainer><p className="p-8 text-center">Server not found.</p></PageContainer>;

  const s = server.data;
  const meta = (s.provider_meta ?? {}) as any;

  const metrics: any[] = opsData?.metrics ?? [];
  const latest = metrics.length ? metrics[metrics.length - 1] : null;
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const latencySeries = metrics.map((m) => ({ label: fmtTime(m.sampled_at), value: Number(m.latency_ms ?? 0) }));
  const upSeries = metrics.map((m) => ({ label: fmtTime(m.sampled_at), value: m.reachable ? 1 : 0 }));
  const snapshots: any[] = opsData?.backups ?? [];
  const schedule: any = opsData?.schedule ?? null;
  const costs: any[] = opsData?.costs ?? [];
  const costTotals = costs.reduce(
    (a, c) => ({ cost: a.cost + Number(c.provider_cost_usd || 0), sell: a.sell + Number(c.selling_price_usd || 0) }),
    { cost: 0, sell: 0 },
  );

  // Merged history: activity log + deployments + snapshots, newest first.
  const history = [
    ...(activity.data ?? []).map((a: any) => ({
      key: `a-${a.id}`, action: a.action, type: "activity", tone: "neutral" as const,
      actor: a.actor_email ?? "system", detail: JSON.stringify(a.detail ?? {}), at: a.created_at,
    })),
    ...(deployments.data ?? []).map((d: any) => ({
      key: `d-${d.id}`, action: d.action, type: "deployment",
      tone: (d.status === "completed" ? "success" : d.status === "failed" ? "danger" : "warning") as const,
      actor: "system", detail: d.provider_command_id ?? d.status, at: d.created_at,
    })),
    ...snapshots.map((b: any) => ({
      key: `b-${b.id}`, action: `backup.${b.kind}`, type: "backup",
      tone: (b.status === "completed" ? "success" : b.status === "failed" ? "danger" : "neutral") as const,
      actor: "system", detail: b.notes ?? b.status, at: b.created_at,
    })),
  ].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());

  const on = s.power_state === "on";
  const isProvisioning = s.status === "provisioning";
  const isHandedOver = !!s.handed_over_at;
  const latestDeployment = deployments.data?.[0];
  const provisioningProgress = isProvisioning ? 45 : (s.status === "active" ? 100 : s.status === "failed" ? 100 : 20);

  return (
    <PageContainer>
      <div className="mb-3">
        <Link to="/cloud-ops" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Cloud
        </Link>
      </div>
      <PageHeader
        eyebrow={`${(s.provider ?? "cloud").toString().toUpperCase()} · ${s.datacenter ?? "—"}`}
        title={s.name}
        description={s.customer ? `${s.customer.account_number} · ${s.customer.company_name}` : "Unassigned"}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${refresh.isPending ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => power.mutate("reboot")} disabled={power.isPending || !on}>
              <RotateCw className="h-4 w-4 mr-1.5" /> Reboot
            </Button>
            {on ? (
              <Button variant="outline" size="sm" onClick={() => power.mutate("poweroff")} disabled={power.isPending}>
                <PowerOff className="h-4 w-4 mr-1.5" /> Power off
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => power.mutate("poweron")} disabled={power.isPending}>
                <Power className="h-4 w-4 mr-1.5" /> Power on
              </Button>
            )}
            <Button
              variant="default" size="sm"
              disabled={isProvisioning || !s.customer_id}
              onClick={() => setHandoverOpen(true)}
              title={!s.customer_id ? "Assign a customer first" : ""}
            >
              <Send className="h-4 w-4 mr-1.5" /> {isHandedOver ? "Re-send handover" : "Hand over to customer"}
            </Button>
            <Button
              variant="destructive" size="sm"
              onClick={() => { if (confirm(`Terminate ${s.name}? This cannot be undone.`)) terminate.mutate(); }}
              disabled={terminate.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Terminate
            </Button>
          </div>
        }
      />

      {/* Provisioning progress banner */}
      {isProvisioning && (
        <Card className="mb-4 border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold">Provisioning in progress</p>
                <p className="text-xs text-muted-foreground">
                  Contacting {s.provider} · this usually takes 1–3 minutes. This page auto-refreshes.
                </p>
              </div>
              <span className="text-xs font-mono">{provisioningProgress}%</span>
            </div>
            <Progress value={provisioningProgress} className="h-2" />
            {latestDeployment && (
              <p className="text-xs text-muted-foreground mt-2">
                Last step: <span className="font-mono">{latestDeployment.action}</span> · {latestDeployment.status}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Handover status banner */}
      {isHandedOver && !isProvisioning && (
        <Card className="mb-4 border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="p-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div className="text-sm">
              <span className="font-semibold">Handed over</span> to{" "}
              <span className="font-mono">{s.handed_over_to_email}</span>{" "}
              <span className="text-muted-foreground">
                · {formatDistanceToNow(new Date(s.handed_over_at), { addSuffix: true })}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Stat label="Power" value={<StatusPill tone={on ? "success" : "neutral"}>{s.power_state}</StatusPill>} />
        <Stat label="Status" value={<StatusPill tone={s.status === "active" ? "success" : s.status === "failed" ? "danger" : "warning"}>{s.status}</StatusPill>} />
        <Stat label="Public IP" value={<span className="font-mono text-sm">{(s.public_ips ?? [])[0] ?? "—"}</span>} />
        <Stat label="Provider cost / mo" value={`$${Number(s.monthly_cost_usd || 0).toFixed(2)}`} />
        <Stat label="Selling price / mo" value={`$${Number(s.selling_price_usd || 0).toFixed(2)}`} />
        <Stat label="Margin / mo" value={`$${(Number(s.selling_price_usd || 0) - Number(s.monthly_cost_usd || 0)).toFixed(2)}`} />
      </div>


      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview"><ServerIcon className="h-3.5 w-3.5 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="monitoring"><Gauge className="h-3.5 w-3.5 mr-1.5" />Monitoring</TabsTrigger>
          <TabsTrigger value="compute"><Cpu className="h-3.5 w-3.5 mr-1.5" />Compute</TabsTrigger>
          <TabsTrigger value="storage"><HardDrive className="h-3.5 w-3.5 mr-1.5" />Storage</TabsTrigger>
          <TabsTrigger value="networking"><Network className="h-3.5 w-3.5 mr-1.5" />Networking</TabsTrigger>
          <TabsTrigger value="firewall"><Shield className="h-3.5 w-3.5 mr-1.5" />Firewall</TabsTrigger>
          <TabsTrigger value="backups"><Save className="h-3.5 w-3.5 mr-1.5" />Backups</TabsTrigger>
          <TabsTrigger value="credentials"><Key className="h-3.5 w-3.5 mr-1.5" />Credentials</TabsTrigger>
          <TabsTrigger value="billing"><DollarSign className="h-3.5 w-3.5 mr-1.5" />Billing</TabsTrigger>
          <TabsTrigger value="deployments"><Rocket className="h-3.5 w-3.5 mr-1.5" />Deployments</TabsTrigger>
          <TabsTrigger value="alerts"><Bell className="h-3.5 w-3.5 mr-1.5" />Alerts</TabsTrigger>
          <TabsTrigger value="activity"><HistoryIcon className="h-3.5 w-3.5 mr-1.5" />History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoCard title="Server">
              <Row k="Name" v={s.name} />
              <Row k="Provider" v={s.provider} />
              <Row k="Provider ID" v={s.provider_server_id ?? "—"} />
              <Row k="Datacenter" v={s.datacenter ?? "—"} />
              <Row k="Image" v={s.image ?? "—"} />
              <Row k="Billing cycle" v={s.billing_cycle ?? "—"} />
              <Row k="Created" v={formatDistanceToNow(new Date(s.created_at), { addSuffix: true })} />
              <Row k="Last synced" v={s.last_synced_at ? formatDistanceToNow(new Date(s.last_synced_at), { addSuffix: true }) : "Never"} />
            </InfoCard>
            <InfoCard title="Notes">
              <p className="text-sm whitespace-pre-wrap">{s.notes || "No notes."}</p>
            </InfoCard>
          </div>
        </TabsContent>

        <TabsContent value="monitoring" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">Live metrics</CardTitle>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch id="live" checked={liveOn} onCheckedChange={setLiveOn} />
                    <Label htmlFor="live" className="text-xs">Live (30s)</Label>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => sample.mutate()} disabled={sample.isPending}>
                    <ActivityIcon className={`h-4 w-4 mr-1.5 ${sample.isPending ? "animate-pulse" : ""}`} /> Sample now
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <Row k="Reachable" v={latest ? (latest.reachable ? "yes" : "no") : "—"} />
                  <Row k="Response" v={latest?.latency_ms != null ? `${latest.latency_ms} ms` : "—"} />
                  <Row k="CPU" v={latest?.cpu_percent != null ? `${Number(latest.cpu_percent).toFixed(0)}%` : "—"} />
                  <Row k="Memory" v={latest?.ram_percent != null ? `${Number(latest.ram_percent).toFixed(0)}%` : "—"} />
                  <Row k="Disk" v={latest?.disk_percent != null ? `${Number(latest.disk_percent).toFixed(0)}%` : "—"} />
                  <Row k="Traffic" v={latest?.traffic_gb != null ? `${Number(latest.traffic_gb).toFixed(1)} GB` : "—"} />
                  <Row k="Power" v={latest?.power_state ?? s.power_state ?? "—"} />
                  <Row k="Samples" v={String(metrics.length)} />
                </div>
                {metrics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No samples yet. Hit <span className="font-medium">Sample now</span> to poll {s.provider ?? "the provider"} and probe the server.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Response time (ms)</p>
                      <GradientAreaChart data={latencySeries} dataKey="value" xKey="label" height={180} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Availability (1 = reachable)</p>
                      <GradientAreaChart data={upSeries} dataKey="value" xKey="label" height={140} color={IMT_COLORS.solar} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <InfoCard title="Latest provider readout">
              <Row k="Provider" v={s.provider ?? "unknown"} />
              <Row k="Status" v={s.status ?? "unknown"} />
              <Row k="Uptime" v={meta.uptime ?? "—"} />
              <Row k="Traffic used" v={meta.traffic_used ?? meta.traffic ?? "—"} />
              <Row k="Last synced" v={s.last_synced_at ? formatDistanceToNow(new Date(s.last_synced_at), { addSuffix: true }) : "Never"} />
            </InfoCard>
          </div>
        </TabsContent>


        <TabsContent value="compute" className="mt-4">
          <InfoCard title="Compute">
            <Row k="vCPU cores" v={s.cpu_cores ?? "—"} />
            <Row k="CPU type" v={s.cpu_type ?? "—"} />
            <Row k="RAM" v={s.ram_mb ? `${(s.ram_mb / 1024).toFixed(1)} GB (${s.ram_mb} MB)` : "—"} />
          </InfoCard>
        </TabsContent>

        <TabsContent value="storage" className="mt-4">
          <InfoCard title="Disks">
            {(s.disk_sizes_gb ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No disks reported.</p>
            ) : (
              <ul className="space-y-1">
                {(s.disk_sizes_gb as number[]).map((d, i) => (
                  <li key={i} className="text-sm flex justify-between">
                    <span>Disk #{i}</span><span className="font-mono">{d} GB</span>
                  </li>
                ))}
              </ul>
            )}
          </InfoCard>
        </TabsContent>

        <TabsContent value="networking" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoCard title="Public IPs">
              {(s.public_ips ?? []).length === 0 ? <p className="text-sm text-muted-foreground">None</p> :
                <ul>{(s.public_ips as string[]).map((ip) => <li key={ip} className="font-mono text-sm">{ip}</li>)}</ul>}
            </InfoCard>
            <InfoCard title="Private IPs">
              {(s.private_ips ?? []).length === 0 ? <p className="text-sm text-muted-foreground">None</p> :
                <ul>{(s.private_ips as string[]).map((ip) => <li key={ip} className="font-mono text-sm">{ip}</li>)}</ul>}
            </InfoCard>
            <InfoCard title="Networks (raw)">
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-64">
                {JSON.stringify(s.networks ?? [], null, 2)}
              </pre>
            </InfoCard>
          </div>
        </TabsContent>

        <TabsContent value="firewall" className="mt-4">
          <InfoCard title="Firewall rules">
            <p className="text-sm text-muted-foreground">
              Firewall management runs at the Kamatera network layer. Managed rules will appear here once configured.
            </p>
          </InfoCard>
        </TabsContent>

        <TabsContent value="backups" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">Snapshots</CardTitle>
                <Button size="sm" onClick={() => setSnapOpen(true)}>
                  <Camera className="h-4 w-4 mr-1.5" /> Take snapshot
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {snapshots.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">No snapshots yet.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Kind</TableHead><TableHead>Status</TableHead>
                      <TableHead>Taken</TableHead><TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {snapshots.map((b: any) => (
                        <TableRow key={b.id}>
                          <TableCell className="text-xs">{b.kind}</TableCell>
                          <TableCell><StatusPill tone={b.status === "completed" ? "success" : b.status === "failed" ? "danger" : "neutral"}>{b.status}</StatusPill></TableCell>
                          <TableCell className="text-xs">{b.taken_at ? formatDistanceToNow(new Date(b.taken_at), { addSuffix: true }) : "—"}</TableCell>
                          <TableCell className="text-xs">{b.expires_at ? new Date(b.expires_at).toLocaleDateString() : "—"}</TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button
                              size="sm" variant="outline"
                              disabled={b.status !== "completed" || restore.isPending}
                              onClick={() => { if (confirm(`Restore ${s.name} from this snapshot?`)) restore.mutate(b.id); }}
                            >
                              <Undo2 className="h-3.5 w-3.5 mr-1" /> Restore
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              disabled={b.status === "deleted" || removeSnap.isPending}
                              onClick={() => removeSnap.mutate(b.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <InfoCard title="Automatic backups">
              <div className="grid gap-3 md:grid-cols-4 items-end">
                <div>
                  <Label className="text-xs">Frequency</Label>
                  <Select value={schedForm.frequency} onValueChange={(v) => setSchedForm({ ...schedForm, frequency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Keep for (days)</Label>
                  <Input value={schedForm.retention_days} onChange={(e) => setSchedForm({ ...schedForm, retention_days: e.target.value })} />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch id="sched" checked={schedForm.enabled} onCheckedChange={(v) => setSchedForm({ ...schedForm, enabled: v })} />
                  <Label htmlFor="sched" className="text-xs">Enabled</Label>
                </div>
                <Button onClick={() => saveSchedule.mutate()} disabled={saveSchedule.isPending}>
                  <Save className="h-4 w-4 mr-1.5" /> Save schedule
                </Button>
              </div>
              {schedule && (
                <p className="text-xs text-muted-foreground mt-3">
                  Current: {schedule.frequency}, keep {schedule.retention_days} days, {schedule.enabled ? "enabled" : "paused"}
                  {schedule.next_run_at ? ` · next run ${new Date(schedule.next_run_at).toLocaleString()}` : ""}
                </p>
              )}
            </InfoCard>
          </div>
        </TabsContent>


        <TabsContent value="credentials" className="mt-4">
          <InfoCard title="Linked customer credentials">
            {!s.customer_id ? (
              <p className="text-sm text-muted-foreground">Assign this server to a customer to link credentials.</p>
            ) : (credentials.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No credentials for this customer.</p>
            ) : (
              <ul className="space-y-1.5">
                {credentials.data!.map((c: any) => (
                  <li key={c.id} className="flex justify-between text-sm">
                    <span>{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.credential_type}</span>
                  </li>
                ))}
              </ul>
            )}
          </InfoCard>
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Cost to date" value={`$${costTotals.cost.toFixed(2)}`} />
              <Stat label="Billed to date" value={`$${costTotals.sell.toFixed(2)}`} />
              <Stat label="Margin to date" value={`$${(costTotals.sell - costTotals.cost).toFixed(2)}`} />
              <Stat label="Run rate / mo" value={`$${Number(s.monthly_cost_usd || 0).toFixed(2)}`} />
            </div>
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">Cost history</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => accrue.mutate()} disabled={accrue.isPending}>
                    <RefreshCw className={`h-4 w-4 mr-1.5 ${accrue.isPending ? "animate-spin" : ""}`} /> Update this month
                  </Button>
                  <Button size="sm" onClick={() => setCostOpen(true)}>
                    <Plus className="h-4 w-4 mr-1.5" /> Record cost
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {costs.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">
                    No cost records yet. "Update this month" works out what this server has cost so far.
                  </p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Period</TableHead><TableHead>Source</TableHead>
                      <TableHead className="text-right">Provider cost</TableHead>
                      <TableHead className="text-right">Billed</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {costs.map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs">{c.period_start} → {c.period_end}</TableCell>
                          <TableCell className="text-xs">{c.source}</TableCell>
                          <TableCell className="text-right font-mono text-xs">${Number(c.provider_cost_usd || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">${Number(c.selling_price_usd || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">${(Number(c.selling_price_usd || 0) - Number(c.provider_cost_usd || 0)).toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{c.notes ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <InfoCard title="Pricing">
              <Row k="Provider cost / mo" v={`$${Number(s.monthly_cost_usd || 0).toFixed(2)} USD`} />
              <Row k="Selling price / mo" v={`$${Number(s.selling_price_usd || 0).toFixed(2)} USD`} />
              <Row k="Gross margin / mo" v={`$${(Number(s.selling_price_usd || 0) - Number(s.monthly_cost_usd || 0)).toFixed(2)} USD`} />
              <Row k="Cycle" v={s.billing_cycle ?? "monthly"} />
            </InfoCard>
          </div>
        </TabsContent>


        <TabsContent value="deployments" className="mt-4">
          <Card><CardContent className="p-0">
            {(deployments.data ?? []).length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">No deployments logged.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Action</TableHead><TableHead>Status</TableHead>
                  <TableHead>Command</TableHead><TableHead>When</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {deployments.data!.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.action}</TableCell>
                      <TableCell><StatusPill tone={d.status === "completed" ? "success" : d.status === "failed" ? "danger" : "warning"}>{d.status}</StatusPill></TableCell>
                      <TableCell className="font-mono text-xs">{d.provider_command_id ?? "—"}</TableCell>
                      <TableCell className="text-xs">{formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <InfoCard title="Alerts">
            <p className="text-sm text-muted-foreground">
              Attach a monitoring check from the Monitoring module to raise alerts when this server is unreachable.
            </p>
          </InfoCard>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Full server history</CardTitle></CardHeader>
            <CardContent className="p-0">
              {history.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground text-center">No history yet.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Event</TableHead><TableHead>Type</TableHead>
                    <TableHead>Actor</TableHead><TableHead>Detail</TableHead><TableHead>When</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {history.map((h) => (
                      <TableRow key={h.key}>
                        <TableCell className="font-mono text-xs">{h.action}</TableCell>
                        <TableCell className="text-xs">
                          <StatusPill tone={h.tone}>{h.type}</StatusPill>
                        </TableCell>
                        <TableCell className="text-xs">{h.actor}</TableCell>
                        <TableCell className="font-mono text-xs max-w-md truncate">{h.detail}</TableCell>
                        <TableCell className="text-xs">{formatDistanceToNow(new Date(h.at), { addSuffix: true })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Handover dialog */}
      <Dialog open={handoverOpen} onOpenChange={setHandoverOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Hand over server to customer</DialogTitle>
            <DialogDescription>
              We'll email the server details to the customer contact. Root password is optional — include it if the customer needs full access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Contact email</Label>
              <Input
                type="email"
                value={handoverForm.contact_email}
                onChange={(e) => setHandoverForm({ ...handoverForm, contact_email: e.target.value })}
                placeholder="Leave empty to use primary contact on file"
              />
            </div>
            <div>
              <Label>Root password (optional, will be included in email)</Label>
              <Input
                type="text"
                value={handoverForm.root_password}
                onChange={(e) => setHandoverForm({ ...handoverForm, root_password: e.target.value })}
                placeholder="Only include if the customer needs it"
              />
            </div>
            <div>
              <Label>Custom message (optional)</Label>
              <Textarea
                rows={3}
                value={handoverForm.message}
                onChange={(e) => setHandoverForm({ ...handoverForm, message: e.target.value })}
                placeholder="Your server is ready. Here are the access details…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHandoverOpen(false)}>Cancel</Button>
            <Button
              onClick={() => sendHandover.mutate({
                contact_email: handoverForm.contact_email || undefined,
                root_password: handoverForm.root_password || undefined,
                message: handoverForm.message || undefined,
              })}
              disabled={sendHandover.isPending}
            >
              <Send className="h-4 w-4 mr-1.5" />
              {sendHandover.isPending ? "Sending…" : "Send handover email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Snapshot dialog */}
      <Dialog open={snapOpen} onOpenChange={setSnapOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Take a snapshot</DialogTitle>
            <DialogDescription>Capture the current state of {s.name} so it can be restored later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Keep for (days)</Label>
              <Input value={snapForm.retention_days} onChange={(e) => setSnapForm({ ...snapForm, retention_days: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={snapForm.notes} onChange={(e) => setSnapForm({ ...snapForm, notes: e.target.value })} placeholder="Why are you taking this snapshot?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSnapOpen(false)}>Cancel</Button>
            <Button onClick={() => snapshot.mutate()} disabled={snapshot.isPending}>
              {snapshot.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Camera className="h-4 w-4 mr-1.5" />}
              Take snapshot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cost entry dialog */}
      <Dialog open={costOpen} onOpenChange={setCostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a cost</DialogTitle>
            <DialogDescription>Log what this server cost for a period, and what the customer was billed.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Period start</Label>
              <Input type="date" value={costForm.period_start} onChange={(e) => setCostForm({ ...costForm, period_start: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Period end</Label>
              <Input type="date" value={costForm.period_end} onChange={(e) => setCostForm({ ...costForm, period_end: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Provider cost (USD)</Label>
              <Input value={costForm.provider_cost_usd} onChange={(e) => setCostForm({ ...costForm, provider_cost_usd: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Billed to customer (USD)</Label>
              <Input value={costForm.selling_price_usd} onChange={(e) => setCostForm({ ...costForm, selling_price_usd: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <Input value={costForm.notes} onChange={(e) => setCostForm({ ...costForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCostOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addCost.mutate()}
              disabled={addCost.isPending || !costForm.period_start || !costForm.period_end}
            >
              {addCost.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <DollarSign className="h-4 w-4 mr-1.5" />}
              Record cost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>

  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </CardContent></Card>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm py-1 border-b last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-xs">{v}</span>
    </div>
  );
}
