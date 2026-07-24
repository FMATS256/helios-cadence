import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getInvoicesOverview } from "@/lib/finance.functions";
import { useCustomersLite } from "@/components/module-page";
import {
  PageShell, SectionHeader, KpiRow, DataGrid, StatusBadge, toneForStatus,
  DetailCard, EmptyState, type ColumnDef,
} from "@/components/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Download, Receipt, AlertTriangle, TrendingUp, FileText, DollarSign } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["draft", "sent", "paid", "overdue", "void"];

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Invoices — IMT Operations" }] }),
  component: BillingPage,
});

const money = (n: number, cur = "USD") =>
  `${cur} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function BillingPage() {
  const qc = useQueryClient();
  const { data: customers = [] } = useCustomersLite();
  const overview = useServerFn(getInvoicesOverview);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openDialog, setOpenDialog] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["invoices-overview"],
    queryFn: () => overview({ data: {} }),
  });
  const invoices = (data?.invoices ?? []) as any[];
  const stats = data?.stats;

  const filtered = useMemo(() => {
    return invoices.filter((r) => {
      if (tab === "overdue" && !r.is_overdue) return false;
      if (tab === "outstanding" && (r.status === "paid" || (r.balance ?? 0) <= 0.001)) return false;
      if (tab === "paid" && !(r.status === "paid" || (r.balance ?? 0) <= 0.001)) return false;
      if (tab === "draft" && r.status !== "draft") return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!search) return true;
      const v = search.toLowerCase();
      return [r.invoice_number, r.account_number, r.status, r.customers?.company_name, r.notes]
        .some((f) => String(f ?? "").toLowerCase().includes(v));
    });
  }, [invoices, tab, statusFilter, search]);

  function exportCsv() {
    const headers = ["Invoice", "Account", "Customer", "Status", "Issued", "Due", "Currency", "Subtotal", "Tax", "Total", "Paid", "Balance"];
    const lines = [headers.join(",")].concat(
      filtered.map((r) => [
        r.invoice_number, r.account_number, r.customers?.company_name ?? "", r.status,
        r.issue_date, r.due_date ?? "", r.currency, r.subtotal, r.tax, r.total, r.paid_amount ?? 0, r.balance ?? 0,
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const columns: ColumnDef<any>[] = [
    { header: "Invoice #", cell: (r) => (
      <Link to="/invoices/$id" params={{ id: r.id }} className="font-mono font-semibold text-solar hover:underline">
        {r.invoice_number}
      </Link>
    ) },
    { header: "Customer", cell: (r) => (
      <div className="min-w-0">
        <div className="font-medium truncate">{r.customers?.company_name ?? "—"}</div>
        <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline">
          {r.account_number}
        </Link>
      </div>
    ) },
    { header: "Status", cell: (r) => (
      <StatusBadge tone={toneForStatus(r.is_overdue ? "overdue" : r.status)}>
        {r.is_overdue ? "overdue" : r.status}
      </StatusBadge>
    ) },
    { header: "Issued", cell: (r) => new Date(r.issue_date).toLocaleDateString() },
    { header: "Due", cell: (r) => r.due_date ? new Date(r.due_date).toLocaleDateString() : "—" },
    { header: "Total", align: "right", cell: (r) => <span className="font-mono font-semibold">{money(r.total, r.currency)}</span> },
    { header: "Paid", align: "right", cell: (r) => <span className="font-mono text-success">{money(r.paid_amount ?? 0, r.currency)}</span> },
    { header: "Balance", align: "right", cell: (r) => (
      <span className={`font-mono font-semibold ${(r.balance ?? 0) > 0.001 ? "text-destructive" : "text-muted-foreground"}`}>
        {money(r.balance ?? 0, r.currency)}
      </span>
    ) },
  ];

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Business"
        title="Invoices"
        description="Every invoice, balance and aging metric across the customer book."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="h-4 w-4 mr-1.5" />Export CSV
            </Button>
            <Button onClick={() => setOpenDialog(true)} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              <Plus className="h-4 w-4 mr-1.5" />New invoice
            </Button>
          </div>
        }
      />

      {stats && (
        <KpiRow
          items={[
            { icon: FileText, label: "Invoices", value: String(stats.count), tone: "info", hint: `${stats.paidCount} paid` },
            { icon: DollarSign, label: "Outstanding", value: money(stats.outstanding), tone: "solar" },
            { icon: AlertTriangle, label: "Overdue", value: money(stats.overdue), tone: "danger", hint: `${stats.overdueCount} invoices` },
            { icon: TrendingUp, label: "Paid this month", value: money(stats.paidMonth), tone: "success" },
            { icon: Receipt, label: "Draft", value: money(stats.draft), tone: "warning", hint: `${stats.draftCount} pending` },
          ]}
        />
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
                <TabsTrigger value="overdue">Overdue</TabsTrigger>
                <TabsTrigger value="paid">Paid</TabsTrigger>
                <TabsTrigger value="draft">Draft</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Invoice #, account, customer…" className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
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
            empty={<EmptyState icon={FileText} title="No invoices" description="Adjust filters or issue a new invoice to get started." />}
          />
        </CardContent>
      </Card>

      <NewInvoiceDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        customers={customers}
        onCreated={() => qc.invalidateQueries({ queryKey: ["invoices-overview"] })}
      />
    </PageShell>
  );
}

function NewInvoiceDialog({
  open, onOpenChange, customers, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customers: any[];
  onCreated: () => void;
}) {
  const empty = {
    customer_id: "", status: "draft",
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "", currency: "USD", subtotal: "0", tax: "0", notes: "",
  };
  const [form, setForm] = useState<any>(empty);
  const create = useMutation({
    mutationFn: async () => {
      if (!form.customer_id) throw new Error("Customer required");
      const cust = customers.find((c) => c.id === form.customer_id);
      if (!cust) throw new Error("Customer not found");
      const subtotal = Number(form.subtotal) || 0;
      const tax = Number(form.tax) || 0;
      const { error } = await supabase.from("invoices").insert({
        customer_id: form.customer_id,
        account_number: cust.account_number,
        status: form.status,
        issue_date: form.issue_date,
        due_date: form.due_date || null,
        currency: form.currency,
        subtotal, tax, total: subtotal + tax,
        notes: form.notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Invoice created"); onCreated(); onOpenChange(false); setForm(empty); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setForm(empty); }}>
      <DialogTrigger asChild><span /></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New invoice</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label>Customer *</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} /></div>
          <div className="space-y-2"><Label>Issue date</Label><Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></div>
          <div className="space-y-2"><Label>Due date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          <div className="space-y-2"><Label>Subtotal</Label><Input type="number" step="0.01" min="0" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })} /></div>
          <div className="space-y-2"><Label>Tax</Label><Input type="number" step="0.01" min="0" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter className="col-span-2"><Button type="submit" disabled={create.isPending}>Create invoice</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
