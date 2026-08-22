import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, DetailCard, StatusBadge,
  toneForStatus, RefreshButton, EmptyState, ActionBar, shortDate,
} from "@/components/enterprise";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Siren, CheckCircle2, Search, UserPlus, RotateCcw, RefreshCw, Settings2 } from "lucide-react";
import { listAlerts, getAlert, alertAction, runAlertEvaluation, listAlertRules, saveAlertRule } from "@/lib/alerts.functions";

export const Route = createFileRoute("/techops/alerts")({
  head: () => ({
    meta: [
      { title: "Alert Console — IMT Technical Operations" },
      { name: "description", content: "Acknowledge, investigate and resolve infrastructure alerts across servers, hosting, storage, backups, VoIP and monitoring." },
      { property: "og:title", content: "Alert Console — IMT Technical Operations" },
      { property: "og:description", content: "Severity-graded operational alerting with full investigation workflow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("open");
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const listFn = useServerFn(listAlerts);
  const getFn = useServerFn(getAlert);
  const actFn = useServerFn(alertAction);
  const runFn = useServerFn(runAlertEvaluation);
  const rulesFn = useServerFn(listAlertRules);
  const saveRuleFn = useServerFn(saveAlertRule);

  const { data: alerts, isLoading, isFetching } = useQuery({
    queryKey: ["ops-alerts", statusFilter],
    queryFn: async () => (await listFn({ data: { status: statusFilter } })) as any[],
    refetchInterval: 60_000,
  });

  const { data: detail } = useQuery({
    queryKey: ["ops-alert", selected],
    queryFn: async () => (await getFn({ data: { id: selected! } })) as any,
    enabled: !!selected,
  });

  const { data: rules } = useQuery({
    queryKey: ["alert-rules"],
    queryFn: async () => (await rulesFn()) as any[],
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ops-alerts"] });
    if (selected) qc.invalidateQueries({ queryKey: ["ops-alert", selected] });
  };

  const act = useMutation({
    mutationFn: (vars: { id: string; action: any }) => actFn({ data: { ...vars, note: note || undefined } }),
    onSuccess: () => { toast.success("Alert updated"); setNote(""); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const evaluate = useMutation({
    mutationFn: () => runFn({ data: {} }),
    onSuccess: (r: any) => { toast.success(`Evaluated ${r?.evaluated ?? 0} signals · ${r?.opened ?? 0} opened, ${r?.resolved ?? 0} auto-resolved`); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveRule = useMutation({
    mutationFn: (vars: any) => saveRuleFn({ data: vars }),
    onSuccess: () => { toast.success("Rule saved"); qc.invalidateQueries({ queryKey: ["alert-rules"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const rows = alerts ?? [];
  const counts = (sev: string) => rows.filter((a: any) => a.severity === sev).length;

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Technical Operations"
        title="Alert Console"
        description="Every infrastructure signal in one queue: acknowledge, investigate, assign and resolve."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => evaluate.mutate()} disabled={evaluate.isPending}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {evaluate.isPending ? "Evaluating…" : "Run Evaluation"}
            </Button>
            <RefreshButton loading={isFetching} onClick={refresh} />
          </div>
        }
      />

      <StatChipRow
        cols={5}
        chips={[
          { label: "Critical", value: counts("critical"), color: "#dc2626" },
          { label: "High", value: counts("high"), color: "#ea580c" },
          { label: "Medium", value: counts("medium"), color: "#f59e0b", text: "#3b2600" },
          { label: "Low", value: counts("low"), color: "#0ea5e9" },
          { label: "Total", value: rows.length, color: "#4f46e5" },
        ]}
      />

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="open"><Siren className="h-3.5 w-3.5 mr-1.5" />Open</TabsTrigger>
          <TabsTrigger value="acknowledged">Acknowledged</TabsTrigger>
          <TabsTrigger value="investigating">Investigating</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="rules"><Settings2 className="h-3.5 w-3.5 mr-1.5" />Rules</TabsTrigger>
        </TabsList>

        {["open", "acknowledged", "investigating", "resolved", "all"].map((v) => (
          <TabsContent key={v} value={v} className="mt-4">
            <DetailCard title="Alerts" padded={false}>
              <DataGrid
                loading={isLoading}
                rows={rows}
                onRowClick={(r: any) => setSelected(r.id)}
                empty={<EmptyState title="No alerts" description="Nothing matches this filter right now." />}
                columns={[
                  { header: "Severity", cell: (r: any) => <StatusBadge tone={toneForStatus(r.severity)}>{r.severity}</StatusBadge> },
                  { header: "Alert", cell: (r: any) => <span className="font-medium">{r.title}</span> },
                  { header: "Source", cell: (r: any) => <span className="capitalize">{String(r.source).replace(/_/g, " ")}</span> },
                  { header: "Account", cell: (r: any) => r.account_number ?? "—" },
                  { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{String(r.status).replace(/_/g, " ")}</StatusBadge> },
                  { header: "First seen", cell: (r: any) => shortDate(r.first_seen_at) },
                  { header: "Last seen", cell: (r: any) => shortDate(r.last_seen_at) },
                ]}
              />
            </DetailCard>
          </TabsContent>
        ))}

        <TabsContent value="rules" className="mt-4">
          <DetailCard title="Alert rules" padded={false}>
            <DataGrid
              rows={(rules ?? []) as any[]}
              empty={<EmptyState title="No rules" description="Alert rules define severity and thresholds per signal." />}
              columns={[
                { header: "Rule", cell: (r: any) => <span className="font-medium">{r.name}</span> },
                { header: "Signal", cell: (r: any) => <span className="capitalize">{String(r.signal).replace(/_/g, " ")}</span> },
                { header: "Severity", cell: (r: any) => <StatusBadge tone={toneForStatus(r.severity)}>{r.severity}</StatusBadge> },
                {
                  header: "Threshold",
                  align: "right",
                  cell: (r: any) => (
                    <Input
                      className="h-8 w-24 ml-auto"
                      defaultValue={r.threshold ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const num = v === "" ? null : Number(v);
                        if (num !== r.threshold) saveRule.mutate({ id: r.id, threshold: num });
                      }}
                    />
                  ),
                },
                {
                  header: "Enabled",
                  align: "center",
                  cell: (r: any) => (
                    <Switch checked={r.enabled} onCheckedChange={(c) => saveRule.mutate({ id: r.id, enabled: c })} />
                  ),
                },
              ]}
            />
          </DetailCard>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setNote(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{detail?.alert?.title ?? "Alert"}</DialogTitle></DialogHeader>
          {detail?.alert && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={toneForStatus(detail.alert.severity)}>{detail.alert.severity}</StatusBadge>
                <StatusBadge tone={toneForStatus(detail.alert.status)}>{String(detail.alert.status).replace(/_/g, " ")}</StatusBadge>
                <StatusBadge>{String(detail.alert.source).replace(/_/g, " ")}</StatusBadge>
                {detail.alert.account_number && <StatusBadge tone="info">{detail.alert.account_number}</StatusBadge>}
              </div>
              {detail.alert.detail && <p className="text-sm text-muted-foreground">{detail.alert.detail}</p>}

              <ActionBar
                actions={[
                  { tone: "sky", icon: CheckCircle2, label: "Acknowledge", onClick: () => act.mutate({ id: detail.alert.id, action: "acknowledge" }) },
                  { tone: "indigo", icon: Search, label: "Investigate", onClick: () => act.mutate({ id: detail.alert.id, action: "investigate" }) },
                  { tone: "amber", icon: UserPlus, label: "Assign to me", onClick: () => act.mutate({ id: detail.alert.id, action: "assign" }) },
                  { tone: "emerald", icon: CheckCircle2, label: "Resolve", onClick: () => act.mutate({ id: detail.alert.id, action: "resolve" }) },
                  { tone: "slate", icon: RotateCcw, label: "Reopen", onClick: () => act.mutate({ id: detail.alert.id, action: "reopen" }) },
                ]}
                visibleCount={6}
              />

              <div className="space-y-2">
                <Label>Investigation note</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you find? What did you change?" />
                <Button size="sm" variant="outline" onClick={() => act.mutate({ id: detail.alert.id, action: "note" })} disabled={!note.trim()}>
                  Add note
                </Button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeline</p>
                {(detail.events ?? []).map((e: any) => (
                  <div key={e.id} className="text-sm border-l-2 border-border pl-3 py-1">
                    <span className="font-medium capitalize">{String(e.event_type).replace(/_/g, " ")}</span>
                    <span className="text-xs text-muted-foreground ml-2">{shortDate(e.created_at)}</span>
                    {e.note && <p className="text-xs text-muted-foreground">{e.note}</p>}
                  </div>
                ))}
                {!detail.events?.length && <p className="text-sm text-muted-foreground">No activity recorded yet.</p>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
