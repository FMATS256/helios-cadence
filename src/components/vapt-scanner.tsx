import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { DetailCard, StatusBadge, EmptyState, KpiRow } from "@/components/enterprise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, ShieldCheck, Gauge, Bug, ArrowUpRight, ScanSearch, Download } from "lucide-react";
import { runVaptScan } from "@/lib/vapt.functions";
import { createIncident } from "@/lib/soc.functions";

type Severity = "critical" | "high" | "medium" | "low" | "info";

const sevTone = (s: Severity) =>
  s === "critical" ? "danger" : s === "high" ? "danger" : s === "medium" ? "warning" : s === "low" ? "solar" : "info";

const PROFILES = [
  { value: "quick", label: "Quick — transport & headers" },
  { value: "standard", label: "Standard — adds file exposure, email & DNS" },
  { value: "full", label: "Full — adds network service sweep" },
];

export function VaptScanner({ accountNumber }: { accountNumber?: string | null }) {
  const qc = useQueryClient();
  const scanFn = useServerFn(runVaptScan);
  const incidentFn = useServerFn(createIncident);

  const [target, setTarget] = useState("");
  const [profile, setProfile] = useState("standard");
  const [authorised, setAuthorised] = useState(false);
  const [report, setReport] = useState<any | null>(null);
  const [account, setAccount] = useState("");

  const scan = useMutation({
    mutationFn: () =>
      scanFn({
        data: {
          target,
          profile: profile as any,
          account_number: accountNumber ?? (account.trim() || null),
          authorised,
        },
      }) as Promise<any>,
    onSuccess: (r) => {
      setReport(r);
      qc.invalidateQueries({ queryKey: ["vapt-assessments"] });
      const crit = r.counts.critical + r.counts.high;
      crit > 0 ? toast.warning(`${crit} high-risk finding(s) — grade ${r.grade}`) : toast.success(`Assessment complete — grade ${r.grade}`);
    },
    onError: (e: any) => toast.error(e?.message || "Assessment failed"),
  });

  const raise = useMutation({
    mutationFn: (f: any) =>
      incidentFn({
        data: {
          title: `${f.title} — ${report?.target}`,
          description: [`Evidence: ${f.evidence}`, `Impact: ${f.impact}`, `Remediation: ${f.remediation}`, f.reference ? `Reference: ${f.reference}` : ""].filter(Boolean).join("\n\n"),
          category: "vulnerability",
          severity: f.severity === "info" ? "low" : f.severity,
          source: "vapt_scan",
          affected_asset: report?.target ?? null,
          impact: f.impact,
        },
      }) as Promise<any>,
    onSuccess: () => {
      toast.success("Incident raised in the SOC queue");
      qc.invalidateQueries({ queryKey: ["soc-overview"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not raise incident"),
  });

  const exportReport = () => {
    if (!report) return;
    const lines = [
      `IMT Solutions — Vulnerability Assessment Report`,
      `Target: ${report.target}`,
      `Started: ${new Date(report.startedAt).toLocaleString()}`,
      `Duration: ${(report.durationMs / 1000).toFixed(1)}s`,
      `Risk score: ${report.score}/100 (grade ${report.grade})`,
      ``,
      `Checks run: ${report.checksRun.join(", ")}`,
      ``,
      `FINDINGS (${report.findings.length})`,
      ...report.findings.flatMap((f: any) => [
        ``,
        `[${f.severity.toUpperCase()}] ${f.title}`,
        `Category: ${f.category}`,
        `Evidence: ${f.evidence}`,
        `Impact: ${f.impact}`,
        `Remediation: ${f.remediation}`,
        f.reference ? `Reference: ${f.reference}` : "",
      ]),
      ``,
      `NOTES`,
      ...report.notes.map((n: string) => `- ${n}`),
    ].filter((l: string) => l !== undefined);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vapt-${report.target}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const go = () => {
    if (!target.trim()) return toast.info("Enter a domain, host or URL to assess");
    if (!authorised) return toast.info("Confirm written authorisation before scanning");
    scan.mutate();
  };

  return (
    <div className="space-y-4">
      <DetailCard title="Vulnerability Assessment & Penetration Testing">
        <div className="grid gap-3 sm:grid-cols-[1fr_260px]">
          <div className="space-y-1.5">
            <Label>Target domain, host or URL</Label>
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go()}
              placeholder="client-domain.co.zw or https://portal.client.co.zw"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Scan profile</Label>
            <Select value={profile} onValueChange={setProfile}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROFILES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!accountNumber && (
          <div className="mt-3 space-y-1.5">
            <Label>Client account number (optional — links the report to Customer 360)</Label>
            <Input
              value={account}
              onChange={(e) => setAccount(e.target.value.toUpperCase())}
              placeholder="M10457"
              className="h-11 sm:max-w-[260px]"
            />
          </div>
        )}

        <label className="mt-4 flex items-start gap-2.5 rounded-lg border p-3 text-sm">
          <Checkbox checked={authorised} onCheckedChange={(v) => setAuthorised(v === true)} className="mt-0.5" />
          <span className="text-muted-foreground">
            I confirm IMT has written authorisation to test this target. Checks are read-only —
            no exploitation, brute forcing or payload injection is performed.
          </span>
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={go} disabled={scan.isPending} className="gap-2">
            <ScanSearch className="h-4 w-4" />
            {scan.isPending ? "Assessing…" : "Run assessment"}
          </Button>
          {report && (
            <Button variant="outline" onClick={exportReport} className="gap-2">
              <Download className="h-4 w-4" /> Export report
            </Button>
          )}
        </div>
      </DetailCard>

      {scan.isPending && (
        <DetailCard title="Assessment running">
          <p className="text-sm text-muted-foreground">
            Probing {target} — transport security, headers, exposed files, email and DNS posture
            {profile === "full" ? " and network services" : ""}. This can take up to a minute.
          </p>
        </DetailCard>
      )}

      {report && !scan.isPending && (
        <>
          <KpiRow
            cols={4}
            items={[
              { label: "Risk score", value: `${report.score}/100`, icon: Gauge, tone: report.score >= 80 ? "success" : report.score >= 60 ? "warning" : "danger" },
              { label: "Grade", value: report.grade, icon: ShieldCheck, tone: "info" },
              { label: "Critical / high", value: report.counts.critical + report.counts.high, icon: ShieldAlert, tone: report.counts.critical + report.counts.high > 0 ? "danger" : "success" },
              { label: "Total findings", value: report.findings.length, icon: Bug, tone: "solar" },
            ]}
          />

          <DetailCard title={`Findings — ${report.target} · ${report.checksRun.length} checks in ${(report.durationMs / 1000).toFixed(1)}s`}>
            {report.findings.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="No weaknesses detected" description="Every executed check passed for this target." />
            ) : (
              <div className="space-y-3">
                {report.findings.map((f: any) => (
                  <Card key={f.id}>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={sevTone(f.severity) as any}>{f.severity}</StatusBadge>
                        <p className="font-semibold">{f.title}</p>
                        <span className="text-xs text-muted-foreground">{f.category}</span>
                      </div>
                      <p className="break-all font-mono text-xs text-muted-foreground">{f.evidence}</p>
                      <p className="text-sm"><span className="font-medium">Impact:</span> {f.impact}</p>
                      <p className="text-sm"><span className="font-medium">Fix:</span> {f.remediation}</p>
                      {f.reference && <p className="text-xs text-muted-foreground">{f.reference}</p>}
                      <Button
                        size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs"
                        disabled={raise.isPending}
                        onClick={() => raise.mutate(f)}
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" /> Raise as incident
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </DetailCard>

          {!!report.notes.length && (
            <DetailCard title="Engineer notes">
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {report.notes.map((n: string, i: number) => <li key={i}>• {n}</li>)}
              </ul>
            </DetailCard>
          )}
        </>
      )}
    </div>
  );
}
