import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { verifyKamatera } from "@/lib/kamatera.functions";
import { syncProviderServers } from "@/lib/providers.functions";
import { listProvisioningPlans, approveProvisioningPlan, rejectProvisioningPlan, executeProvisioningPlan, deployFromPrompt } from "@/lib/agent.functions";
import { listAllBackups, listBackupSchedules, createBackupNow, upsertBackupSchedule, deleteBackupSchedule, restoreBackup } from "@/lib/backups.functions";
import { listCustomerBudgets, upsertCustomerBudget, deleteCustomerBudget, getCustomerSpendSnapshot, listBudgetAlerts } from "@/lib/budgets.functions";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Server, RefreshCw, ShieldCheck, ShieldAlert, Activity, DollarSign, MapPin, Cloud as CloudIcon, Package, Bot, Check, X, Play, Sparkles, HardDrive, Wallet, AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";


export const Route = createFileRoute("/cloud-ops/")({
  head: () => ({ meta: [{ title: "Cloud — IMT" }] }),
  component: CloudOpsPage,
});

function CloudOpsPage() {
  const qc = useQueryClient();
  const fnVerify = useServerFn(verifyKamatera);
  const fnSync = useServerFn(syncProviderServers);

  const { data: servers = [], isLoading } = useQuery({
    queryKey: ["cloud_servers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cloud_servers" as any)
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["cloud_activity_recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cloud_activity" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      return (data ?? []) as any[];
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ["cloud_services_list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cloud_services" as any)
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const verify = useQuery({
    queryKey: ["kamatera-verify"],
    queryFn: () => fnVerify(),
    staleTime: 60_000,
  });

  const sync = useMutation({
    mutationFn: () => fnSync({ data: { provider: "kamatera" } }),
    onSuccess: (r) => {
      const res = r as { total: number; created: number; updated: number; note?: string };
      toast.success(res.note ? `Sync: ${res.note}` : `Synced ${res.total} servers (${res.created} new, ${res.updated} updated)`);
      qc.invalidateQueries({ queryKey: ["cloud_servers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = servers.length;
  const active = servers.filter((s) => s.power_state === "on" || s.status === "active").length;
  const provisioning = servers.filter((s) => s.status === "provisioning").length;
  const failed = servers.filter((s) => s.status === "failed").length;
  const stopped = servers.filter((s) => s.power_state === "off").length;
  const monthlyCost = servers.reduce((a, s) => a + Number(s.monthly_cost_usd || 0), 0);
  const monthlyRevenue = servers.reduce((a, s) => a + Number(s.selling_price_usd || 0), 0);
  const margin = monthlyRevenue - monthlyCost;

  const byDc = servers.reduce<Record<string, number>>((acc, s) => {
    const k = s.datacenter || "unknown";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const byImage = servers.reduce<Record<string, number>>((acc, s) => {
    const k = (s.image || "unknown").split("_")[0] || "unknown";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const unassigned = servers.filter((s) => !s.customer_id).length;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Cloud"
        title="Cloud Operations"
        description="Servers, managed services and cloud spend across all providers."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${sync.isPending ? "animate-spin" : ""}`} />
              Sync from Kamatera
            </Button>
            <AiDeployButton />
            <Link to="/cloud-ops/new">
              <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                <Plus className="h-4 w-4 mr-1.5" />
                New server
              </Button>
            </Link>
          </div>
        }
      />

      {/* Integration status banner */}
      <Card className="mb-4">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {verify.data?.ok ? (
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-red-600" />
            )}
            <div>
              <p className="text-sm font-semibold">Kamatera integration</p>
              <p className="text-xs text-muted-foreground">
                {verify.isLoading
                  ? "Checking credentials…"
                  : verify.data?.ok
                    ? `Connected — ${verify.data.datacenterCount} datacenters reachable`
                    : `Not connected: ${verify.data?.error ?? "Unknown error"}`}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => verify.refetch()}>Re-check</Button>
        </CardContent>
      </Card>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        <Stat label="Total servers" value={total} icon={Server} />
        <Stat label="Active" value={active} tone="success" />
        <Stat label="Stopped" value={stopped} />
        <Stat label="Provisioning" value={provisioning} tone="warning" />
        <Stat label="Failed" value={failed} tone="danger" />
        <Stat label="Provider cost / mo" value={`$${monthlyCost.toFixed(2)}`} icon={DollarSign} />
        <Stat label="Revenue / mo" value={`$${monthlyRevenue.toFixed(2)}`} tone={margin >= 0 ? "success" : "danger"} />
      </div>

      {/* Agenda / dashboard sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <AgendaCard title="Fleet by region" icon={MapPin} rows={Object.entries(byDc).map(([k, v]) => [k, `${v} server${v === 1 ? "" : "s"}`])} emptyLabel="No servers yet" />
        <AgendaCard title="OS distribution" icon={Server} rows={Object.entries(byImage).map(([k, v]) => [k, `${v}`])} emptyLabel="No servers yet" />
        <AgendaCard
          title="Margin snapshot"
          icon={DollarSign}
          rows={[
            ["Provider cost", `$${monthlyCost.toFixed(2)}`],
            ["Customer revenue", `$${monthlyRevenue.toFixed(2)}`],
            ["Gross margin", `$${margin.toFixed(2)}`],
            ["Unassigned servers", `${unassigned}`],
          ]}
        />
      </div>

      {/* Unified servers + services tabs */}
      <Tabs defaultValue="servers" className="mb-4">
        <TabsList>
          <TabsTrigger value="servers"><Server className="h-3.5 w-3.5 mr-1.5" />Servers ({servers.length})</TabsTrigger>
          <TabsTrigger value="services"><Package className="h-3.5 w-3.5 mr-1.5" />Managed services ({services.length})</TabsTrigger>
          <TabsTrigger value="providers"><CloudIcon className="h-3.5 w-3.5 mr-1.5" />Providers</TabsTrigger>
          <TabsTrigger value="agent"><Bot className="h-3.5 w-3.5 mr-1.5" />Provisioning agent</TabsTrigger>
          <TabsTrigger value="backups"><HardDrive className="h-3.5 w-3.5 mr-1.5" />Backups &amp; DR</TabsTrigger>
          <TabsTrigger value="budgets"><Wallet className="h-3.5 w-3.5 mr-1.5" />Budgets &amp; alerts</TabsTrigger>
        </TabsList>


        <TabsContent value="servers" className="mt-3">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : servers.length === 0 ? (
                <div className="p-12 text-center">
                  <Server className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No servers yet. Provision one or sync from a provider.</p>
                  <div className="flex gap-2 justify-center mt-4">
                    <Button size="sm" variant="outline" onClick={() => sync.mutate()}>Sync existing</Button>
                    <Link to="/cloud-ops/new"><Button size="sm">Provision</Button></Link>
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Server</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Spec</TableHead>
                      <TableHead>Public IP</TableHead>
                      <TableHead>Power</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Handover</TableHead>
                      <TableHead className="text-right">Cost / Sell</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {servers.map((s) => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => (window.location.href = `/cloud-ops/${s.id}`)}
                      >
                        <TableCell>
                          <div className="font-semibold">{s.name}</div>
                          <div className="text-xs text-muted-foreground">{s.image ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-xs uppercase">{s.provider ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{s.account_number ?? "—"}</TableCell>
                        <TableCell>{s.datacenter ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {s.cpu_cores ?? "?"}vCPU · {s.ram_mb ? (s.ram_mb / 1024).toFixed(0) : "?"}GB · {(s.disk_sizes_gb ?? []).join("+") || "?"}GB
                        </TableCell>
                        <TableCell className="font-mono text-xs">{(s.public_ips ?? [])[0] ?? "—"}</TableCell>
                        <TableCell>
                          <StatusPill tone={s.power_state === "on" ? "success" : s.power_state === "off" ? "neutral" : "warning"}>
                            {s.power_state ?? "unknown"}
                          </StatusPill>
                        </TableCell>
                        <TableCell>
                          <StatusPill tone={s.status === "active" ? "success" : s.status === "failed" ? "danger" : "warning"}>
                            {s.status}
                          </StatusPill>
                        </TableCell>
                        <TableCell className="text-xs">
                          {s.handed_over_at ? (
                            <StatusPill tone="success">handed over</StatusPill>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          ${Number(s.monthly_cost_usd || 0).toFixed(2)} / ${Number(s.selling_price_usd || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="mt-3">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">SaaS subscriptions & managed services</CardTitle>
              <Link to="/cloud"><Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5 mr-1" />Add / edit services</Button></Link>
            </CardHeader>
            <CardContent className="p-0">
              {services.length === 0 ? (
                <div className="p-10 text-center">
                  <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No managed services logged yet.</p>
                  <Link to="/cloud"><Button size="sm" className="mt-3">Add first service</Button></Link>
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Service</TableHead><TableHead>Vendor</TableHead>
                    <TableHead>Customer</TableHead><TableHead>Plan</TableHead>
                    <TableHead>Seats</TableHead><TableHead>Renewal</TableHead>
                    <TableHead>Status</TableHead><TableHead className="text-right">Monthly</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {services.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell><div className="font-semibold">{r.service_name}</div><div className="text-xs text-muted-foreground">{r.service_type}</div></TableCell>
                        <TableCell>{r.vendor || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.account_number ?? "—"}</TableCell>
                        <TableCell>{r.plan || "—"}</TableCell>
                        <TableCell>{r.seats ?? 0}</TableCell>
                        <TableCell className="text-xs">{r.renewal_date ? new Date(r.renewal_date).toLocaleDateString() : "—"}</TableCell>
                        <TableCell><StatusPill tone={r.status === "active" ? "success" : r.status === "cancelled" ? "danger" : "warning"}>{r.status}</StatusPill></TableCell>
                        <TableCell className="text-right font-mono text-xs">${Number(r.monthly_cost || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers" className="mt-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-3">Connected providers. Adapters handle regions, images, plans and provisioning.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {["kamatera", "vultr", "contabo"].map((p) => (
                  <div key={p} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CloudIcon className="h-4 w-4 text-primary" />
                      <div className="font-semibold capitalize">{p}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {servers.filter((s) => s.provider === p).length} server(s)
                    </div>
                    <div className="text-xs font-mono mt-1">
                      ${servers.filter((s) => s.provider === p).reduce((a, s) => a + Number(s.monthly_cost_usd || 0), 0).toFixed(2)}/mo cost
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agent" className="mt-3">
          <AgentPanel />
        </TabsContent>

        <TabsContent value="backups" className="mt-3">
          <BackupsPanel servers={servers} />
        </TabsContent>

        <TabsContent value="budgets" className="mt-3">
          <BudgetsPanel />
        </TabsContent>
      </Tabs>



      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center gap-2">
          <Activity className="h-4 w-4" />
          <CardTitle className="text-sm">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {activity.map((a) => (
                <li key={a.id} className="text-sm flex justify-between border-b py-1.5 last:border-0">
                  <span className="font-mono text-xs">{a.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function Stat({
  label, value, tone, icon: Icon,
}: { label: string; value: React.ReactNode; tone?: "success" | "warning" | "danger"; icon?: any }) {
  const color = tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-600" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function AgendaCard({
  title, icon: Icon, rows, emptyLabel,
}: { title: string; icon: any; rows: [string, string][]; emptyLabel?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center gap-2">
        <Icon className="h-4 w-4" />
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel ?? "No data"}</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map(([k, v]) => (
              <li key={k} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-mono">{v}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AgentPanel() {
  const qc = useQueryClient();
  const fnList = useServerFn(listProvisioningPlans);
  const fnApprove = useServerFn(approveProvisioningPlan);
  const fnReject = useServerFn(rejectProvisioningPlan);
  const fnExecute = useServerFn(executeProvisioningPlan);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["provisioning_plans"],
    queryFn: () => fnList(),
    refetchInterval: 10_000,
  });

  const { data: workflows = [] } = useQuery({
    queryKey: ["deployment_workflows"],
    queryFn: async () => {
      const { data } = await supabase
        .from("deployment_workflows" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15);
      return (data ?? []) as any[];
    },
    refetchInterval: 5_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["provisioning_plans"] });
    qc.invalidateQueries({ queryKey: ["deployment_workflows"] });
    qc.invalidateQueries({ queryKey: ["cloud_servers"] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => fnApprove({ data: { id } }),
    onSuccess: () => { toast.success("Plan approved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: (id: string) => fnReject({ data: { id, reason: "Rejected from Cloud Ops" } }),
    onSuccess: () => { toast.success("Plan rejected"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const execute = useMutation({
    mutationFn: (id: string) => fnExecute({ data: { plan_id: id } }),
    onSuccess: () => { toast.success("Workflow started"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Provisioning plans</CardTitle>
          </div>
          <Link to="/cloud-ops/new">
            <Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5 mr-1" />New plan</Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : plans.length === 0 ? (
            <div className="p-10 text-center">
              <Bot className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No provisioning plans yet.</p>
              <Link to="/cloud-ops/new"><Button size="sm" className="mt-3">Generate first plan</Button></Link>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Request</TableHead><TableHead>Provider</TableHead>
                <TableHead>Region</TableHead><TableHead>Est. cost</TableHead>
                <TableHead>Status</TableHead><TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {plans.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-semibold">{p.request?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs uppercase">{p.provider}</TableCell>
                    <TableCell>{p.region ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">${Number(p.estimated_monthly_usd || 0).toFixed(2)}/mo</TableCell>
                    <TableCell>
                      <StatusPill tone={
                        p.status === "executed" ? "success" :
                        p.status === "approved" ? "info" :
                        p.status === "rejected" || p.status === "failed" ? "danger" : "warning"
                      }>{p.status}</StatusPill>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {p.status === "draft" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => approve.mutate(p.id)} disabled={approve.isPending}>
                              <Check className="h-3.5 w-3.5 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => reject.mutate(p.id)} disabled={reject.isPending}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {p.status === "approved" && (
                          <Button size="sm" onClick={() => execute.mutate(p.id)} disabled={execute.isPending}>
                            <Play className="h-3.5 w-3.5 mr-1" />Execute
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center gap-2">
          <Activity className="h-4 w-4" />
          <CardTitle className="text-sm">Active workflows</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {workflows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No workflows yet.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Provider</TableHead><TableHead>Status</TableHead>
                <TableHead>Current step</TableHead><TableHead>Progress</TableHead>
                <TableHead>Started</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {workflows.map((w: any) => (
                  <TableRow key={w.id}>
                    <TableCell className="text-xs uppercase">{w.provider}</TableCell>
                    <TableCell>
                      <StatusPill tone={
                        w.status === "completed" ? "success" :
                        w.status === "failed" ? "danger" :
                        w.status === "running" ? "info" : "warning"
                      }>{w.status}</StatusPill>
                    </TableCell>
                    <TableCell className="text-xs">{w.current_step ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 bg-muted rounded overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${w.progress ?? 0}%` }} />
                        </div>
                        <span className="text-xs font-mono">{w.progress ?? 0}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {w.started_at ? formatDistanceToNow(new Date(w.started_at), { addSuffix: true }) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AiDeployButton() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const fn = useServerFn(deployFromPrompt);

  const mut = useMutation({
    mutationFn: () => fn({ data: { prompt, auto_approve: autoApprove } }),
    onSuccess: (row: any) => {
      toast.success(`Plan created for "${row.request?.name}" on ${row.provider} — $${Number(row.estimated_monthly_usd || 0).toFixed(2)}/mo`);
      qc.invalidateQueries({ queryKey: ["provisioning_plans"] });
      setOpen(false);
      setPrompt("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const examples = [
    "Deploy a small Ubuntu 22 server in Frankfurt with WordPress preinstalled",
    "I need a medium Docker host for staging in the Netherlands",
    "Provision a Windows 2022 VM, 4 cores, 8GB RAM for client remote-desktop",
  ];

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4 mr-1.5 text-primary" />
        Deploy with AI
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Deploy a server with AI
            </DialogTitle>
            <DialogDescription>
              Describe what you need in plain English. The agent picks the provider, region, size and
              template, then creates a draft plan for review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Deploy a small WordPress site in Frankfurt for Client X"
              rows={5}
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5">
              {examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  className="text-xs px-2 py-1 rounded border hover:bg-muted transition text-left"
                >
                  {ex.length > 48 ? ex.slice(0, 45) + "…" : ex}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <Label htmlFor="auto-approve" className="text-sm">Auto-approve plan</Label>
                <p className="text-xs text-muted-foreground">Skip review and mark as approved. Execute manually from the Agent tab.</p>
              </div>
              <Switch id="auto-approve" checked={autoApprove} onCheckedChange={setAutoApprove} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => mut.mutate()}
              disabled={mut.isPending || !prompt.trim()}
              className="text-solar-foreground"
              style={{ background: "var(--gradient-solar)" }}
            >
              {mut.isPending ? "Generating plan…" : "Generate plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ================== Backups & DR panel ==================
function BackupsPanel({ servers }: { servers: any[] }) {
  const qc = useQueryClient();
  const fnBackups = useServerFn(listAllBackups);
  const fnScheds = useServerFn(listBackupSchedules);
  const fnCreate = useServerFn(createBackupNow);
  const fnUpsert = useServerFn(upsertBackupSchedule);
  const fnDelete = useServerFn(deleteBackupSchedule);
  const fnRestore = useServerFn(restoreBackup);

  const [selectedServer, setSelectedServer] = useState<string>("");
  const [freq, setFreq] = useState<"hourly" | "daily" | "weekly" | "monthly">("daily");
  const [retention, setRetention] = useState(7);

  const { data: backups = [] } = useQuery({ queryKey: ["server_backups_all"], queryFn: () => fnBackups(), refetchInterval: 30_000 });
  const { data: schedules = [] } = useQuery({ queryKey: ["backup_schedules"], queryFn: () => fnScheds() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["server_backups_all"] });
    qc.invalidateQueries({ queryKey: ["backup_schedules"] });
  };

  const snapNow = useMutation({
    mutationFn: (server_id: string) => fnCreate({ data: { server_id, retention_days: retention } }),
    onSuccess: () => { toast.success("Backup recorded"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveSched = useMutation({
    mutationFn: () => fnUpsert({ data: { server_id: selectedServer, frequency: freq, retention_days: retention, enabled: true } }),
    onSuccess: () => { toast.success("Schedule saved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delSched = useMutation({
    mutationFn: (server_id: string) => fnDelete({ data: { server_id } }),
    onSuccess: () => { toast.success("Schedule removed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const restore = useMutation({
    mutationFn: (backup_id: string) => fnRestore({ data: { backup_id } }),
    onSuccess: () => { toast.success("Restore initiated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const serverName = (id: string) => servers.find((s) => s.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><HardDrive className="h-4 w-4" />Configure schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2">
              <Label className="text-xs">Server</Label>
              <Select value={selectedServer} onValueChange={setSelectedServer}>
                <SelectTrigger><SelectValue placeholder="Choose server…" /></SelectTrigger>
                <SelectContent>
                  {servers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} · {s.provider}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Frequency</Label>
              <Select value={freq} onValueChange={(v) => setFreq(v as any)}>
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
              <Label className="text-xs">Retention (days)</Label>
              <Input type="number" min={1} max={365} value={retention} onChange={(e) => setRetention(Number(e.target.value) || 7)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => saveSched.mutate()} disabled={!selectedServer || saveSched.isPending} className="flex-1">Save schedule</Button>
              <Button variant="outline" onClick={() => selectedServer && snapNow.mutate(selectedServer)} disabled={!selectedServer || snapNow.isPending}>
                Snapshot now
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Active schedules ({schedules.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {schedules.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No schedules yet.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Server</TableHead><TableHead>Frequency</TableHead>
                <TableHead>Retention</TableHead><TableHead>Last run</TableHead>
                <TableHead>Next run</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {schedules.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-semibold">{serverName(s.server_id)}</TableCell>
                    <TableCell><StatusPill tone="info">{s.frequency}</StatusPill></TableCell>
                    <TableCell>{s.retention_days} days</TableCell>
                    <TableCell className="text-xs">{s.last_run_at ? formatDistanceToNow(new Date(s.last_run_at), { addSuffix: true }) : "—"}</TableCell>
                    <TableCell className="text-xs">{s.next_run_at ? formatDistanceToNow(new Date(s.next_run_at), { addSuffix: true }) : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => delSched.mutate(s.server_id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Recent backups ({backups.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {backups.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No backups yet.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Server</TableHead><TableHead>Kind</TableHead>
                <TableHead>Status</TableHead><TableHead>Taken</TableHead>
                <TableHead>Expires</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {backups.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-semibold">{serverName(b.server_id)}</TableCell>
                    <TableCell className="text-xs uppercase">{b.kind}</TableCell>
                    <TableCell>
                      <StatusPill tone={b.status === "completed" ? "success" : b.status === "failed" ? "danger" : b.status === "expired" ? "neutral" : "warning"}>{b.status}</StatusPill>
                    </TableCell>
                    <TableCell className="text-xs">{b.taken_at ? formatDistanceToNow(new Date(b.taken_at), { addSuffix: true }) : "—"}</TableCell>
                    <TableCell className="text-xs">{b.expires_at ? new Date(b.expires_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right">
                      {b.status === "completed" && (
                        <Button size="sm" variant="outline" onClick={() => restore.mutate(b.id)} disabled={restore.isPending}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />Restore
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ================== Budgets & alerts panel ==================
function BudgetsPanel() {
  const qc = useQueryClient();
  const fnList = useServerFn(listCustomerBudgets);
  const fnUpsert = useServerFn(upsertCustomerBudget);
  const fnDelete = useServerFn(deleteCustomerBudget);
  const fnSnap = useServerFn(getCustomerSpendSnapshot);
  const fnAlerts = useServerFn(listBudgetAlerts);

  const { data: budgets = [] } = useQuery({ queryKey: ["customer_budgets"], queryFn: () => fnList() });
  const { data: snap } = useQuery({ queryKey: ["spend_snapshot"], queryFn: () => fnSnap(), refetchInterval: 60_000 });
  const { data: alerts = [] } = useQuery({ queryKey: ["budget_alerts"], queryFn: () => fnAlerts(), refetchInterval: 60_000 });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers_for_budget"],
    queryFn: async () => {
      const { data } = await supabase.from("customers" as any).select("id, name, account_number").order("name");
      return (data ?? []) as any[];
    },
  });

  const [customerId, setCustomerId] = useState("");
  const [cap, setCap] = useState(500);
  const [threshold, setThreshold] = useState(80);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["customer_budgets"] });
    qc.invalidateQueries({ queryKey: ["spend_snapshot"] });
  };

  const save = useMutation({
    mutationFn: () => fnUpsert({ data: { customer_id: customerId, monthly_cap_usd: cap, alert_threshold_pct: threshold, enabled: true } }),
    onSuccess: () => { toast.success("Budget saved"); invalidate(); setCustomerId(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (cid: string) => fnDelete({ data: { customer_id: cid } }),
    onSuccess: () => { toast.success("Budget removed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Wallet className="h-4 w-4" />Set customer budget</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2">
              <Label className="text-xs">Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Choose customer…" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.account_number})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Monthly cap (USD)</Label>
              <Input type="number" min={0} value={cap} onChange={(e) => setCap(Number(e.target.value) || 0)} />
            </div>
            <div>
              <Label className="text-xs">Alert at (%)</Label>
              <Input type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 80)} />
            </div>
            <Button onClick={() => save.mutate()} disabled={!customerId || save.isPending}>Save budget</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Customer spend vs budget</CardTitle></CardHeader>
        <CardContent className="p-0">
          {budgets.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No budgets set yet.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Customer</TableHead><TableHead>Cap</TableHead>
                <TableHead>Spend (this month)</TableHead><TableHead>Usage</TableHead>
                <TableHead>Threshold</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {budgets.map((b: any) => {
                  const spend = Number(snap?.totals?.[b.customer_id]?.revenue ?? snap?.totals?.[b.customer_id]?.cost ?? 0);
                  const cap = Number(b.monthly_cap_usd || 0);
                  const pct = cap > 0 ? (spend / cap) * 100 : 0;
                  const tone = pct >= 100 ? "danger" : pct >= b.alert_threshold_pct ? "warning" : "success";
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-semibold">{b.customers?.name ?? "—"} <span className="text-xs text-muted-foreground font-mono">{b.customers?.account_number}</span></TableCell>
                      <TableCell className="font-mono">${cap.toFixed(2)}</TableCell>
                      <TableCell className="font-mono">${spend.toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 bg-muted rounded overflow-hidden">
                            <div className={`h-full ${tone === "danger" ? "bg-red-500" : tone === "warning" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <StatusPill tone={tone}>{pct.toFixed(0)}%</StatusPill>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{b.alert_threshold_pct}%</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => remove.mutate(b.customer_id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Recent alerts</CardTitle></CardHeader>
        <CardContent className="p-0">
          {alerts.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No alerts fired.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>When</TableHead><TableHead>Customer</TableHead>
                <TableHead>Level</TableHead><TableHead>Spend / Cap</TableHead><TableHead>%</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {alerts.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{formatDistanceToNow(new Date(a.sent_at), { addSuffix: true })}</TableCell>
                    <TableCell>{a.customers?.name ?? "—"}</TableCell>
                    <TableCell><StatusPill tone={a.level === "breach" ? "danger" : "warning"}>{a.level}</StatusPill></TableCell>
                    <TableCell className="font-mono text-xs">${Number(a.spend_usd).toFixed(2)} / ${Number(a.cap_usd).toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs">{Number(a.pct).toFixed(0)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



