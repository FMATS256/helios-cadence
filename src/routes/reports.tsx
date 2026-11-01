import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, EmptyState, RefreshButton,
  ActionBar, StatusBadge, shortDate,
} from "@/components/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { runReport, emailReport } from "@/lib/reports.functions";
import { BarChart3, Download, Printer, Mail, Wallet, Receipt, Repeat, TrendingDown, LifeBuoy, Activity } from "lucide-react";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports & Exports — IMT Operations" },
      { name: "description", content: "Revenue, receivables, MRR, churn, SLA and service-health reports with CSV export and email delivery." },
      { property: "og:title", content: "Reports & Exports — IMT Operations" },
      { property: "og:description", content: "Live operational and financial reporting across the IMT Operations Platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const REPORTS = [
  { key: "revenue", title: "Revenue collected" },
  { key: "ar_ageing", title: "Receivables ageing" },
  { key: "mrr", title: "Monthly recurring revenue" },
  { key: "renewals", title: "Renewal pipeline" },
  { key: "churn", title: "Churn & retention" },
  { key: "tickets", title: "Support & SLA" },
  { key: "service_health", title: "Service health" },
] as const;

const ICONS: Record<string, any> = {
  revenue: Wallet,
  ar_ageing: Receipt,
  mrr: Repeat,
  renewals: Repeat,
  churn: TrendingDown,
  tickets: LifeBuoy,
  service_health: Activity,
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

function fmtCell(value: any, format?: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "money") return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (format === "number") return Number(value).toLocaleString();
  if (format === "percent") return `${Number(value).toFixed(1)}%`;
  if (format === "date") return shortDate(value as string);
  return String(value);
}

function toCsv(columns: any[], rows: any[]) {
  const esc = (v: any) => csvCell(v);
  return [
    columns.map((c) => esc(c.label)).join(","),
    ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(",")),
  ].join("\n");
}

function ReportsPage() {
  const [key, setKey] = useState<string>("revenue");
  const [from, setFrom] = useState(iso(new Date(Date.now() - 180 * 86_400_000)));
  const [to, setTo] = useState(iso(new Date()));
  const [emailOpen, setEmailOpen] = useState(false);
  const [recipient, setRecipient] = useState("");

  const run = useServerFn(runReport);
  const send = useServerFn(emailReport);

  const { data: report, isFetching, refetch } = useQuery({
    queryKey: ["report", key, from, to],
    queryFn: () => run({ data: { key, from, to } }),
  });

  const emailMut = useMutation({
    mutationFn: () => send({ data: { key, from, to, email: recipient } }),
    onSuccess: (r: any) => { toast.success(`Report emailed to ${r.sent_to}`); setEmailOpen(false); },
    onError: (e: any) => toast.error(e?.message ?? "Could not email the report"),
  });

  const columns = useMemo(
    () =>
      (report?.columns ?? []).map((c: any) => ({
        header: c.label,
        align: c.align ?? "left",
        cell: (row: any) =>
          c.key === "status" ? <StatusBadge>{String(row[c.key] ?? "—")}</StatusBadge> : fmtCell(row[c.key], c.format),
      })),
    [report],
  );

  const download = () => {
    if (!report) return;
    const blob = new Blob([toCsv(report.columns, report.rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${report.key}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("CSV exported");
  };

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Business Intelligence"
        title="Reports & Exports"
        description="Live reporting across revenue, receivables, recurring revenue, churn, support SLA and service health."
        actions={<RefreshButton onClick={() => void refetch()} loading={isFetching} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {REPORTS.map((r) => {
          const Icon = ICONS[r.key] ?? BarChart3;
          const active = key === r.key;
          return (
            <button
              key={r.key}
              onClick={() => setKey(r.key)}
              className={`p-3 border text-left transition ${active ? "border-solar bg-solar/10" : "border-border hover:bg-muted/40"}`}
            >
              <Icon className={`h-4 w-4 mb-2 ${active ? "text-solar" : "text-muted-foreground"}`} />
              <p className="text-xs font-semibold leading-tight">{r.title}</p>
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="flex-1" />
          <ActionBar
            actions={[
              { tone: "emerald", icon: Download, label: "Export CSV", onClick: download, disabled: !report?.rows?.length },
              { tone: "sky", icon: Printer, label: "Print / PDF", onClick: () => window.print(), disabled: !report?.rows?.length },
              { tone: "indigo", icon: Mail, label: "Email report", onClick: () => setEmailOpen(true), disabled: !report },
            ]}
          />
        </CardContent>
      </Card>

      {report && <StatChipRow chips={report.chips as any} cols={report.chips.length >= 5 ? 5 : 4} />}

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b border-border">
            <p className="font-display font-bold">{report?.title ?? "Report"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {report?.description} · {report?.rows?.length ?? 0} rows
              {report?.generated_at ? ` · generated ${new Date(report.generated_at).toLocaleString()}` : ""}
            </p>
          </div>
          <DataGrid
            rows={(report?.rows ?? []) as any[]}
            columns={columns as any}
            loading={isFetching && !report}
            keyOf={(_r, i) => i}
            empty={<EmptyState title="No data in this window" description="Adjust the date range or pick another report." icon={BarChart3} />}
          />
        </CardContent>
      </Card>

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Email “{report?.title}”</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Recipient email</Label>
            <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="finance@imtsolutions.co.zw" />
            <p className="text-xs text-muted-foreground">
              Sends the report headline metrics for {from} → {to}. Use Export CSV for the full row detail.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>Cancel</Button>
            <Button onClick={() => emailMut.mutate()} disabled={emailMut.isPending || !recipient}>
              {emailMut.isPending ? "Sending…" : "Send report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
