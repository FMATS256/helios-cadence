import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
          <TabsTrigger value="activity"><ScrollText className="h-3.5 w-3.5 mr-1.5" />Activity</TabsTrigger>
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
          <InfoCard title="Live provider data">
            <Row k="Provider" v={s.provider ?? "unknown"} />
            <Row k="Power" v={s.power_state ?? "unknown"} />
            <Row k="Status" v={s.status ?? "unknown"} />
            <Row k="CPU load (last)" v={meta.cpu_load ?? meta.load ?? meta.cpu ?? "—"} />
            <Row k="Uptime" v={meta.uptime ?? "—"} />
            <Row k="Traffic used" v={meta.traffic_used ?? meta.traffic ?? "—"} />
            <p className="text-xs text-muted-foreground mt-3">Refresh to pull fresh metrics from {s.provider ?? "provider"}.</p>
          </InfoCard>
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
          <InfoCard title="Backup policy">
            <Row k="Daily backup" v={meta.dailybackup ?? meta.backup ?? "off"} />
            <Row k="Snapshots" v={Array.isArray(meta.snapshots) ? `${meta.snapshots.length}` : "0"} />
          </InfoCard>
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
          <InfoCard title="Billing">
            <Row k="Provider cost / mo" v={`$${Number(s.monthly_cost_usd || 0).toFixed(2)} USD`} />
            <Row k="Selling price / mo" v={`$${Number(s.selling_price_usd || 0).toFixed(2)} USD`} />
            <Row k="Gross margin / mo" v={`$${(Number(s.selling_price_usd || 0) - Number(s.monthly_cost_usd || 0)).toFixed(2)} USD`} />
            <Row k="Cycle" v={s.billing_cycle ?? "monthly"} />
          </InfoCard>
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
          <Card><CardContent className="p-0">
            {(activity.data ?? []).length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">No activity yet.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Action</TableHead><TableHead>Actor</TableHead>
                  <TableHead>Detail</TableHead><TableHead>When</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {activity.data!.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">{a.action}</TableCell>
                      <TableCell className="text-xs">{a.actor_email ?? "system"}</TableCell>
                      <TableCell className="font-mono text-xs max-w-md truncate">{JSON.stringify(a.detail ?? {})}</TableCell>
                      <TableCell className="text-xs">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
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
