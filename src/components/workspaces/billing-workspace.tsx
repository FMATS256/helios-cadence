import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getBillingWorkspace, getInvoiceForEdit, createInvoice, updateInvoice,
  issueInvoice, voidInvoice, requestInvoice, reviewInvoiceRequest, runRecurringBilling,
} from "@/lib/billing.functions";
import { emailInvoice } from "@/lib/finance.functions";
import { listCatalog } from "@/lib/catalog.functions";
import { CreditRequestList } from "@/components/workspaces/credit-requests";
import { useCustomersLite } from "@/components/module-page";
import {
  PageShell, SectionHeader, KpiRow, DataGrid, StatusBadge, toneForStatus,
  EmptyState, type ColumnDef,
} from "@/components/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, Download, Receipt, AlertTriangle, TrendingUp, FileText, DollarSign,
  MoreHorizontal, Send, Pencil, Ban, Repeat, Inbox, Trash2, RefreshCw, Loader2,
} from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["draft", "sent", "partial", "paid", "overdue", "void"];

const money = (n: number, cur = "USD") =>
  `${cur} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Line = { description: string; item_code: string; quantity: string; unit_price: string; billing_period_start?: string; billing_period_end?: string };
const blankLine = (): Line => ({ description: "", item_code: "", quantity: "1", unit_price: "0", billing_period_start: "", billing_period_end: "" });

function totalsOf(lines: Line[]) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let subtotal = 0;
  for (const l of lines) {
    subtotal += (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
  }
  return { subtotal: r2(subtotal), tax: 0, total: r2(subtotal) };
}

export function BillingPage() {
  const qc = useQueryClient();
  const load = useServerFn(getBillingWorkspace);
  const [tab, setTab] = useState("invoices");
  const [editor, setEditor] = useState<{ open: boolean; invoiceId?: string; prefill?: any }>({ open: false });
  const [requestOpen, setRequestOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["billing-workspace"],
    queryFn: () => load({ data: {} }),
  });
  const stats = data?.stats;
  const canManage = !!data?.canManage;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["billing-workspace"] });
    qc.invalidateQueries({ queryKey: ["invoices-overview"] });
    qc.invalidateQueries({ queryKey: ["payments-overview"] });
  };

  return (
    <PageShell className="sharp-corners">
      <SectionHeader
        eyebrow="Finance"
        title="Billing"
        description="Create, edit and issue invoices, work the request queue and run recurring billing."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setRequestOpen(true)}>
              <Inbox className="h-4 w-4 mr-1.5" />Request invoice
            </Button>
            {canManage && (
              <Button
                size="sm"
                onClick={() => setEditor({ open: true })}
                className="text-solar-foreground"
                style={{ background: "var(--gradient-solar)" }}
              >
                <Plus className="h-4 w-4 mr-1.5" />New invoice
              </Button>
            )}
          </div>
        }
      />

      {stats && (
        <KpiRow
          cols={6}
          items={[
            { icon: FileText, label: "Invoices", value: String(stats.count), tone: "info", hint: `${stats.paidCount} paid` },
            { icon: DollarSign, label: "Outstanding", value: money(stats.outstanding), tone: "solar" },
            { icon: AlertTriangle, label: "Overdue", value: money(stats.overdue), tone: "danger", hint: `${stats.overdueCount} invoices` },
            { icon: TrendingUp, label: "Paid this month", value: money(stats.paidMonth), tone: "success" },
            { icon: Receipt, label: "Drafts", value: money(stats.draft), tone: "warning", hint: `${stats.draftCount} pending` },
            { icon: Repeat, label: "Due to bill", value: String(stats.dueRecurring), tone: "info", hint: money(stats.dueRecurringValue) },
          ]}
        />
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="requests">
            Requests{stats?.pendingRequests ? ` (${stats.pendingRequests})` : ""}
          </TabsTrigger>
          <TabsTrigger value="recurring">
            Recurring{stats?.dueRecurring ? ` (${stats.dueRecurring})` : ""}
          </TabsTrigger>
          <TabsTrigger value="credits">Credits</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "invoices" && (
        <InvoiceList
          invoices={(data?.invoices ?? []) as any[]}
          loading={isLoading}
          canManage={canManage}
          onEdit={(id) => setEditor({ open: true, invoiceId: id })}
          onChanged={refresh}
        />
      )}
      {tab === "requests" && (
        <RequestList
          requests={(data?.requests ?? []) as any[]}
          loading={isLoading}
          canManage={canManage}
          onFulfil={(req) => setEditor({ open: true, prefill: req })}
          onChanged={refresh}
        />
      )}
      {tab === "recurring" && (
        <RecurringList
          rows={(data?.recurring ?? []) as any[]}
          loading={isLoading}
          canManage={canManage}
          onChanged={refresh}
        />
      )}
      {tab === "credits" && <CreditRequestList onChanged={refresh} />}

      {editor.open && (
        <InvoiceEditorDialog
          key={editor.invoiceId ?? editor.prefill?.id ?? "new"}
          invoiceId={editor.invoiceId}
          prefill={editor.prefill}
          onClose={() => setEditor({ open: false })}
          onSaved={refresh}
        />
      )}
      <RequestInvoiceDialog open={requestOpen} onOpenChange={setRequestOpen} onSaved={refresh} />
    </PageShell>
  );
}

/* ------------------------------ invoice list ------------------------------ */

function InvoiceList({
  invoices, loading, canManage, onEdit, onChanged,
}: {
  invoices: any[]; loading: boolean; canManage: boolean;
  onEdit: (id: string) => void; onChanged: () => void;
}) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [voidTarget, setVoidTarget] = useState<any>(null);
  const issue = useServerFn(issueInvoice);
  const sendInvoice = useServerFn(emailInvoice);

  const sendM = useMutation({
    mutationFn: (id: string) => sendInvoice({ data: { invoice_id: id } }),
    onSuccess: () => {
      toast.success("Invoice emailed to the customer");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const issueM = useMutation({
    mutationFn: (v: { id: string; send: boolean }) => issue({ data: { invoice_id: v.id, send_email: v.send } }),
    onSuccess: (res: any) => {
      toast.success(`Invoice ${res.invoiceNumber} issued${res.emailed ? " and emailed" : ""}`);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => invoices.filter((r) => {
    if (view === "overdue" && !r.is_overdue) return false;
    if (view === "outstanding" && (r.status === "paid" || r.status === "void" || (r.balance ?? 0) <= 0.001)) return false;
    if (view === "paid" && !(r.status === "paid" || (r.balance ?? 0) <= 0.001)) return false;
    if (view === "draft" && r.status !== "draft") return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search) return true;
    const v = search.toLowerCase();
    return [r.invoice_number, r.account_number, r.status, r.customers?.company_name, r.notes]
      .some((f) => String(f ?? "").toLowerCase().includes(v));
  }), [invoices, view, statusFilter, search]);

  function exportCsv() {
    const headers = ["Invoice", "Account", "Customer", "Status", "Issued", "Due", "Currency", "Subtotal", "Tax", "Total", "Paid", "Balance"];
    const lines = [headers.join(",")].concat(filtered.map((r) => [
      r.invoice_number, r.account_number, r.customers?.company_name ?? "", r.status,
      r.issue_date, r.due_date ?? "", r.currency, r.subtotal, r.tax, r.total, r.paid_amount ?? 0, r.balance ?? 0,
    ].map((c) => csvCell(c)).join(",")));
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
  if (canManage) {
    columns.push({
      header: "", align: "right", cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(r.id)} disabled={r.status === "void"}>
              <Pencil className="h-4 w-4 mr-2" />Edit invoice
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => issueM.mutate({ id: r.id, send: true })}
              disabled={r.status === "void" || r.status === "paid"}
            >
              <Send className="h-4 w-4 mr-2" />Issue &amp; email
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => issueM.mutate({ id: r.id, send: false })}
              disabled={r.status !== "draft"}
            >
              <Receipt className="h-4 w-4 mr-2" />Mark as issued
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setVoidTarget(r)}
              disabled={r.status === "void" || (r.paid_amount ?? 0) > 0.005}
              className="text-destructive"
            >
              <Ban className="h-4 w-4 mr-2" />Void invoice
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    });
  } else {
    // Account managers: view and send invoices billing has already approved.
    columns.push({
      header: "", align: "right", cell: (r) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => sendM.mutate(r.id)}
          disabled={sendM.isPending || r.status === "draft" || r.status === "void"}
          title={r.status === "draft" ? "Awaiting billing approval" : "Email this invoice to the customer"}
        >
          <Send className="h-4 w-4 mr-1.5" />Send
        </Button>
      ),
    });
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={view} onValueChange={setView}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
                <TabsTrigger value="overdue">Overdue</TabsTrigger>
                <TabsTrigger value="paid">Paid</TabsTrigger>
                <TabsTrigger value="draft">Draft</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-72">
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
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
                <Download className="h-4 w-4 mr-1.5" />CSV
              </Button>
            </div>
          </div>
          <DataGrid
            rows={filtered}
            columns={columns}
            loading={loading}
            empty={<EmptyState icon={FileText} title="No invoices" description="Adjust filters or create a new invoice to get started." />}
          />
        </CardContent>
      </Card>
      <VoidDialog invoice={voidTarget} onClose={() => setVoidTarget(null)} onDone={onChanged} />
    </>
  );
}

function VoidDialog({ invoice, onClose, onDone }: { invoice: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const call = useServerFn(voidInvoice);
  const m = useMutation({
    mutationFn: () => call({ data: { invoice_id: invoice.id, reason } }),
    onSuccess: () => { toast.success("Invoice voided"); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={!!invoice} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void invoice {invoice?.invoice_number}</DialogTitle>
          <DialogDescription>The invoice stays on record but stops counting towards receivables.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason *</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Duplicate, raised in error, superseded…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => m.mutate()} disabled={m.isPending || reason.trim().length < 4}>
            Void invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ invoice editor ------------------------------ */

function InvoiceEditorDialog({
  invoiceId, prefill, onClose, onSaved,
}: {
  invoiceId?: string; prefill?: any; onClose: () => void; onSaved: () => void;
}) {
  const navigate = useNavigate();
  const { data: customers = [] } = useCustomersLite();
  const loadOne = useServerFn(getInvoiceForEdit);
  const create = useServerFn(createInvoice);
  const update = useServerFn(updateInvoice);
  const loadCatalog = useServerFn(listCatalog);
  const { data: catalog = [] } = useQuery({ queryKey: ["invoice-catalog"], queryFn: () => loadCatalog() });

  const { data: existing, isLoading } = useQuery({
    queryKey: ["invoice-edit", invoiceId],
    queryFn: () => { if (!invoiceId) throw new Error("Invoice is required"); return loadOne({ data: { invoice_id: invoiceId } }); },
    enabled: !!invoiceId,
  });

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<any>(() => ({
    customer_id: prefill?.customer_id ?? "",
    issue_date: today,
    due_date: "",
    currency: prefill?.currency ?? "USD",
    notes: prefill?.description ?? "",
  }));
  const [lines, setLines] = useState<Line[]>(() => {
    const items = (prefill?.items ?? []) as any[];
    return items.length
      ? items.map((i) => ({
          description: String(i.description ?? ""),
          item_code: String(i.item_code ?? ""),
          billing_period_start: i.billing_period_start ?? "",
          billing_period_end: i.billing_period_end ?? "",
          quantity: String(i.quantity ?? 1),
          unit_price: String(i.unit_price ?? 0),
        }))
      : [blankLine()];
  });
  const [hydrated, setHydrated] = useState(false);

  if (existing && !hydrated) {
    setHydrated(true);
    const inv = (existing as any).invoice;
    setForm({
      customer_id: inv.customer_id,
      issue_date: inv.issue_date,
      due_date: inv.due_date ?? "",
      currency: inv.currency,
      notes: inv.notes ?? "",
    });
    const its = (existing as any).items as any[];
    setLines(its.length
      ? its.map((i) => ({
          description: i.description,
          item_code: String(i.item_code ?? ""),
          billing_period_start: i.billing_period_start ?? "",
          billing_period_end: i.billing_period_end ?? "",
          quantity: String(i.quantity),
          unit_price: String(i.unit_price),
        }))
      : [blankLine()]);
  }

  const locked = !!(existing as any)?.locked;
  const totals = totalsOf(lines);
  const payload = () => ({
    items: lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        description: l.description.trim(),
        item_code: l.item_code.trim() || undefined,
        billing_period_start: l.billing_period_start || null,
        billing_period_end: l.billing_period_end || null,
        quantity: Number(l.quantity) || 0,
        unit_price: Number(l.unit_price) || 0,
      })),
  });

  const save = useMutation({
    mutationFn: async (mode: "draft" | "issue") => {
      if (invoiceId) {
        return update({ data: {
          invoice_id: invoiceId,
          issue_date: form.issue_date,
          due_date: form.due_date,
          currency: form.currency,
          notes: form.notes,
          ...(locked ? {} : payload()),
        } });
      }
      if (!form.customer_id) throw new Error("Choose a customer");
      return create({ data: {
        customer_id: form.customer_id,
        issue_date: form.issue_date,
        due_date: form.due_date || undefined,
        currency: form.currency,
        notes: form.notes,
        status: mode === "issue" ? "sent" : "draft",
        send_email: mode === "issue",
        request_id: prefill?.id,
        ...payload(),
      } });
    },
    onSuccess: (res: any, mode) => {
      toast.success(invoiceId
        ? "Invoice updated"
        : mode === "issue"
          ? `Invoice ${res.invoice?.invoice_number} issued${res.emailed ? " and emailed" : ""}`
          : `Draft ${res.invoice?.invoice_number} created`);
      onSaved();
      onClose();
      const createdId = res?.invoice?.id;
      if (!invoiceId && createdId) {
        navigate({ to: "/invoices/$id", params: { id: createdId }, resetScroll: true });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{invoiceId ? "Edit invoice" : prefill ? `Invoice request — ${prefill.title}` : "New invoice"}</DialogTitle>
          <DialogDescription>
            {locked
              ? "Payments have been applied — only dates, currency and notes can change."
              : "Add line items; totals are calculated for you."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading invoice…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <Label>Customer *</Label>
                <Select
                  value={form.customer_id}
                  onValueChange={(v) => setForm({ ...form, customer_id: v })}
                  disabled={!!invoiceId}
                >
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {(customers as any[]).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Issue date</Label>
                <Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
              </div>
              <div className="space-y-2"><Label>Due date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div className="space-y-2"><Label>Currency</Label>
                <Input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
              </div>
              <div className="space-y-2"><Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Reference, PO number…" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line items</Label>
                {!locked && (
                  <div className="flex items-center gap-2">
                  <Select value="" onValueChange={(id) => {
                    const c: any = (catalog as any[]).find((x: any) => x.id === id);
                    if (!c) return;
                    const line = { description: `${c.name}${c.billing_cycle ? ` (${c.billing_cycle})` : ""}`, item_code: String(c.code ?? ""), quantity: "1", unit_price: String(c.unit_price ?? 0) };
                    const empty = lines.findIndex((x) => !x.description.trim());
                    setLines(empty >= 0 ? lines.map((x, j) => j === empty ? line : x) : [...lines, line]);
                  }}>
                    <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Add a service" /></SelectTrigger>
                    <SelectContent>
                      {(catalog as any[]).filter((c: any) => c.is_active !== false).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.category ? `${c.category} · ` : ""}{c.name} — {c.currency ?? "USD"} {Number(c.unit_price ?? 0).toFixed(2)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, blankLine()])}>
                    <Plus className="h-4 w-4 mr-1.5" />Add line
                  </Button>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {lines.map((l, i) => {
                  const lt = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
                  return (
                    <div key={i} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-12">
                      <Input
                        className="col-span-1 sm:col-span-2" placeholder="Item Code / SKU *" aria-label={`Item Code / SKU ${i + 1}`} required value={l.item_code} disabled={locked}
                        onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, item_code: e.target.value } : x))}
                      />
                      <Input
                        className="col-span-1 sm:col-span-4" placeholder="Description" value={l.description} disabled={locked}
                        onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                      />
                      <Input
                        className="col-span-1 sm:col-span-2" type="number" min="0" step="0.01" placeholder="Qty" value={l.quantity} disabled={locked}
                        onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                      />
                      <Input
                        className="col-span-1 sm:col-span-2" type="number" min="0" step="0.01" placeholder="Unit price" value={l.unit_price} disabled={locked}
                        onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unit_price: e.target.value } : x))}
                      />
                      <div className="col-span-1 text-right font-mono text-xs">{lt.toFixed(2)}</div>
                      <div className="col-span-2 text-right sm:col-span-1">
                        {!locked && lines.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                      <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-12">
                        <div className="space-y-1"><Label>Billing period start</Label><Input type="date" value={l.billing_period_start ?? ""} disabled={locked} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, billing_period_start: e.target.value } : x))} /></div>
                        <div className="space-y-1"><Label>Billing period end</Label><Input type="date" value={l.billing_period_end ?? ""} disabled={locked} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, billing_period_end: e.target.value } : x))} /></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{money(totals.subtotal, form.currency)}</span></div>
              <div className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>Total</span><span className="font-mono">{money(totals.total, form.currency)}</span></div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => save.mutate("draft")} disabled={save.isPending}>
            {invoiceId ? "Save changes" : "Save as draft"}
          </Button>
          {!invoiceId && (
            <Button onClick={() => save.mutate("issue")} disabled={save.isPending}>
              <Send className="h-4 w-4 mr-1.5" />Issue &amp; email
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ requests ------------------------------ */

function RequestList({
  requests, loading, canManage, onFulfil, onChanged,
}: {
  requests: any[]; loading: boolean; canManage: boolean;
  onFulfil: (req: any) => void; onChanged: () => void;
}) {
  const [view, setView] = useState("pending");
  const review = useServerFn(reviewInvoiceRequest);
  const [declineTarget, setDeclineTarget] = useState<any>(null);
  const [reason, setReason] = useState("");

  const declineM = useMutation({
    mutationFn: () => review({ data: { request_id: declineTarget.id, action: "decline", notes: reason } }),
    onSuccess: () => { toast.success("Request declined"); setDeclineTarget(null); setReason(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancelM = useMutation({
    mutationFn: (id: string) => review({ data: { request_id: id, action: "cancel" } }),
    onSuccess: () => { toast.success("Request cancelled"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = requests.filter((r) => view === "all" || r.status === view);

  const columns: ColumnDef<any>[] = [
    { header: "Requested", cell: (r) => (
      <div>
        <div className="font-medium">{r.title}</div>
        <div className="text-xs text-muted-foreground">{new Date(r.requested_at).toLocaleString()} · {r.requested_by_name}</div>
      </div>
    ) },
    { header: "Customer", cell: (r) => (
      <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="hover:underline">
        <div className="font-medium">{r.customers?.company_name ?? "—"}</div>
        <div className="font-mono text-xs text-solar">{r.account_number}</div>
      </Link>
    ) },
    { header: "Status", cell: (r) => <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge> },
    { header: "Needed by", cell: (r) => r.needed_by ? new Date(r.needed_by).toLocaleDateString() : "—" },
    { header: "Estimated", align: "right", cell: (r) => <span className="font-mono font-semibold">{money(r.estimated_amount, r.currency)}</span> },
    { header: "Invoice", cell: (r) => r.invoice_id
      ? <Link to="/invoices/$id" params={{ id: r.invoice_id }} className="font-mono text-solar hover:underline">view</Link>
      : <span className="text-muted-foreground">—</span> },
    { header: "", align: "right", cell: (r) => (
      <div className="flex justify-end gap-1">
        {canManage && (r.status === "pending" || r.status === "clarification") && (
          <>
            <Button size="sm" onClick={() => onFulfil(r)}>Create invoice</Button>
            <Button size="sm" variant="outline" onClick={() => setDeclineTarget(r)}>Decline</Button>
          </>
        )}
        {!canManage && r.status === "pending" && (
          <Button size="sm" variant="outline" onClick={() => cancelM.mutate(r.id)} disabled={cancelM.isPending}>Cancel</Button>
        )}
      </div>
    ) },
  ];

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4">
            <Tabs value={view} onValueChange={setView}>
              <TabsList>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="approved">Invoiced</TabsTrigger>
                <TabsTrigger value="declined">Declined</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <DataGrid
            rows={filtered}
            columns={columns}
            loading={loading}
            empty={<EmptyState icon={Inbox} title="No invoice requests" description="Account managers can request an invoice and billing raises it here." />}
          />
        </CardContent>
      </Card>

      <Dialog open={!!declineTarget} onOpenChange={(v) => { if (!v) { setDeclineTarget(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline request</DialogTitle>
            <DialogDescription>The requester is notified with your reason.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => declineM.mutate()} disabled={declineM.isPending || reason.trim().length < 4}>
              Decline request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RequestInvoiceDialog({
  open, onOpenChange, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const { data: customers = [] } = useCustomersLite();
  const call = useServerFn(requestInvoice);
  const empty = { customer_id: "", title: "", description: "", currency: "USD", estimated_amount: "", due_days: "14", needed_by: "" };
  const [form, setForm] = useState<any>(empty);
  const [lines, setLines] = useState<Line[]>([blankLine()]);

  const m = useMutation({
    mutationFn: () => call({ data: {
      customer_id: form.customer_id,
      title: form.title,
      description: form.description || undefined,
      currency: form.currency,
      estimated_amount: form.estimated_amount ? Number(form.estimated_amount) : undefined,
      due_days: Number(form.due_days) || 14,
      needed_by: form.needed_by || undefined,
      items: lines.filter((l) => l.description.trim()).map((l) => ({
        description: l.description.trim(),
        quantity: Number(l.quantity) || 1,
        unit_price: Number(l.unit_price) || 0,
      })),
    } }),
    onSuccess: () => {
      toast.success("Request sent to billing");
      setForm(empty); setLines([blankLine()]);
      onSaved(); onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request an invoice</DialogTitle>
          <DialogDescription>Billing reviews the request and raises the invoice.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Customer *</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {(customers as any[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>What should be invoiced? *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Starlink kit + first month" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label>Currency</Label>
              <Input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-2"><Label>Payment terms (days)</Label>
              <Input type="number" min="0" value={form.due_days} onChange={(e) => setForm({ ...form, due_days: e.target.value })} />
            </div>
            <div className="space-y-2"><Label>Needed by</Label>
              <Input type="date" value={form.needed_by} onChange={(e) => setForm({ ...form, needed_by: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Suggested lines</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, blankLine()])}>
                <Plus className="h-4 w-4 mr-1.5" />Add line
              </Button>
            </div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                <Input className="col-span-2 sm:col-span-6" placeholder="Description" value={l.description}
                  onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                <Input className="col-span-1 sm:col-span-2" type="number" min="0" placeholder="Qty" value={l.quantity}
                  onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                <Input className="col-span-1 sm:col-span-3" type="number" min="0" step="0.01" placeholder="Unit price" value={l.unit_price}
                  onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unit_price: e.target.value } : x))} />
                <div className="col-span-2 text-right sm:col-span-1">
                  {lines.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2"><Label>Notes for billing</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !form.customer_id || form.title.trim().length < 3}>
            Send to billing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ recurring ------------------------------ */

function RecurringList({
  rows, loading, canManage, onChanged,
}: { rows: any[]; loading: boolean; canManage: boolean; onChanged: () => void }) {
  const [view, setView] = useState("due");
  const [selected, setSelected] = useState<string[]>([]);
  const run = useServerFn(runRecurringBilling);

  const filtered = rows.filter((r) => view === "all" || r.due);
  const toggle = (id: string) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const runM = useMutation({
    mutationFn: (mode: "issue" | "draft") => run({ data: {
      ...(selected.length ? { subscription_ids: selected } : {}),
      issue: mode === "issue",
      send_email: mode === "issue",
    } }),
    onSuccess: (res: any) => {
      if (!res.created) toast.info(res.skipped ? `Nothing new to bill (${res.skipped} already billed today)` : "Nothing due to bill");
      else toast.success(`${res.created} invoice${res.created === 1 ? "" : "s"} created · ${res.emailed} emailed · total ${money(res.total)}`);
      if (res.errors?.length) toast.error(res.errors[0]);
      setSelected([]);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: ColumnDef<any>[] = [
    ...(canManage ? [{
      header: "", cell: (r: any) => (
        <Checkbox checked={selected.includes(r.id)} onCheckedChange={() => toggle(r.id)} aria-label="Select subscription" />
      ),
    } as ColumnDef<any>] : []),
    { header: "Plan", cell: (r) => (
      <div>
        <div className="font-medium">{r.plan_name}</div>
        <div className="text-xs text-muted-foreground">{r.billing_cycle}{r.description ? ` · ${r.description}` : ""}</div>
      </div>
    ) },
    { header: "Customer", cell: (r) => (
      <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="hover:underline">
        <div className="font-medium">{r.customers?.company_name ?? "—"}</div>
        <div className="font-mono text-xs text-solar">{r.account_number}</div>
      </Link>
    ) },
    { header: "Next renewal", cell: (r) => (
      <div>
        <div>{r.next_renewal ? new Date(r.next_renewal).toLocaleDateString() : "—"}</div>
        {r.days_to_renewal != null && (
          <div className={`text-xs ${r.due ? "text-destructive" : "text-muted-foreground"}`}>
            {r.due ? `${Math.abs(r.days_to_renewal)}d overdue` : `in ${r.days_to_renewal}d`}
          </div>
        )}
      </div>
    ) },
    { header: "Status", cell: (r) => <StatusBadge tone={r.due ? "warning" : "success"}>{r.due ? "due to bill" : "scheduled"}</StatusBadge> },
    { header: "Amount", align: "right", cell: (r) => <span className="font-mono font-semibold">{money(r.amount, r.currency)}</span> },
  ];

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="due">Due now</TabsTrigger>
              <TabsTrigger value="all">All recurring</TabsTrigger>
            </TabsList>
          </Tabs>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => runM.mutate("draft")} disabled={runM.isPending}>
                <FileText className="h-4 w-4 mr-1.5" />Create drafts
              </Button>
              <Button size="sm" onClick={() => runM.mutate("issue")} disabled={runM.isPending}>
                {runM.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                Run billing{selected.length ? ` (${selected.length})` : ""}
              </Button>
            </div>
          )}
        </div>
        <DataGrid
          rows={filtered}
          columns={columns}
          loading={loading}
          empty={<EmptyState icon={Repeat} title="Nothing due" description="Recurring subscriptions appear here as their renewal date arrives." />}
        />
      </CardContent>
    </Card>
  );
}
