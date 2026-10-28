import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, DetailCard, StatusBadge, toneForStatus,
} from "@/components/enterprise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark, Truck, BookOpen, BarChart3, Download, CheckCircle2, XCircle, Banknote, Wallet } from "lucide-react";
import { fmtCurrency } from "@/lib/currency.shared";
import { getMoneyWorkspace, payPurchaseOrder, decideExpense } from "@/lib/money.functions";
import { cn } from "@/lib/utils";

export type MoneySection = "banking" | "payables" | "ledger" | "reports";

const usd = (n: number) => fmtCurrency(n, "USD");
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

function download(name: string, rows: Record<string, any>[]) {
  const csv = toCsv(rows);
  if (!csv) { toast.error("Nothing to export"); return; }
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

const SECTION_META: Record<MoneySection, { eyebrow: string; title: string; description: string }> = {
  banking: {
    eyebrow: "Finance", title: "Banking & Reconciliation",
    description: "Live cash and bank balances, every movement, and payments still waiting to be matched to an invoice.",
  },
  payables: {
    eyebrow: "Finance", title: "Accounts Payable",
    description: "What we owe suppliers — outstanding purchase orders by vendor plus expense claims awaiting approval.",
  },
  ledger: {
    eyebrow: "Finance", title: "General Ledger",
    description: "Every money movement across invoices, payments, refunds, credits, expenses and cash — normalised to USD.",
  },
  reports: {
    eyebrow: "Finance", title: "Financial Reports",
    description: "Profit & loss, receivables ageing, revenue by account manager, branch rollups and project budget vs actual.",
  },
};

export function MoneyPage({ section }: { section: MoneySection }) {
  const qc = useQueryClient();
  const fn = useServerFn(getMoneyWorkspace);
  const { data, isLoading, error } = useQuery({
    queryKey: ["money-workspace"],
    queryFn: async () => (await fn()) as any,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["money-workspace"] });
  const meta = SECTION_META[section];

  const chips = useMemo(() => {
    const s = data?.stats;
    if (!s) return [];
    return [
      { label: "Cash in Hand", value: usd(s.cashInHand), color: "#0d9488" },
      { label: "Bank Balance", value: usd(s.bankBalance), color: "#1d4ed8" },
      { label: "Receivable", value: usd(s.receivable), color: "#b45309" },
      { label: "Payable", value: usd(s.payable), color: "#b91c1c" },
      { label: "Recurring / mo", value: usd(s.mrr), color: "#4338ca" },
      { label: "Net Position", value: usd(s.netPosition), color: "#15803d" },
    ];
  }, [data]);

  return (
    <PageShell className="sharp-corners">
      <SectionHeader eyebrow={meta.eyebrow} title={meta.title} description={meta.description} />
      {error ? (
        <DetailCard title="Access">
          <p className="text-sm text-muted-foreground">{(error as any)?.message || "Unable to load finance data."}</p>
        </DetailCard>
      ) : (
        <>
          <StatChipRow chips={chips} cols={6} />
          {section === "banking" && <Banking data={data} loading={isLoading} />}
          {section === "payables" && <Payables data={data} loading={isLoading} onDone={refresh} />}
          {section === "ledger" && <Ledger data={data} loading={isLoading} />}
          {section === "reports" && <Reports data={data} loading={isLoading} />}
        </>
      )}
    </PageShell>
  );
}

// ---------- Banking --------------------------------------------------------

function Banking({ data, loading }: { data: any; loading: boolean }) {
  const accounts: any[] = data?.banking?.accounts ?? [];
  const movements: any[] = data?.banking?.movements ?? [];
  const unreconciled: any[] = data?.banking?.unreconciled ?? [];
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {accounts.map((a) => (
          <DetailCard key={a.id} title={a.name}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{a.kind} · {a.currency}</p>
                <p className="font-display text-2xl font-bold mt-2 tabular-nums">{fmtCurrency(a.balance, a.currency)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Opening {fmtCurrency(a.opening_balance, a.currency)} · Spent {fmtCurrency(a.spent, a.currency)}
                </p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-solar/15 text-solar flex items-center justify-center">
                {a.kind === "cash" ? <Banknote className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
              </div>
            </div>
          </DetailCard>
        ))}
      </div>

      <DetailCard
        title={`Unmatched Payments (${unreconciled.length})`}
        padded={false}
        action={
          <Button size="sm" variant="outline" onClick={() => download("unmatched-payments.csv", unreconciled.map((p) => ({
            receipt: p.receipt_number, customer: p.customer, account: p.account_number, amount: p.amount,
            currency: p.currency, method: p.method, reference: p.reference, paid_at: p.paid_at, unapplied: p.unapplied,
          })))}>
            <Download className="h-3.5 w-3.5 mr-1.5" />Export
          </Button>
        }
      >
        <DataGrid
          rows={unreconciled}
          loading={loading}
          empty="Every payment is matched to an invoice."
          columns={[
            { header: "Date", cell: (r: any) => fmtDate(r.paid_at) },
            { header: "Customer", cell: (r: any) => (
              <div><p className="font-medium">{r.customer}</p><p className="text-xs text-muted-foreground">{r.account_number ?? "—"}</p></div>
            ) },
            { header: "Method", cell: (r: any) => <span className="capitalize">{r.method ?? "—"}</span> },
            { header: "Reference", cell: (r: any) => r.reference ?? r.receipt_number ?? "—" },
            { header: "Received", align: "right", cell: (r: any) => <span className="font-mono">{fmtCurrency(r.amount, r.currency)}</span> },
            { header: "Unapplied", align: "right", cell: (r: any) => <span className="font-mono text-[oklch(0.62_0.19_45)]">{fmtCurrency(r.unapplied, r.currency)}</span> },
            { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.reconciliation_status ?? "pending")}>{r.reconciliation_status ?? "pending"}</StatusBadge> },
          ]}
        />
      </DetailCard>

      <DetailCard title="Cash Movements" padded={false}>
        <DataGrid
          rows={movements}
          loading={loading}
          empty="No cash movements recorded."
          columns={[
            { header: "Date", cell: (r: any) => new Date(r.occurred_at).toLocaleString() },
            { header: "Account", cell: (r: any) => r.cash_accounts?.name ?? "—" },
            { header: "Type", cell: (r: any) => <StatusBadge tone={r.kind === "deposit" ? "success" : "warning"}>{r.kind}</StatusBadge> },
            { header: "Reference", cell: (r: any) => r.reference ?? "—" },
            { header: "Amount", align: "right", cell: (r: any) => <span className="font-mono">{fmtCurrency(r.amount, r.currency)}</span> },
          ]}
        />
      </DetailCard>
    </>
  );
}

