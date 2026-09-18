import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { DetailCard, StatusBadge, EmptyState, DataGrid, KpiRow, RefreshButton } from "@/components/enterprise";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, ShieldAlert, Bug, Gauge, ArrowUpRight, ArrowLeft, Clock } from "lucide-react";
import { listAssessments, getAssessment, updateFinding } from "@/lib/vapt.functions";

const riskTone = (r: string) =>
  r === "critical" || r === "high" ? "danger" : r === "medium" ? "warning" : r === "low" ? "solar" : "success";

const sevTone = (s: string) =>
  s === "critical" || s === "high" ? "danger" : s === "medium" ? "warning" : s === "low" ? "solar" : "info";

const statusTone = (s: string) =>
  s === "resolved" ? "success" : s === "in_progress" ? "info" : s === "risk_accepted" ? "solar" : "warning";

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "risk_accepted", label: "Risk accepted" },
];

const today = () => new Date().toISOString().slice(0, 10);

function clientLabel(row: any) {
  const c = row?.customers;
  return c ? c.company_name || c.contact_name || c.account_number : null;
}

function AssessmentDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getAssessment);
  const updateFn = useServerFn(updateFinding);
  const [note, setNote] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["vapt-assessment", id],
    queryFn: () => getFn({ data: { id } }) as Promise<any>,
  });

  const save = useMutation({
    mutationFn: (v: { id: string; status?: string; resolution_note?: string | null }) => updateFn({ data: v }) as Promise<any>,
    onSuccess: () => {
      toast.success("Remediation plan updated");
      qc.invalidateQueries({ queryKey: ["vapt-assessment", id] });
      qc.invalidateQueries({ queryKey: ["vapt-assessments"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not update the finding"),
  });

  if (isLoading || !data) {
    return <DetailCard title="Assessment"><p className="text-sm text-muted-foreground">Loading assessment…</p></DetailCard>;
  }

  const a = data.assessment;
  const label = clientLabel(a);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> All assessments
        </Button>
        {a.account_number && (
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link to="/customers/$accountNumber" params={{ accountNumber: a.account_number }}>
              {label ?? a.account_number} · Customer 360 <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </div>

      <KpiRow
        cols={4}
        items={[
          { label: "Risk level", value: a.risk_level, icon: ShieldAlert, tone: riskTone(a.risk_level) as any },
          { label: "Score", value: `${a.score}/100 · ${a.grade}`, icon: Gauge, tone: a.score >= 80 ? "success" : a.score >= 60 ? "warning" : "danger" },
          { label: "Open items", value: data.plan.open + data.plan.in_progress, icon: Bug, tone: data.plan.open > 0 ? "warning" : "success" },
          { label: "Overdue", value: data.plan.overdue, icon: Clock, tone: data.plan.overdue > 0 ? "danger" : "success" },
        ]}
      />

      <DetailCard title={`${a.target} · ${a.profile} scan · ${new Date(a.started_at).toLocaleString()}`}>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p><span className="text-muted-foreground">Client:</span> {label ?? "Unlinked asset"}</p>
          <p><span className="text-muted-foreground">Run by:</span> {a.run_by_email ?? "—"}</p>
          <p><span className="text-muted-foreground">Checks run:</span> {(a.checks_run ?? []).length}</p>
          <p><span className="text-muted-foreground">Duration:</span> {(a.duration_ms / 1000).toFixed(1)}s</p>
        </div>
        {!!(a.notes ?? []).length && (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {(a.notes as string[]).map((n, i) => <li key={i}>• {n}</li>)}
          </ul>
        )}
      </DetailCard>

      <DetailCard title={`Findings & remediation plan (${data.findings.length})`}>
        {data.findings.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No weaknesses recorded" description="Every check in this assessment passed." />
        ) : (
          <div className="space-y-3">
            {data.findings.map((f: any) => {
              const overdue = f.due_date && f.due_date < today() && f.status !== "resolved" && f.status !== "risk_accepted";
              return (
                <Card key={f.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={sevTone(f.severity) as any}>{f.severity}</StatusBadge>
                      <StatusBadge tone={statusTone(f.status) as any}>{f.status.replace("_", " ")}</StatusBadge>
                      <p className="font-semibold">{f.title}</p>
                      <span className="text-xs text-muted-foreground">{f.category}</span>
                      {f.due_date && (
                        <span className={`text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          due {f.due_date}{overdue ? " · overdue" : ""}
                        </span>
                      )}
                    </div>
                    {f.evidence && <p className="break-all font-mono text-xs text-muted-foreground">{f.evidence}</p>}
                    {f.impact && <p className="text-sm"><span className="font-medium">Impact:</span> {f.impact}</p>}
                    {f.remediation && <p className="text-sm"><span className="font-medium">Remediation:</span> {f.remediation}</p>}
                    {f.reference && <p className="text-xs text-muted-foreground">{f.reference}</p>}
                    {f.resolution_note && <p className="text-xs text-muted-foreground">Note: {f.resolution_note}</p>}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Select value={f.status} onValueChange={(v) => save.mutate({ id: f.id, status: v })}>
                        <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Textarea
                        value={note[f.id] ?? ""}
                        onChange={(e) => setNote({ ...note, [f.id]: e.target.value })}
                        placeholder="Remediation note for the client report"
                        className="min-h-[38px] flex-1 text-xs"
                      />
                      <Button
                        size="sm" variant="outline" className="h-8 text-xs"
                        disabled={save.isPending || !(note[f.id] ?? "").trim()}
                        onClick={() => save.mutate({ id: f.id, resolution_note: note[f.id] ?? null })}
                      >
                        Save note
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </DetailCard>
    </div>
  );
}

export function VaptAssessments({ accountNumber }: { accountNumber?: string | null }) {
  const listFn = useServerFn(listAssessments);
  const [risk, setRisk] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: rows = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["vapt-assessments", accountNumber ?? null, risk],
    queryFn: () => listFn({ data: { account_number: accountNumber ?? null, risk_level: risk } }) as Promise<any[]>,
    retry: false,
  });

  if (openId) return <AssessmentDetail id={openId} onBack={() => setOpenId(null)} />;

  const openItems = rows.reduce((n, r: any) => n + (r.open_findings ?? 0), 0);
  const highRisk = rows.filter((r: any) => r.risk_level === "critical" || r.risk_level === "high").length;

  return (
    <div className="space-y-4">
      <KpiRow
        cols={3}
        items={[
          { label: "Assessments logged", value: rows.length, icon: ShieldCheck, tone: "info" },
          { label: "High or critical risk", value: highRisk, icon: ShieldAlert, tone: highRisk > 0 ? "danger" : "success" },
          { label: "Open findings", value: openItems, icon: Bug, tone: openItems > 0 ? "warning" : "success" },
        ]}
      />

      <DetailCard
        title="Assessment history"
        padded={false}
        action={
          <div className="flex items-center gap-2">
            <Select value={risk} onValueChange={setRisk}>
              <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["all", "critical", "high", "medium", "low", "minimal"].map((r) => (
                  <SelectItem key={r} value={r}>{r === "all" ? "All risk levels" : r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <RefreshButton onClick={() => refetch()} loading={isFetching} />
          </div>
        }
      >
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading assessments…</p>
        ) : error ? (
          <p className="p-4 text-sm text-destructive">Could not load assessments: {(error as any)?.message}</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No assessments recorded yet"
            description="Run a scan from the VAPT scanner tab and it will be logged here with its findings and remediation plan."
          />
        ) : (
          <DataGrid
            rows={rows}
            columns={[
              { header: "Target", cell: (r: any) => <span className="font-medium">{r.target}</span> },
              {
                header: "Client",
                cell: (r: any) =>
                  r.account_number ? (
                    <Link
                      to="/customers/$accountNumber"
                      params={{ accountNumber: r.account_number }}
                      className="text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {clientLabel(r) ?? r.account_number}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Unlinked</span>
                  ),
              },
              { header: "Risk", cell: (r: any) => <StatusBadge tone={riskTone(r.risk_level) as any}>{r.risk_level}</StatusBadge> },
              { header: "Score", cell: (r: any) => `${r.score}/100 · ${r.grade}` },
              { header: "Findings", cell: (r: any) => `${r.findings_total} (${r.open_findings} open)` },
              { header: "Scanned", cell: (r: any) => new Date(r.started_at).toLocaleString() },
              {
                header: "",
                cell: (r: any) => (
                  <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setOpenId(r.id)}>
                    Plan <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                ),
              },
            ]}
          />
        )}
      </DetailCard>
    </div>
  );
}
