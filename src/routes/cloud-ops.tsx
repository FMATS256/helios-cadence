import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Server } from "lucide-react";

export const Route = createFileRoute("/cloud-ops")({
  head: () => ({ meta: [{ title: "Cloud Operations — IMT" }] }),
  component: CloudOpsPage,
});

function CloudOpsPage() {
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

  const total = servers.length;
  const active = servers.filter((s) => s.power_state === "on" || s.status === "active").length;
  const provisioning = servers.filter((s) => s.status === "provisioning").length;
  const failed = servers.filter((s) => s.status === "failed").length;
  const monthlyCost = servers.reduce((a, s) => a + Number(s.monthly_cost_usd || 0), 0);
  const monthlyRevenue = servers.reduce((a, s) => a + Number(s.selling_price_usd || 0), 0);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Cloud Ops"
        title="Cloud Operations"
        description="Provision and manage Kamatera cloud servers for IMT customers."
        actions={
          <Link to="/cloud-ops/new">
            <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              <Plus className="h-4 w-4 mr-1.5" />
              New server
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <Stat label="Total" value={total} />
        <Stat label="Active" value={active} tone="success" />
        <Stat label="Provisioning" value={provisioning} tone="warning" />
        <Stat label="Failed" value={failed} tone="danger" />
        <Stat label="Provider cost / mo" value={`$${monthlyCost.toFixed(2)}`} />
        <Stat label="Revenue / mo" value={`$${monthlyRevenue.toFixed(2)}`} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : servers.length === 0 ? (
            <div className="p-12 text-center">
              <Server className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No servers yet. Launch your first one.</p>
              <Link to="/cloud-ops/new">
                <Button size="sm" className="mt-4">Provision server</Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Datacenter</TableHead>
                  <TableHead>Spec</TableHead>
                  <TableHead>Public IP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.image}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.account_number ?? "—"}</TableCell>
                    <TableCell>{s.datacenter}</TableCell>
                    <TableCell className="text-xs">
                      {s.cpu_cores}vCPU · {(s.ram_mb / 1024).toFixed(0)}GB · {(s.disk_sizes_gb ?? []).join("+")}GB
                    </TableCell>
                    <TableCell className="font-mono text-xs">{(s.public_ips ?? [])[0] ?? "—"}</TableCell>
                    <TableCell>
                      <StatusPill tone={s.status === "active" ? "success" : s.status === "failed" ? "danger" : "warning"}>
                        {s.status}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${Number(s.selling_price_usd || 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "success" | "warning" | "danger" }) {
  const color = tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-600" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
