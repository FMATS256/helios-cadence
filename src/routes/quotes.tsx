import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getQuotesOverview } from "@/lib/finance.functions";
import { useCustomersLite } from "@/components/module-page";
import {
  PageShell, SectionHeader, KpiRow, DataGrid, StatusBadge, toneForStatus,
  EmptyState, type ColumnDef,
} from "@/components/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Download, FileSignature, CheckCircle2, Clock, AlertTriangle, Percent } from "lucide-react";
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
        {r.studio_pdf_url && (
          <a href={r.studio_pdf_url} target="_blank" rel="noreferrer" className="mt-1 block text-solar hover:underline">
            Open PDF
          </a>
        )}
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

      <NewQuoteDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        customers={customers}
        onCreated={() => qc.invalidateQueries({ queryKey: ["quotes-overview"] })}
      />
    </PageShell>
  );
}

function NewQuoteDialog({
  open, onOpenChange, customers, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customers: any[];
  onCreated: () => void;
}) {
  const empty = {
    customer_id: "", quote_number: "", title: "", amount: "0",
    currency: "USD", status: "draft", valid_until: "", notes: "",
  };
  const [form, setForm] = useState<any>(empty);
  const create = useMutation({
    mutationFn: async () => {
      if (!form.customer_id) throw new Error("Customer required");
      if (!form.title) throw new Error("Title required");
      const cust = customers.find((c) => c.id === form.customer_id);
      if (!cust) throw new Error("Customer not found");
      const { error } = await supabase.from("quotes").insert({
        customer_id: form.customer_id,
        account_number: cust.account_number,
        quote_number: form.quote_number || null,
        title: form.title,
        amount: Number(form.amount) || 0,
        currency: form.currency,
        status: form.status,
        valid_until: form.valid_until || null,
        notes: form.notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Quote created"); onCreated(); onOpenChange(false); setForm(empty); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setForm(empty); }}>
      <DialogTrigger asChild><span /></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New quote</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label>Customer *</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Quote number</Label><Input value={form.quote_number} onChange={(e) => setForm({ ...form, quote_number: e.target.value })} placeholder="Q-2026-001" /></div>
          <div className="space-y-2"><Label>Title *</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="space-y-2"><Label>Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-2"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} /></div>
          <div className="space-y-2"><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Valid until</Label><Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter className="col-span-2"><Button type="submit" disabled={create.isPending}>Create quote</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
