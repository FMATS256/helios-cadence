import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { verifyKamatera, syncServers } from "@/lib/kamatera.functions";
import { listProvisioningPlans, approveProvisioningPlan, rejectProvisioningPlan, executeProvisioningPlan } from "@/lib/agent.functions";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Server, RefreshCw, ShieldCheck, ShieldAlert, Activity, DollarSign, MapPin, Cloud as CloudIcon, Package, Bot, Check, X, Play } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";


export const Route = createFileRoute("/cloud-ops/")({
  head: () => ({ meta: [{ title: "Cloud — IMT" }] }),
  component: CloudOpsPage,
});

function CloudOpsPage() {
  const qc = useQueryClient();
  const fnVerify = useServerFn(verifyKamatera);
  const fnSync = useServerFn(syncServers);

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
    mutationFn: () => fnSync(),
    onSuccess: (r) => {
      toast.success(`Synced ${r.total} servers (${r.created} new, ${r.updated} updated)`);
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
        <TabsContent value="agent" className="mt-3">
          <AgentPanel />
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