// ---------- Payables -------------------------------------------------------

function Payables({ data, loading, onDone }: { data: any; loading: boolean; onDone: () => void }) {
  const orders: any[] = data?.payables?.orders ?? [];
  const byVendor: any[] = data?.payables?.byVendor ?? [];
  const pending: any[] = data?.payables?.pendingExpenses ?? [];
  const accounts: any[] = data?.banking?.accounts ?? [];
  const [paying, setPaying] = useState<any | null>(null);

  const decideFn = useServerFn(decideExpense);
  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "approve" | "reject" }) => decideFn({ data: v }),
    onSuccess: (_r, v) => { toast.success(v.decision === "approve" ? "Expense approved" : "Expense rejected"); onDone(); },
    onError: (e: any) => toast.error(e?.message || "Could not update expense"),
  });

  return (
    <>
      <DetailCard title="Owed by Vendor" padded={false}>
        <DataGrid
          rows={byVendor}
          loading={loading}
          empty="Nothing outstanding with suppliers."
          columns={[
            { header: "Vendor", cell: (r: any) => <span className="font-medium">{r.name}</span> },
            { header: "Terms", cell: (r: any) => r.terms ?? "—" },
            { header: "Open orders", align: "right", cell: (r: any) => r.count },
            { header: "Outstanding", align: "right", cell: (r: any) => <span className="font-mono font-semibold">{usd(r.outstanding_usd)}</span> },
          ]}
        />
      </DetailCard>

      <DetailCard
        title={`Open Purchase Orders (${orders.length})`}
        padded={false}
        action={
          <Button size="sm" variant="outline" onClick={() => download("payables.csv", orders.map((o) => ({
            po: o.po_number, vendor: o.vendors?.name, status: o.status, order_date: o.order_date,
            currency: o.currency, total: o.total, paid_usd: o.paid_usd, outstanding_usd: o.outstanding_usd,
          })))}>
            <Download className="h-3.5 w-3.5 mr-1.5" />Export
          </Button>
        }
      >
        <DataGrid
          rows={orders}
          loading={loading}
          empty="No unpaid purchase orders."
          columns={[
            { header: "PO", cell: (r: any) => (
              <div><p className="font-medium">{r.po_number}</p><p className="text-xs text-muted-foreground">{r.lines} line{r.lines === 1 ? "" : "s"}</p></div>
            ) },
            { header: "Vendor", cell: (r: any) => r.vendors?.name ?? "—" },
            { header: "Ordered", cell: (r: any) => fmtDate(r.order_date) },
            { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge> },
            { header: "Total", align: "right", cell: (r: any) => <span className="font-mono">{fmtCurrency(r.total, r.currency)}</span> },
            { header: "Paid", align: "right", cell: (r: any) => <span className="font-mono text-success">{usd(r.paid_usd)}</span> },
            { header: "Outstanding", align: "right", cell: (r: any) => <span className="font-mono font-semibold">{usd(r.outstanding_usd)}</span> },
            { header: "", align: "right", cell: (r: any) => (
              <Button size="sm" variant="outline" onClick={() => setPaying(r)}>Settle</Button>
            ) },
          ]}
        />
      </DetailCard>

      <DetailCard title={`Expense Claims Awaiting Approval (${pending.length})`} padded={false}>
        <DataGrid
          rows={pending}
          loading={loading}
          empty="No expense claims waiting."
          columns={[
            { header: "Date", cell: (r: any) => fmtDate(r.expense_date) },
            { header: "Description", cell: (r: any) => (
              <div><p className="font-medium">{r.description}</p><p className="text-xs text-muted-foreground capitalize">{r.category}{r.vendors?.name ? ` · ${r.vendors.name}` : r.vendor ? ` · ${r.vendor}` : ""}</p></div>
            ) },
            { header: "Amount", align: "right", cell: (r: any) => <span className="font-mono">{fmtCurrency(r.amount, r.currency)}</span> },
            { header: "", align: "right", cell: (r: any) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, decision: "approve" })}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve
                </Button>
                <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, decision: "reject" })}>
                  <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" />Reject
                </Button>
              </div>
            ) },
          ]}
        />
      </DetailCard>

      {paying && (
        <SettleDialog po={paying} accounts={accounts} onClose={() => setPaying(null)} onSaved={onDone} />
      )}
    </>
  );
}

