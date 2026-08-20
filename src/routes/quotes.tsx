import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQuotesOverview } from "@/lib/finance.functions";
import {
  pushQuoteToStudio, syncQuoteFromStudio, sendQuoteToCustomer, setQuoteOutcome,
  convertQuoteToInvoice, getQuoteDetail, quoteStudioStatus, getQuotePdf, shareQuoteExternally,
} from "@/lib/quotes.functions";
import { QuoteBuilderDialog } from "@/components/quote-builder";
import { useCustomersLite } from "@/components/module-page";
import {
  PageShell, SectionHeader, KpiRow, DataGrid, StatusBadge, toneForStatus,
  EmptyState, type ColumnDef,
} from "@/components/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Download, FileSignature, CheckCircle2, Clock, AlertTriangle, Percent, MessageCircle, Pencil } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["draft", "sent", "accepted", "rejected", "expired"];

export const Route = createFileRoute("/quotes")({
  head: () => ({ meta: [{ title: "Quotes — IMT Operations" }] }),
  component: QuotesPage,
});

const money = (n: number, cur = "USD") =>
  `${cur} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function QuotesPage() {
  const qc = useQueryClient();
  const { data: customers = [] } = useCustomersLite();
  const overview = useServerFn(getQuotesOverview);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openDialog, setOpenDialog] = useState(false);
  const [managed, setManaged] = useState<any | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["quotes-overview"],
    queryFn: () => overview({ data: {} }),
  });
  const quotes = (data?.quotes ?? []) as any[];
  const stats = data?.stats;

  const filtered = useMemo(() => {
    const now = Date.now();
    return quotes.filter((r) => {
      const expired = r.valid_until && new Date(r.valid_until).getTime() < now && r.status !== "accepted";
      if (tab === "pipeline" && !["draft", "sent"].includes(r.status)) return false;
      if (tab === "accepted" && r.status !== "accepted") return false;
      if (tab === "expired" && !expired) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!search) return true;
      const v = search.toLowerCase();
      return [r.title, r.quote_number, r.account_number, r.status, r.customers?.company_name]
        .some((f) => String(f ?? "").toLowerCase().includes(v));
    });
  }, [quotes, tab, statusFilter, search]);

  function exportCsv() {
    const headers = ["Quote #", "Title", "Account", "Customer", "Status", "Currency", "Amount", "Valid until", "Created"];
    const lines = [headers.join(",")].concat(
      filtered.map((r) => [
        r.quote_number ?? "", r.title, r.account_number, r.customers?.company_name ?? "",
        r.status, r.currency, r.amount ?? r.total ?? 0, r.valid_until ?? "",
        new Date(r.created_at).toISOString(),
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `quotes-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const now = Date.now();
  const columns: ColumnDef<any>[] = [
    { header: "Quote", cell: (r) => (
      <div className="min-w-0">
        <div className="font-semibold truncate">{r.title}</div>
        <div className="text-xs text-muted-foreground font-mono">{r.quote_number || "—"}</div>
      </div>
    ) },
    { header: "Customer", cell: (r) => (
      <div className="min-w-0">
        <div className="font-medium truncate">{r.customers?.company_name ?? "—"}</div>
        <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline">
          {r.account_number}
        </Link>
      </div>
    ) },
    { header: "Amount", align: "right", cell: (r) => <span className="font-mono font-semibold">{money(r.amount ?? r.total ?? 0, r.currency)}</span> },
    { header: "Status", cell: (r) => {
      const expired = r.valid_until && new Date(r.valid_until).getTime() < now && r.status !== "accepted";
      return <StatusBadge tone={toneForStatus(expired ? "expired" : r.status)}>{expired ? "expired" : r.status}</StatusBadge>;
    } },
    { header: "Valid until", cell: (r) => r.valid_until ? new Date(r.valid_until).toLocaleDateString() : "—" },
    { header: "Document", cell: (r) => (
      <div className="min-w-0 text-xs">
        <StatusBadge tone={toneForStatus(r.studio_status === "synced" ? "active" : r.studio_status === "failed" ? "failed" : "pending")}>
          {r.studio_status ?? "not generated"}
        </StatusBadge>
        {r.studio_document_id && <PdfLink id={r.id} className="mt-1 block text-solar hover:underline" />}
        {r.sent_at && <div className="mt-1 text-muted-foreground">Sent {new Date(r.sent_at).toLocaleDateString()}</div>}
      </div>
    ) },
    { header: "Created", cell: (r) => new Date(r.created_at).toLocaleDateString() },
    { header: "", align: "right", cell: (r) => (
      <Button size="sm" variant="outline" onClick={() => setManaged(r)}>Manage</Button>
    ) },
  ];

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Business"
        title="Quotes"
        description="Sales pipeline, proposal status and acceptance rate."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="h-4 w-4 mr-1.5" />Export CSV
            </Button>
            <Button onClick={() => setOpenDialog(true)} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              <Plus className="h-4 w-4 mr-1.5" />New quote
            </Button>
          </div>
        }
      />

      {stats && (
        <KpiRow
          items={[
            { icon: FileSignature, label: "Total quotes", value: String(stats.count), tone: "info" },
            { icon: Clock, label: "Pipeline", value: money(stats.pipeline), tone: "solar", hint: `${money(stats.sent)} sent` },
            { icon: CheckCircle2, label: "Accepted", value: money(stats.accepted), tone: "success", hint: `${stats.acceptedCount} won` },
            { icon: AlertTriangle, label: "Expired", value: money(stats.expired), tone: "danger", hint: `${stats.expiredCount} expired` },
            { icon: Percent, label: "Accept rate", value: `${stats.acceptRate}%`, tone: "warning" },
          ]}
        />
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
                <TabsTrigger value="accepted">Accepted</TabsTrigger>
                <TabsTrigger value="expired">Expired</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Title, quote #, account…" className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-32"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DataGrid
            rows={filtered}
            columns={columns}
            loading={isLoading}
            empty={<EmptyState icon={FileSignature} title="No quotes" description="Adjust filters or create a new quote to start selling." />}
          />
        </CardContent>
      </Card>

      <QuoteBuilderDialog
        open={openDialog}
        onOpenChange={(v) => { setOpenDialog(v); if (!v) setEditingId(null); }}
        customers={customers}
        quoteId={editingId}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["quotes-overview"] });
          if (editingId) qc.invalidateQueries({ queryKey: ["quote-detail", editingId] });
        }}
      />

      {managed && (
        <QuoteManageDialog
          quote={managed}
          onClose={() => setManaged(null)}
          onEdit={(id) => { setManaged(null); setEditingId(id); setOpenDialog(true); }}
          onDone={() => qc.invalidateQueries({ queryKey: ["quotes-overview"] })}
        />
      )}
    </PageShell>
  );
}

