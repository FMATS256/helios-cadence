import { EmbeddedPageContext } from "@/components/enterprise";
import { MonitoringPage } from "@/components/techops/monitoring-section";
import { AlertsPage } from "@/components/techops/alerts-section";
import { ServiceMapPage } from "@/components/techops/service-map-section";
import { TelemetrySection, SocDashboard } from "@/components/techops/telemetry-section";
import { SocPage } from "@/components/techops/soc-section";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, DetailCard, ActionBar,
  StatusBadge, toneForStatus, RefreshButton, shortDate,
} from "@/components/enterprise";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, ShieldCheck, Siren, NotebookPen, RefreshCw, LifeBuoy } from "lucide-react";
import { getNocOverview, acknowledgeIncident, resolveIncident, addShiftNote } from "@/lib/noc.functions";
import { runAllChecksNow } from "@/lib/monitoring.functions";
import { DiagnosticsPanel, RemoteActionsPanel } from "@/components/noc-toolkit";
import { TicketWorkbench } from "@/components/techops/ticket-workbench";
import { AccountPortfolio } from "@/components/account-portfolio";

export const Route = createFileRoute("/noc")({
  head: () => ({
    meta: [
      { title: "NOC Command Centre — IMT Operations Platform" },
      { name: "description", content: "Live network operations centre: uptime, incidents, acknowledgements, servers and shift handover notes." },
      { property: "og:title", content: "NOC Command Centre — IMT Operations Platform" },
      { property: "og:description", content: "Live uptime, incidents and shift handover for the IMT network operations centre." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: string } => (typeof s.tab === "string" ? { tab: s.tab } : {}),
  component: NocPage,
});

function NocPage() {
  const { tab } = Route.useSearch();
  const qc = useQueryClient();
  const overviewFn = useServerFn(getNocOverview);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["noc-overview"],
    queryFn: async () => (await overviewFn()) as any,
    refetchInterval: 60_000,
  });

  const ackFn = useServerFn(acknowledgeIncident);
  const resolveFn = useServerFn(resolveIncident);
  const noteFn = useServerFn(addShiftNote);
  const runFn = useServerFn(runAllChecksNow);

  const [ackTarget, setAckTarget] = useState<any | null>(null);
  const [ackNote, setAckNote] = useState("");
  const [ackSeverity, setAckSeverity] = useState("major");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [shift, setShift] = useState("day");

  const refresh = () => qc.invalidateQueries({ queryKey: ["noc-overview"] });

  const ack = useMutation({
    mutationFn: () => ackFn({ data: { id: ackTarget.id, note: ackNote, severity: ackSeverity } }),
    onSuccess: () => { toast.success("Incident acknowledged"); setAckTarget(null); setAckNote(""); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });
  const resolveM = useMutation({
    mutationFn: (id: string) => resolveFn({ data: { id } }),
    onSuccess: () => { toast.success("Incident closed"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });
  const saveNote = useMutation({
    mutationFn: () => noteFn({ data: { note: noteText, shift } }),
    onSuccess: () => { toast.success("Shift note saved"); setNoteOpen(false); setNoteText(""); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });
  const runChecks = useMutation({
    mutationFn: () => runFn(),
    onSuccess: (r: any) => { toast.success(`Ran ${r?.ran ?? 0} checks`); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const stats = data?.stats;
  const checks: any[] = data?.checks ?? [];
  const incidents: any[] = data?.incidents ?? [];
  const openIncidents = useMemo(() => incidents.filter((i) => !i.ended_at), [incidents]);
  const tickets: any[] = data?.tickets ?? [];
  const servers: any[] = data?.servers ?? [];
  const notes: any[] = data?.notes ?? [];

  const chips = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Monitored", value: String(stats.monitored), color: "#1d4ed8" },
      { label: "Up", value: String(stats.up), color: "#15803d" },
      { label: "Down", value: String(stats.down), color: "#b91c1c" },
      { label: "Degraded", value: String(stats.degraded), color: "#b45309" },
      { label: "Open Incidents", value: String(stats.openIncidents), color: "#be123c" },
      { label: "Unacknowledged", value: String(stats.unacknowledged), color: "#7c2d12" },
      { label: "Uptime 24h", value: stats.uptime24h != null ? `${stats.uptime24h}%` : "—", color: "#0d9488" },
      { label: "Avg Latency", value: stats.avgLatency != null ? `${stats.avgLatency} ms` : "—", color: "#4338ca" },
      { label: "Open Tickets", value: String(stats.openTickets), color: "#7e22ce" },
      { label: "Critical Tickets", value: String(stats.criticalTickets), color: "#b91c1c" },
      { label: "Servers Running", value: `${stats.serversRunning}/${stats.serversTotal}`, color: "#0f766e" },
      { label: "Incidents 24h", value: String(stats.incidents24h), color: "#c2410c" },
    ];
  }, [stats]);

  return (
    <PageShell className="max-w-full">
      <SectionHeader
        eyebrow="Network Operations"
        title="NOC Command Centre"
        description="Live service health, incident acknowledgement and shift handover for the operations desk."
        actions={<RefreshButton onClick={refresh} loading={isFetching} />}
      />

      <StatChipRow chips={chips} cols={6} />

      <ActionBar
        actions={[
          { tone: "sky", icon: RefreshCw, label: runChecks.isPending ? "Running…" : "Run All Checks", onClick: () => runChecks.mutate(), disabled: runChecks.isPending },
          { tone: "rose", icon: Siren, label: "Acknowledge Next", onClick: () => {
              const next = openIncidents.find((i) => !i.acknowledged_at);
              if (!next) return toast.info("Nothing awaiting acknowledgement");
              setAckTarget(next); setAckSeverity(next.severity || "major");
            } },
          { tone: "indigo", icon: NotebookPen, label: "Shift Handover Note", onClick: () => setNoteOpen(true) },
        ]}
      />

      <Tabs defaultValue={tab ?? "telemetry"} className="min-w-0 max-w-full">
        <TabsList className="w-full max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
          <TabsTrigger value="workbench">Ticket Workbench</TabsTrigger>
          <TabsTrigger value="health">Service Health</TabsTrigger>
          <TabsTrigger value="uptime">Uptime Checks</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          <TabsTrigger value="remote">Remote Actions</TabsTrigger>
          <TabsTrigger value="accounts">Client accounts & access</TabsTrigger>
          {tickets.length > 0 && <TabsTrigger value="tickets">Open Tickets</TabsTrigger>}
          {servers.length > 0 && <TabsTrigger value="servers">Servers</TabsTrigger>}
          <TabsTrigger value="map">Service Map</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="handover">Shift Handover</TabsTrigger>
        </TabsList>

        <TabsContent value="telemetry" className="mt-4"><TelemetrySection /></TabsContent>
        <TabsContent value="workbench" className="mt-4"><TicketWorkbench /></TabsContent>
        <TabsContent value="health" className="mt-4">
          <DetailCard title="Monitored Endpoints" padded={false}>
            <DataGrid
              rows={checks}
              loading={isLoading}
              empty="No monitoring checks configured yet."
              columns={[
                { header: "Check", cell: (c: any) => <span className="font-medium">{c.name}</span> },
                { header: "Target", cell: (c: any) => <span className="text-xs text-muted-foreground">{c.target}</span> },
                { header: "Customer", cell: (c: any) => c.customers?.company_name ?? "—" },
                { header: "Status", cell: (c: any) => <StatusBadge tone={c.status === "up" ? "success" : c.status === "down" ? "danger" : "neutral"}>{c.status ?? "unknown"}</StatusBadge> },
                { header: "Uptime 24h", align: "right", cell: (c: any) => c.uptime_24h != null ? `${c.uptime_24h}%` : "—" },
                { header: "Avg ms", align: "right", cell: (c: any) => c.avg_ms_24h ?? "—" },
                { header: "Last Check", cell: (c: any) => shortDate(c.last_checked_at) },
              ]}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          <DetailCard title="Incident Log" padded={false}>
            <DataGrid
              rows={incidents}
              loading={isLoading}
              empty="No incidents recorded."
              columns={[
                { header: "Check", cell: (i: any) => <span className="font-medium">{i.monitoring_checks?.name ?? "—"}</span> },
                { header: "Severity", cell: (i: any) => <StatusBadge tone={i.severity === "critical" ? "danger" : i.severity === "minor" ? "info" : "warning"}>{i.severity ?? "major"}</StatusBadge> },
                { header: "Started", cell: (i: any) => shortDate(i.started_at) },
                { header: "State", cell: (i: any) => <StatusBadge tone={i.ended_at ? "success" : i.acknowledged_at ? "warning" : "danger"}>{i.ended_at ? "closed" : i.acknowledged_at ? "acknowledged" : "open"}</StatusBadge> },
                { header: "Error", cell: (i: any) => <span className="text-xs text-muted-foreground line-clamp-1">{i.last_error ?? "—"}</span> },
                {
                  header: "", align: "right",
                  cell: (i: any) => i.ended_at ? null : (
                    <div className="flex justify-end gap-2">
                      {!i.acknowledged_at && (
                        <Button size="sm" variant="outline" onClick={() => { setAckTarget(i); setAckSeverity(i.severity || "major"); }}>Ack</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => resolveM.mutate(i.id)}>Close</Button>
                    </div>
                  ),
                },
              ]}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="diagnostics" className="mt-4">
          <DiagnosticsPanel />
        </TabsContent>

        <TabsContent value="remote" className="mt-4">
          <RemoteActionsPanel />
        </TabsContent>
        <TabsContent value="accounts" className="mt-4"><AccountPortfolio noc /></TabsContent>

        {tickets.length > 0 && (
          <TabsContent value="tickets" className="mt-4">
            <DetailCard title="Open Support Tickets" padded={false}>
              <DataGrid
                rows={tickets}
                columns={[
                  { header: "Ticket", cell: (t: any) => <span className="font-medium">{t.ticket_number}</span> },
                  { header: "Subject", cell: (t: any) => t.subject },
                  { header: "Customer", cell: (t: any) => t.customers?.company_name ?? "—" },
                  { header: "Priority", cell: (t: any) => <StatusBadge tone={toneForStatus(t.priority)}>{t.priority}</StatusBadge> },
                  { header: "Status", cell: (t: any) => <StatusBadge tone={toneForStatus(t.status)}>{t.status}</StatusBadge> },
                  { header: "Opened", cell: (t: any) => shortDate(t.created_at) },
                ]}
              />
            </DetailCard>
          </TabsContent>
        )}

        {servers.length > 0 && (
          <TabsContent value="servers" className="mt-4">
            <DetailCard title="Cloud Servers" padded={false}>
              <DataGrid
                rows={servers}
                columns={[
                  { header: "Server", cell: (s: any) => <span className="font-medium">{s.name}</span> },
                  { header: "Provider", cell: (s: any) => s.provider ?? "—" },
                  { header: "IP", cell: (s: any) => s.ip_address ?? "—" },
                  { header: "Status", cell: (s: any) => <StatusBadge tone={toneForStatus(s.status)}>{s.status ?? "unknown"}</StatusBadge> },
                ]}
              />
            </DetailCard>
          </TabsContent>
        )}

        <EmbeddedPageContext.Provider value={true}>
          <TabsContent value="uptime" className="mt-4"><MonitoringPage /></TabsContent>
          <TabsContent value="alerts" className="mt-4"><AlertsPage /></TabsContent>
          <TabsContent value="map" className="mt-4 min-w-0 overflow-hidden rounded-lg border"><ServiceMapPage /></TabsContent>
          <TabsContent value="security" className="mt-4"><SocDashboard /><SocPage /></TabsContent>
        </EmbeddedPageContext.Provider>

        <TabsContent value="handover" className="mt-4">
          <DetailCard title="Shift Handover Notes" padded={false}>
            <DataGrid
              rows={notes}
              empty="No handover notes yet."
              columns={[
                { header: "Date", cell: (n: any) => `${n.shift_date} · ${n.shift}` },
                { header: "Author", cell: (n: any) => n.author_email ?? "—" },
                { header: "Note", cell: (n: any) => <span className="whitespace-pre-wrap text-sm">{n.note}</span> },
                { header: "Logged", cell: (n: any) => shortDate(n.created_at) },
              ]}
            />
          </DetailCard>
        </TabsContent>
      </Tabs>

      <Dialog open={!!ackTarget} onOpenChange={(o) => !o && setAckTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Acknowledge incident</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{ackTarget?.monitoring_checks?.name} — {ackTarget?.last_error ?? "unreachable"}</p>
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={ackSeverity} onValueChange={setAckSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["critical", "major", "minor"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea value={ackNote} onChange={(e) => setAckNote(e.target.value)} placeholder="What is being done about it?" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => ack.mutate()} disabled={ack.isPending}>{ack.isPending ? "Saving…" : "Acknowledge"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Shift handover note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Shift</Label>
              <Select value={shift} onValueChange={setShift}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["day", "night", "weekend"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea rows={5} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Outages, escalations, pending follow-ups…" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveNote.mutate()} disabled={saveNote.isPending}>{saveNote.isPending ? "Saving…" : "Save note"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!isLoading && !checks.length && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <LifeBuoy className="h-3.5 w-3.5" /> Add monitoring checks in the Monitoring module to populate the NOC.
        </p>
      )}
    </PageShell>
  );
}
