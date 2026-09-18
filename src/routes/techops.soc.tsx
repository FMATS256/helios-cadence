import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, DetailCard, StatusBadge,
  RefreshButton, EmptyState, KpiRow,
} from "@/components/enterprise";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldCheck, ShieldAlert, Siren, Plus, ArrowUpRight, Gauge } from "lucide-react";
import { socOverview, createIncident, incidentAction, escalatePostureSignal, getIncident } from "@/lib/soc.functions";
import { VaptScanner } from "@/components/vapt-scanner";
import { VaptAssessments } from "@/components/vapt-assessments";

export const Route = createFileRoute("/techops/soc")({
  head: () => ({
    meta: [
      { title: "SOC Command Centre — IMT Technical Operations" },
      { name: "description", content: "Live security posture scoring and the security incident queue for IMT client infrastructure, from detection through containment to root-cause closure." },
      { property: "og:title", content: "SOC Command Centre — IMT Technical Operations" },
      { property: "og:description", content: "Security posture signals and incident lifecycle management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SocPage,
});

const sevTone = (s: string) =>
  s === "critical" ? "danger" : s === "high" ? "warning" : s === "medium" ? "solar" : "info";
const statusTone = (s: string) =>
  s === "open" ? "danger" : s === "investigating" ? "warning" : s === "contained" ? "solar" : "success";

function SocPage() {
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", category: "other", severity: "medium" });

  const overviewFn = useServerFn(socOverview);
  const createFn = useServerFn(createIncident);
  const actionFn = useServerFn(incidentAction);
  const escalateFn = useServerFn(escalatePostureSignal);
  const detailFn = useServerFn(getIncident);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["soc-overview"],
    queryFn: async () => (await overviewFn()) as any,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["soc-overview"] });
    if (detailId) qc.invalidateQueries({ queryKey: ["soc-incident", detailId] });
  };

  const { data: detail } = useQuery({
    queryKey: ["soc-incident", detailId],
    queryFn: async () => (await detailFn({ data: { id: detailId! } })) as any,
    enabled: !!detailId,
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: form }),
    onSuccess: () => {
      toast.success("Incident raised");
      setOpenNew(false);
      setForm({ title: "", description: "", category: "other", severity: "medium" });
      refresh();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const escalate = useMutation({
    mutationFn: (s: any) =>
      escalateFn({ data: { key: s.key, label: s.label, severity: s.severity, detail: s.detail } }),
    onSuccess: () => { toast.success("Signal escalated to an incident"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const act = useMutation({
    mutationFn: (v: any) => actionFn({ data: v }),
    onSuccess: () => { toast.success("Incident updated"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const stats = data?.stats ?? { open: 0, critical: 0, investigating: 0, contained: 0, resolved30d: 0 };
  const signals = (data?.signals ?? []) as any[];
  const incidents = (data?.incidents ?? []) as any[];
  const staff = (data?.staff ?? []) as any[];

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Technical Operations"
        title="SOC Command Centre"
        description="Live security posture across client infrastructure plus the full incident lifecycle."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="mr-2 h-4 w-4" /> Raise incident
            </Button>
            <RefreshButton onClick={refresh} loading={isFetching} />
          </div>
        }
      />

      <StatChipRow
        cols={5}
        chips={[
          { label: "Open incidents", value: stats.open, color: "#e11d48" },
          { label: "Critical", value: stats.critical, color: "#be123c" },
          { label: "Investigating", value: stats.investigating, color: "#f59e0b" },
          { label: "Contained", value: stats.contained, color: "#4f46e5" },
          { label: "Resolved 30d", value: stats.resolved30d, color: "#059669" },
        ]}
      />

      <KpiRow
        cols={3}
        items={[
          { label: "Posture score", value: `${data?.score ?? 0}/100`, icon: Gauge, tone: (data?.score ?? 0) >= 80 ? "success" : (data?.score ?? 0) >= 60 ? "warning" : "danger" },
          { label: "Posture grade", value: data?.grade ?? "—", icon: ShieldCheck, tone: "info" },
          { label: "Active signals", value: signals.filter((s) => s.count > 0).length, icon: ShieldAlert, tone: "solar" },
        ]}
      />

      <Tabs defaultValue="posture">
        <TabsList>
          <TabsTrigger value="posture">Security posture</TabsTrigger>
          <TabsTrigger value="incidents">Incident queue</TabsTrigger>
          <TabsTrigger value="vapt">VAPT scanner</TabsTrigger>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
        </TabsList>

        <TabsContent value="posture" className="mt-4">
          {signals.filter((s) => s.count > 0).length === 0 ? (
            <DetailCard title="Security posture">
              <EmptyState icon={ShieldCheck} title="No posture issues detected" description="Credentials, backups, monitoring and licences all look healthy." />
            </DetailCard>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {signals.filter((s) => s.count > 0).map((s) => (
                <Card key={s.key}>
                  <CardContent className="p-4 sm:p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <StatusBadge tone={sevTone(s.severity) as any}>{s.severity}</StatusBadge>
                          <p className="font-semibold truncate">{s.label}</p>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{s.detail}</p>
                      </div>
                      <p className="font-display text-2xl font-bold tabular-nums">{s.count}</p>
                    </div>
                    {!!s.items?.length && (
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {s.items.slice(0, 5).map((it: any) => (
                          <li key={it.id} className="truncate">• {it.label}{it.sub ? ` — ${it.sub}` : ""}</li>
                        ))}
                      </ul>
                    )}
                    <Button
                      size="sm" variant="outline"
                      disabled={escalate.isPending}
                      onClick={() => escalate.mutate(s)}
                    >
                      <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" /> Escalate to incident
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          <DetailCard title="Security incidents" padded={false}>
            <DataGrid
              loading={isLoading}
              rows={incidents}
              onRowClick={(r: any) => setDetailId(r.id)}
              columns={[
                { header: "Title", cell: (r: any) => <span className="font-medium">{r.title}</span> },
                { header: "Category", cell: (r: any) => r.category ?? "—" },
                { header: "Severity", cell: (r: any) => <StatusBadge tone={sevTone(r.severity) as any}>{r.severity}</StatusBadge> },
                { header: "Status", cell: (r: any) => <StatusBadge tone={statusTone(r.status) as any}>{r.status}</StatusBadge> },
                { header: "Assignee", cell: (r: any) => r.assignee ?? "Unassigned" },
                { header: "Detected", cell: (r: any) => new Date(r.detected_at ?? r.created_at).toLocaleString() },
              ]}
              empty={<EmptyState icon={Siren} title="No security incidents" description="Escalate a posture signal or raise one manually." />}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="vapt" className="mt-4">
          <VaptScanner />
        </TabsContent>

        <TabsContent value="assessments" className="mt-4">
          <VaptAssessments />
        </TabsContent>
      </Tabs>

      {/* Raise incident */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Raise a security incident</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["phishing", "malware", "intrusion", "data_loss", "misconfiguration", "posture", "other"].map((c) => (
                      <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["critical", "high", "medium", "low"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>What happened?</Label>
              <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={!form.title.trim() || create.isPending}>Raise incident</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Incident detail */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detail?.incident?.title ?? "Incident"}</DialogTitle></DialogHeader>
          {detail && (
            <IncidentDetail
              detail={detail}
              staff={staff}
              pending={act.isPending}
              onAct={(v) => act.mutate({ id: detailId!, ...v })}
            />
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function IncidentDetail({
  detail, staff, pending, onAct,
}: {
  detail: any;
  staff: { id: string; name: string }[];
  pending: boolean;
  onAct: (v: Record<string, unknown>) => void;
}) {
  const inc = detail.incident;
  const [note, setNote] = useState("");
  const [rootCause, setRootCause] = useState(inc.root_cause ?? "");
  const [remediation, setRemediation] = useState(inc.remediation ?? "");
  const closing = ["resolved", "closed"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={sevTone(inc.severity) as any}>{inc.severity}</StatusBadge>
        <StatusBadge tone={statusTone(inc.status) as any}>{inc.status}</StatusBadge>
        <span className="text-xs text-muted-foreground">
          Detected {new Date(inc.detected_at ?? inc.created_at).toLocaleString()}
        </span>
      </div>

      {inc.description && <p className="text-sm text-muted-foreground">{inc.description}</p>}

      <div className="space-y-1.5">
        <Label>Assignee</Label>
        <Select
          value={inc.assigned_to ?? "unassigned"}
          onValueChange={(v) => onAct({ action: "assign", assigned_to: v === "unassigned" ? null : v })}
        >
          <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {(detail.nextStates ?? []).some((s: string) => closing.includes(s)) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Root cause</Label>
            <Textarea rows={3} value={rootCause} onChange={(e) => setRootCause(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Remediation</Label>
            <Textarea rows={3} value={remediation} onChange={(e) => setRemediation(e.target.value)} />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Add a note</Label>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm" variant="outline" disabled={!note.trim() || pending}
            onClick={() => { onAct({ action: "note", note }); setNote(""); }}
          >
            Add note
          </Button>
          {(detail.nextStates ?? []).map((s: string) => (
            <Button
              key={s} size="sm" disabled={pending}
              onClick={() =>
                onAct({
                  action: "status",
                  status: s,
                  note: note.trim() || undefined,
                  ...(closing.includes(s) ? { root_cause: rootCause, remediation } : {}),
                })
              }
            >
              Mark {s}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Timeline</p>
        <div className="space-y-2">
          {(detail.events ?? []).map((e: any) => (
            <div key={e.id} className="rounded-md border border-border p-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium capitalize">{String(e.event_type).replace(/_/g, " ")}</span>
                <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{e.actor}</p>
              {e.note && <p className="text-sm mt-1">{e.note}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