function downloadPdf(file: { filename: string; base64: string }) {
  const bin = atob(file.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function PdfLink({ id, className }: { id: string; className?: string }) {
  const fetchPdf = useServerFn(getQuotePdf);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { downloadPdf(await fetchPdf({ data: { id } }) as any); }
        catch (e: any) { toast.error(e.message); }
        finally { setBusy(false); }
      }}
    >
      {busy ? "Opening…" : "Open PDF"}
    </button>
  );
}

function QuoteManageDialog({ quote, onClose, onDone, onEdit }: { quote: any; onClose: () => void; onDone: () => void; onEdit: (id: string) => void }) {
  const push = useServerFn(pushQuoteToStudio);
  const sync = useServerFn(syncQuoteFromStudio);
  const send = useServerFn(sendQuoteToCustomer);
  const outcome = useServerFn(setQuoteOutcome);
  const convert = useServerFn(convertQuoteToInvoice);
  const detailFn = useServerFn(getQuoteDetail);
  const statusFn = useServerFn(quoteStudioStatus);
  const openPdf = useServerFn(getQuotePdf);

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: detail } = useQuery({
    queryKey: ["quote-detail", quote.id],
    queryFn: () => detailFn({ data: { id: quote.id } }),
  });
  const { data: studio } = useQuery({ queryKey: ["quote-studio-status"], queryFn: () => statusFn() });

  const row = detail?.quote ?? quote;
  const lines = detail?.lines ?? [];

  const run = useMutation({
    mutationFn: async ({ key, fn }: { key: string; fn: () => Promise<any> }) => {
      setBusy(key);
      return await fn();
    },
    onSuccess: (res: any, vars) => {
      setBusy(null);
      toast.success(
        vars.key === "convert" ? `Invoice ${res?.invoice_number} created` :
        vars.key === "send" ? `Quotation sent to ${res?.sent_to}` : "Quote updated",
      );
      onDone();
      if (vars.key === "convert") onClose();
    },
    onError: (e: Error) => { setBusy(null); toast.error(e.message); },
  });

  const act = (key: string, fn: () => Promise<any>) => run.mutate({ key, fn });
  const label = (key: string, text: string) => (busy === key ? "Working…" : text);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{row.title} · {row.quote_number || "no number"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/10 p-4 text-sm sm:grid-cols-4">
            <div><div className="text-xs text-muted-foreground">Status</div><StatusBadge tone={toneForStatus(row.status)}>{row.status}</StatusBadge></div>
            <div><div className="text-xs text-muted-foreground">Amount</div><div className="font-mono font-semibold">{money(row.amount ?? 0, row.currency)}</div></div>
            <div><div className="text-xs text-muted-foreground">Valid until</div><div>{row.valid_until ? new Date(row.valid_until).toLocaleDateString() : "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">Document</div><div>{row.studio_status ?? "not generated"}</div></div>
          </div>

          {row.studio_error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">{row.studio_error}</div>
          )}
          {studio && !studio.configured && (
            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              Quote Studio is not connected — documents will not be generated, but sending, acceptance and invoicing still work.
            </div>
          )}

          {lines.length > 0 && (
            <div className="rounded-xl border">
              <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Line items</div>
              <div className="divide-y">
                {lines.map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="truncate">{l.description}</span>
                    <span className="font-mono">{l.quantity} × {money(l.unit_price, row.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Send to</Label>
              <Input
                placeholder={row.customers?.primary_email ?? "customer@example.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Covering message</Label>
              <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional note for the customer" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={run.isPending} style={{ background: "#4f46e5", color: "#fff" }}
              onClick={() => act("push", () => push({ data: { id: row.id } }))}>
              {label("push", row.studio_document_id ? "Regenerate document" : "Generate document")}
            </Button>
            <Button size="sm" disabled={run.isPending || !row.studio_document_id} style={{ background: "#0ea5e9", color: "#fff" }}
              onClick={() => act("sync", () => sync({ data: { id: row.id } }))}>
              {label("sync", "Sync from Studio")}
            </Button>
            <Button size="sm" disabled={run.isPending} style={{ background: "#f59e0b", color: "#fff" }}
              onClick={() => act("send", () => send({ data: { id: row.id, email: email || undefined, message: message || undefined } }))}>
              {label("send", "Send to customer")}
            </Button>
            <Button size="sm" disabled={run.isPending || row.status === "accepted"} style={{ background: "#10b981", color: "#fff" }}
              onClick={() => act("accept", () => outcome({ data: { id: row.id, outcome: "accepted" } }))}>
              {label("accept", "Mark accepted")}
            </Button>
            <Button size="sm" disabled={run.isPending || row.status === "rejected"} style={{ background: "#f43f5e", color: "#fff" }}
              onClick={() => {
                const reason = window.prompt("Rejection reason") ?? undefined;
                if (reason === undefined) return;
                act("reject", () => outcome({ data: { id: row.id, outcome: "rejected", reason } }));
              }}>
              {label("reject", "Mark rejected")}
            </Button>
            <Button size="sm" disabled={run.isPending || row.status !== "accepted"} style={{ background: "#0f766e", color: "#fff" }}
              onClick={() => act("convert", () => convert({ data: { id: row.id } }))}>
              {label("convert", "Convert to invoice")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => openPdf({ data: { id: row.id } })
              .then((f: any) => downloadPdf(f))
              .catch((e: Error) => toast.error(e.message))}>
              Open PDF
            </Button>
          </div>
        </div>

        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