function SettleDialog({ po, accounts, onClose, onSaved }: {
  po: any; accounts: any[]; onClose: () => void; onSaved: () => void;
}) {
  const fn = useServerFn(payPurchaseOrder);
  const [form, setForm] = useState({
    amount: String(Math.max(0, Number(po.total || 0) - Number(po.paid_usd || 0)).toFixed(2)),
    account_id: accounts.find((a) => a.kind !== "cash")?.id ?? accounts[0]?.id ?? "",
    payment_method: "bank transfer",
    reference: po.po_number ?? "",
    paid_on: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const save = useMutation({
    mutationFn: () => fn({ data: { po_id: po.id, ...form, amount: Number(form.amount) } }),
    onSuccess: () => { toast.success("Supplier payment recorded"); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e?.message || "Could not record payment"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Settle {po.po_number}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Amount ({po.currency || "USD"})</Label>
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-1"><Label>Date</Label>
            <Input type="date" value={form.paid_on} onChange={(e) => setForm({ ...form, paid_on: e.target.value })} /></div>
          <div className="space-y-1"><Label>Paid from</Label>
            <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
              <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
              <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>Method</Label>
            <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["bank transfer", "cash", "mobile money", "card", "cheque"].map((m) => (
                  <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select></div>
          <div className="col-span-2 space-y-1"><Label>Reference</Label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
          <div className="col-span-2 space-y-1"><Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Record payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Ledger ---------------------------------------------------------

const LEDGER_KINDS = ["all", "invoice", "payment", "refund", "credit", "expense", "cash_in", "cash_out"] as const;

function Ledger({ data, loading }: { data: any; loading: boolean }) {
  const rows: any[] = data?.ledger ?? [];
  const [kind, setKind] = useState<string>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => rows.filter((r) => {
    if (kind !== "all" && r.kind !== kind) return false;
    if (q.trim().length < 2) return true;
    const hay = `${r.party} ${r.ref} ${r.detail}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  }), [rows, kind, q]);

  const totals = useMemo(() => ({
    debit: filtered.reduce((s, r) => s + Number(r.debit || 0), 0),
    credit: filtered.reduce((s, r) => s + Number(r.credit || 0), 0),
  }), [filtered]);

  return (
    <DetailCard
      title={`Ledger (${filtered.length})`}
      padded={false}
      action={
        <div className="flex items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search party, ref…" className="h-8 w-40" />
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{LEDGER_KINDS.map((k) => <SelectItem key={k} value={k} className="capitalize">{k.replace("_", " ")}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => download("ledger.csv", filtered)}>
            <Download className="h-3.5 w-3.5 mr-1.5" />Export
          </Button>
        </div>
      }
    >
      <div className="px-4 sm:px-5 py-2.5 border-b border-border flex flex-wrap gap-4 text-sm">
        <span className="text-muted-foreground">Money out <span className="font-mono font-semibold text-foreground">{usd(totals.debit)}</span></span>
        <span className="text-muted-foreground">Money in <span className="font-mono font-semibold text-success">{usd(totals.credit)}</span></span>
        <span className="text-muted-foreground">Net <span className={cn("font-mono font-semibold", totals.credit - totals.debit >= 0 ? "text-success" : "text-destructive")}>{usd(totals.credit - totals.debit)}</span></span>
      </div>
      <DataGrid
        rows={filtered}
        loading={loading}
        empty="No ledger entries yet."
        columns={[
          { header: "Date", cell: (r: any) => fmtDate(r.date) },
          { header: "Type", cell: (r: any) => <StatusBadge tone={toneForStatus(r.kind)}>{String(r.kind).replace("_", " ")}</StatusBadge> },
          { header: "Party", cell: (r: any) => <span className="font-medium">{r.party}</span> },
          { header: "Detail", cell: (r: any) => <span className="text-muted-foreground">{r.detail}</span> },
          { header: "Ref", cell: (r: any) => r.ref ?? "—" },
          { header: "Out (USD)", align: "right", cell: (r: any) => r.debit ? <span className="font-mono">{usd(r.debit)}</span> : "—" },
          { header: "In (USD)", align: "right", cell: (r: any) => r.credit ? <span className="font-mono text-success">{usd(r.credit)}</span> : "—" },
        ]}
      />
    </DetailCard>
  );
}

// ---------- Reports --------------------------------------------------------

function Reports({ data, loading }: { data: any; loading: boolean }) {
  const pnl: any[] = data?.reports?.pnl ?? [];
  const aging = data?.reports?.aging ?? { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
  const byManager: any[] = data?.reports?.byManager ?? [];
  const openInvoices: any[] = data?.receivables?.openInvoices ?? [];
  const branches: any[] = data?.branches?.rows ?? [];
  const byCountry: any[] = data?.branches?.byCountry ?? [];
  const projects: any[] = data?.projects ?? [];

  const agingRows = [
    { label: "Current", value: aging.current, tone: "text-success" },
    { label: "1–30 days", value: aging.d30, tone: "text-[oklch(0.62_0.19_45)]" },
    { label: "31–60 days", value: aging.d60, tone: "text-[oklch(0.62_0.19_45)]" },
    { label: "61–90 days", value: aging.d90, tone: "text-destructive" },
    { label: "90+ days", value: aging.d90plus, tone: "text-destructive" },
  ];
  const agingMax = Math.max(1, ...agingRows.map((r) => r.value));

  return (
    <>
      <DetailCard
        title="Profit & Loss — last 12 months"
        padded={false}
        action={<Button size="sm" variant="outline" onClick={() => download("profit-and-loss.csv", pnl)}><Download className="h-3.5 w-3.5 mr-1.5" />Export</Button>}
      >
        <DataGrid
          rows={pnl.slice().reverse()}
          loading={loading}
          empty="No activity yet."
          columns={[
            { header: "Month", cell: (r: any) => r.month },
            { header: "Invoiced", align: "right", cell: (r: any) => <span className="font-mono">{usd(r.invoiced)}</span> },
            { header: "Collected", align: "right", cell: (r: any) => <span className="font-mono text-success">{usd(r.income)}</span> },
            { header: "Refunds", align: "right", cell: (r: any) => <span className="font-mono">{usd(r.refunded)}</span> },
            { header: "Expenses", align: "right", cell: (r: any) => <span className="font-mono">{usd(r.spend)}</span> },
            { header: "Net", align: "right", cell: (r: any) => <span className={cn("font-mono font-semibold", r.net >= 0 ? "text-success" : "text-destructive")}>{usd(r.net)}</span> },
            { header: "Margin", align: "right", cell: (r: any) => `${r.margin.toFixed(0)}%` },
          ]}
        />
      </DetailCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <DetailCard title="Receivables Ageing">
          <div className="space-y-3">
            {agingRows.map((r) => (
              <div key={r.label}>
                <div className="flex justify-between text-sm">
                  <span>{r.label}</span>
                  <span className={cn("font-mono font-semibold", r.tone)}>{usd(r.value)}</span>
                </div>
                <div className="mt-1 h-2 bg-muted rounded">
                  <div className="h-2 rounded bg-solar" style={{ width: `${Math.max(2, (r.value / agingMax) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </DetailCard>

        <DetailCard title="Revenue by Account Manager" padded={false}>
          <DataGrid
            rows={byManager}
            loading={loading}
            empty="No invoices raised yet."
            columns={[
              { header: "Manager", cell: (r: any) => <span className="font-medium">{r.name}</span> },
              { header: "Clients", align: "right", cell: (r: any) => r.customers },
              { header: "Invoiced", align: "right", cell: (r: any) => <span className="font-mono">{usd(r.invoiced)}</span> },
              { header: "Collected", align: "right", cell: (r: any) => <span className="font-mono text-success">{usd(r.collected)}</span> },
              { header: "Outstanding", align: "right", cell: (r: any) => <span className="font-mono font-semibold">{usd(r.outstanding)}</span> },
            ]}
          />
        </DetailCard>
      </div>

      <DetailCard
        title={`Outstanding Invoices (${openInvoices.length})`}
        padded={false}
        action={<Button size="sm" variant="outline" onClick={() => download("receivables.csv", openInvoices)}><Download className="h-3.5 w-3.5 mr-1.5" />Export</Button>}
      >
        <DataGrid
          rows={openInvoices.slice(0, 100)}
          loading={loading}
          empty="Nothing outstanding."
          columns={[
            { header: "Invoice", cell: (r: any) => <span className="font-medium">{r.invoice_number}</span> },
            { header: "Customer", cell: (r: any) => (
              <div><p className="font-medium">{r.customer}</p><p className="text-xs text-muted-foreground">{r.account_number ?? "—"}</p></div>
            ) },
            { header: "Due", cell: (r: any) => fmtDate(r.due_date) },
            { header: "Overdue", align: "right", cell: (r: any) => r.days_overdue > 0
              ? <span className="text-destructive font-semibold">{r.days_overdue}d</span> : "—" },
            { header: "Outstanding", align: "right", cell: (r: any) => <span className="font-mono font-semibold">{fmtCurrency(r.outstanding, r.currency)}</span> },
          ]}
        />
      </DetailCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <DetailCard title="Branch Rollup" padded={false}>
          <DataGrid
            rows={branches.slice(0, 60)}
            loading={loading}
            empty="No branches captured."
            columns={[
              { header: "Branch", cell: (r: any) => (
                <div><p className="font-medium">{r.name}{r.is_hq ? " · HQ" : ""}</p><p className="text-xs text-muted-foreground">{r.customer}</p></div>
              ) },
              { header: "Location", cell: (r: any) => [r.city, r.country].filter(Boolean).join(", ") || "—" },
              { header: "Invoiced", align: "right", cell: (r: any) => <span className="font-mono">{usd(r.invoiced)}</span> },
              { header: "Outstanding", align: "right", cell: (r: any) => <span className="font-mono font-semibold">{usd(r.outstanding)}</span> },
            ]}
          />
        </DetailCard>

        <DetailCard title="By Country" padded={false}>
          <DataGrid
            rows={byCountry}
            loading={loading}
            empty="No branches captured."
            columns={[
              { header: "Country", cell: (r: any) => <span className="font-medium">{r.country}</span> },
              { header: "Branches", align: "right", cell: (r: any) => r.branches },
              { header: "Invoiced", align: "right", cell: (r: any) => <span className="font-mono">{usd(r.invoiced)}</span> },
              { header: "Outstanding", align: "right", cell: (r: any) => <span className="font-mono font-semibold">{usd(r.outstanding)}</span> },
            ]}
          />
        </DetailCard>
      </div>

      <DetailCard
        title="Project Finance — budget vs actual"
        padded={false}
        action={<Button size="sm" variant="outline" onClick={() => download("project-finance.csv", projects)}><Download className="h-3.5 w-3.5 mr-1.5" />Export</Button>}
      >
        <DataGrid
          rows={projects}
          loading={loading}
          empty="No active projects."
          columns={[
            { header: "Project", cell: (r: any) => (
              <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.code ?? "—"} · {r.customer}</p></div>
            ) },
            { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge> },
            { header: "Budget", align: "right", cell: (r: any) => <span className="font-mono">{usd(r.budget)}</span> },
            { header: "Spend", align: "right", cell: (r: any) => (
              <span className={cn("font-mono", r.over_budget && "text-destructive font-semibold")}>{usd(r.spend)}</span>
            ) },
            { header: "Billed", align: "right", cell: (r: any) => <span className="font-mono text-success">{usd(r.billed)}</span> },
            { header: "Margin", align: "right", cell: (r: any) => (
              <span className={cn("font-mono font-semibold", r.margin >= 0 ? "text-success" : "text-destructive")}>{usd(r.margin)}</span>
            ) },
            { header: "Budget used", align: "right", cell: (r: any) => r.budget > 0 ? `${r.used_pct.toFixed(0)}%` : "—" },
          ]}
        />
      </DetailCard>
    </>
  );
}

export const MONEY_ICONS = { Landmark, Truck, BookOpen, BarChart3 };
