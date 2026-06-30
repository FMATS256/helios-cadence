import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { getZohoStatus, getZohoDashboard, runZohoSync } from "@/lib/zoho.functions";
import { Loader2, RefreshCw, Plug, ExternalLink } from "lucide-react";

type SearchParams = { connected?: string; error?: string };

export const Route = createFileRoute("/zoho")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    connected: typeof s.connected === "string" ? s.connected : undefined,
    error: typeof s.error === "string" ? s.error : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Zoho Books — RoyEno CRM" },
      { name: "description", content: "Connect, sync, and visualize Zoho Books financial data inside the CRM." },
    ],
  }),
  component: ZohoPage,
});

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function ZohoPage() {
  const { connected, error } = useSearch({ from: "/zoho" });
  const qc = useQueryClient();
  const statusFn = useServerFn(getZohoStatus);
  const dashFn = useServerFn(getZohoDashboard);
  const syncFn = useServerFn(runZohoSync);

  const status = useQuery({ queryKey: ["zoho-status"], queryFn: () => statusFn({}) });
  const dash = useQuery({
    queryKey: ["zoho-dashboard"],
    queryFn: () => dashFn({}),
    enabled: !!status.data?.connected,
  });

  const sync = useMutation({
    mutationFn: (entity?: string) => syncFn({ data: { entity } }),
    onSuccess: (res) => {
      const errs = res.results.filter((r) => r.error);
      const ok = res.results.filter((r) => !r.error);
      const total = ok.reduce((s, r) => s + r.count, 0);
      if (errs.length === 0) toast.success(`Sync complete — ${total} records across ${ok.length} entities`);
      else toast.warning(`Sync finished with ${errs.length} errors — ${total} records synced`);
      qc.invalidateQueries({ queryKey: ["zoho-status"] });
      qc.invalidateQueries({ queryKey: ["zoho-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (connected) toast.success("Zoho Books connected");
    if (error) toast.error(`Zoho connection failed: ${error}`);
  }, [connected, error]);

  // Auto-sync every 15s while toggle is on and page is open
  const [autoSync, setAutoSync] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!autoSync || !status.data?.connected) return;
    const tick = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await syncFn({ data: {} });
        qc.invalidateQueries({ queryKey: ["zoho-status"] });
        qc.invalidateQueries({ queryKey: ["zoho-dashboard"] });
      } catch (e) {
        console.error("auto-sync error", e);
      } finally {
        inFlight.current = false;
      }
    };
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [autoSync, status.data?.connected, syncFn, qc]);

  const isConnected = !!status.data?.connected;
  const conn = status.data?.connection;
  const counts = status.data?.counts ?? {};
  const logs = status.data?.logs ?? [];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Finance Integrations"
        title="Zoho Books"
        description="OAuth 2.0 integration — sync customers, invoices, payments, expenses, and the full Zoho Books org into the CRM."
        actions={
          <div className="flex items-center gap-3">
            {isConnected && (
              <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
                <Switch id="auto-sync" checked={autoSync} onCheckedChange={setAutoSync} />
                <Label htmlFor="auto-sync" className="text-xs cursor-pointer whitespace-nowrap">
                  Auto-sync 15s
                </Label>
              </div>
            )}
            {isConnected ? (
              <Button
                onClick={() => sync.mutate(undefined)}
                disabled={sync.isPending}
                className="text-solar-foreground"
                style={{ background: "var(--gradient-solar)" }}
              >
                {sync.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Sync all data
              </Button>
            ) : (
              <Button asChild className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                <a href="/api/zoho/oauth/start">
                  <Plug className="h-4 w-4 mr-2" /> Connect Zoho Books
                </a>
              </Button>
            )}
          </div>
        }
      />

      {/* Connection card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display flex items-center gap-3">
            Connection
            <StatusPill tone={isConnected ? "success" : "neutral"}>
              {isConnected ? "Connected" : "Not connected"}
            </StatusPill>
          </CardTitle>
          {isConnected && (
            <Button variant="outline" size="sm" asChild>
              <a href="/api/zoho/oauth/start"><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Reconnect</a>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {status.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : isConnected ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Info label="Organization ID" value={conn?.organization_id ?? "—"} />
              <Info label="Region" value={`.${conn?.region ?? "com"}`} />
              <Info label="Token expires" value={conn?.expires_at ? new Date(conn.expires_at).toLocaleString() : "—"} />
              <Info label="Last updated" value={conn?.updated_at ? new Date(conn.updated_at).toLocaleString() : "—"} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Click <strong>Connect Zoho Books</strong> to authorize the CRM. You'll be redirected to Zoho and back automatically. Tokens are stored securely server-side and refreshed automatically.
            </p>
          )}
        </CardContent>
      </Card>

      {isConnected && (
        <Tabs defaultValue="overview" className="mt-2">
          <TabsList>
            <TabsTrigger value="overview">Financial Overview</TabsTrigger>
            <TabsTrigger value="entities">Synced Entities</TabsTrigger>
            <TabsTrigger value="logs">Sync Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Kpi label="Total Invoiced" value={fmt(dash.data?.kpis.totalInvoiced ?? 0)} />
              <Kpi label="Outstanding" value={fmt(dash.data?.kpis.totalOutstanding ?? 0)} tone="solar" />
              <Kpi label="Payments Received" value={fmt(dash.data?.kpis.totalPaid ?? 0)} />
              <Kpi label="Expenses" value={fmt(dash.data?.kpis.totalExpenses ?? 0)} />
            </div>
            <Card>
              <CardHeader><CardTitle className="font-display text-base">Revenue vs Expenses — last 6 months</CardTitle></CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.data?.monthly ?? []}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--solar))" radius={[6,6,0,0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--muted-foreground))" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entities" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entity</TableHead>
                      <TableHead className="text-right">Records</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ENTITY_ROWS.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell className="font-medium">{r.label}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {(counts[r.table] ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(r.key)}>
                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Sync
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No sync runs yet.</TableCell></TableRow>
                    )}
                    {logs.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.entity}</TableCell>
                        <TableCell>
                          <Badge variant={l.status === "success" ? "default" : l.status === "error" ? "destructive" : "secondary"}>
                            {l.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">{l.records_synced ?? 0}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(l.started_at).toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-destructive max-w-[300px] truncate">{l.error ?? ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </PageContainer>
  );
}

const ENTITY_ROWS: { key: string; label: string; table: string }[] = [
  { key: "customers", label: "Customers", table: "zoho_customers" },
  { key: "invoices", label: "Invoices", table: "zoho_invoices" },
  { key: "sales_orders", label: "Sales Orders", table: "zoho_sales_orders" },
  { key: "estimates", label: "Estimates / Quotes", table: "zoho_estimates" },
  { key: "payments", label: "Payments", table: "zoho_payments" },
  { key: "items", label: "Items / Products", table: "zoho_items" },
  { key: "expenses", label: "Expenses", table: "zoho_expenses" },
  { key: "credit_notes", label: "Credit Notes", table: "zoho_credit_notes" },
  { key: "vendors", label: "Vendors", table: "zoho_vendors" },
  { key: "organizations", label: "Organization Profile", table: "zoho_organizations" },
  { key: "taxes", label: "Taxes", table: "zoho_taxes" },
];

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium mt-1 break-all">{value}</p>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "solar" }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-2 text-2xl font-display font-bold ${tone === "solar" ? "text-solar" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
