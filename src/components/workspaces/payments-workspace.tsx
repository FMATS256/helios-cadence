import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCustomersLite } from "@/components/module-page";
import { createPaymentRecord, getCustomerPaymentContext } from "@/lib/ops.functions";
import { getPaymentsOverview, getPaymentReconciliation, reconcilePayment } from "@/lib/finance.functions";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { can } from "@/lib/rbac";
import { SubmitPaymentDialog } from "@/components/submit-payment-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Download, Receipt, TrendingUp, Clock, AlertCircle, X, DollarSign } from "lucide-react";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, KpiRow, StatusBadge, toneForStatus, money as fmtMoney,
} from "@/components/enterprise";

const METHODS = ["bank_transfer", "credit_card", "cash", "mobile_money", "cheque", "other"];
const STATUSES = ["received", "pending", "failed", "refunded"];
const CONTEXTS = ["invoice", "subscription", "one_off", "starlink", "voip", "hosting", "hardware", "other"];


function fmt(n: number, cur = "USD") { return `${cur} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export function PaymentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: customers = [] } = useCustomersLite();
  const { roles } = useRoles();
  const canRecord = can(roles, "payments.record");
  const [openSubmit, setOpenSubmit] = useState(false);
  const createPayment = useServerFn(createPaymentRecord);
  const getContext = useServerFn(getCustomerPaymentContext);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [openDialog, setOpenDialog] = useState(false);
  const [drawer, setDrawer] = useState<any>(null);
  const [reconcile, setReconcile] = useState<any>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["payments-platform"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").order("paid_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const kpi = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekAgo = now.getTime() - 7 * 86400000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let today = 0, week = 0, month = 0, pending = 0, unrec = 0;
    for (const p of rows) {
      const t = new Date(p.paid_at).getTime();
      const amt = Number(p.amount || 0);
      if (p.status === "received") {
        if (t >= startOfDay) today += amt;
        if (t >= weekAgo) week += amt;
        if (t >= startOfMonth) month += amt;
      }
      if (p.status === "pending") pending += amt;
      if (p.reconciliation_status !== "matched" && p.status === "received") unrec += amt;
    }
    return { today, week, month, pending, unrec, count: rows.length };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r: any) => {
      if (tab === "unreconciled" && r.reconciliation_status === "matched") return false;
      if (tab === "refunded" && r.status !== "refunded") return false;
      if (tab === "pending" && r.status !== "pending") return false;

      if (methodFilter !== "all" && r.method !== methodFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!search) return true;
      const v = search.toLowerCase();
      return [r.reference, r.receipt_number, r.account_number, r.method, r.status, r.service_context, r.notes]
        .some((f) => String(f ?? "").toLowerCase().includes(v));
    });
  }, [rows, tab, methodFilter, statusFilter, search, customers]);

  function exportCsv() {
    const headers = ["Receipt", "Reference", "Account", "Amount", "Currency", "Method", "Status", "Reconciliation", "Context", "Paid At"];
    const lines = [headers.join(",")].concat(
      filtered.map((r: any) => [
        r.receipt_number, r.reference ?? "", r.account_number, r.amount, r.currency,
        r.method, r.status, r.reconciliation_status ?? "pending", r.service_context ?? "",
        new Date(r.paid_at).toISOString(),
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageShell>
      <SubmitPaymentDialog open={openSubmit} onOpenChange={setOpenSubmit} />
      <SectionHeader
        eyebrow="Business"
        title="Payments Platform"
        description="Record, reconcile and analyze every payment across customers, subscriptions and services."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
            {canRecord ? (
              <Button onClick={() => setOpenDialog(true)} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                <Plus className="h-4 w-4 mr-1.5" />Record payment
              </Button>
            ) : (
              <Button onClick={() => setOpenSubmit(true)} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                <Plus className="h-4 w-4 mr-1.5" />Submit payment to billing
              </Button>
            )}
          </div>
        }
      />

      <KpiRow
        items={[
          { icon: TrendingUp, label: "Today", value: fmt(kpi.today), tone: "solar" },
          { icon: Receipt, label: "7 days", value: fmt(kpi.week), tone: "info" },
          { icon: TrendingUp, label: "This month", value: fmt(kpi.month), tone: "solar" },
          { icon: Clock, label: "Pending", value: fmt(kpi.pending), tone: "warning" },
          { icon: AlertCircle, label: "Unreconciled", value: fmt(kpi.unrec), tone: "danger" },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unreconciled">Unreconciled</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="refunded">Refunded</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Receipt, reference, account…" className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-32"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading payments…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No payments match these filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reconciliation</TableHead>
                  <TableHead>Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r: any) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDrawer(r)}>
                    <TableCell className="font-mono text-xs">
                      <div className="font-semibold text-foreground">{r.receipt_number ?? "—"}</div>
                      {r.reference && <div className="text-muted-foreground">{r.reference}</div>}
                    </TableCell>
                    <TableCell>
                      <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline" onClick={(e) => e.stopPropagation()}>
                        {r.account_number}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono font-semibold">{fmt(r.amount, r.currency)}</TableCell>
                    <TableCell className="text-sm capitalize">{r.method?.replace(/_/g, " ") ?? "—"}</TableCell>
                    <TableCell className="text-xs uppercase text-muted-foreground">{r.service_context ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge tone={toneForStatus(r.status === "received" ? "success" : r.status === "failed" ? "danger" : r.status === "refunded" ? "warning" : "neutral" as any)}>{r.status}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StatusBadge tone={toneForStatus(r.reconciliation_status === "matched" ? "success" : r.reconciliation_status === "partial" ? "warning" : "neutral" as any)}>
                          {r.reconciliation_status ?? "pending"}
                        </StatusBadge>
                        {r.reconciliation_status !== "matched" && r.status !== "failed" && r.customer_id && (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                            onClick={(e) => { e.stopPropagation(); setReconcile(r); }}>
                            Apply
                          </Button>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">{new Date(r.paid_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        customers={customers}
        getContext={getContext}
        onSubmit={async (payload) => {
          if (!user) throw new Error("Please sign in.");
          const created: any = await createPayment({ data: payload });
          qc.invalidateQueries({ queryKey: ["payments-platform"] });
          toast.success(`Payment recorded${payload.allocations?.length ? " and allocated" : ""}`);
          if (created?.account_number) {
            navigate({
              to: "/customers/$accountNumber",
              params: { accountNumber: created.account_number },
              search: { tab: "payments" },
            });
          }
        }}
      />

      <PaymentDrawer payment={drawer} onClose={() => setDrawer(null)} onReconcile={(p) => { setDrawer(null); setReconcile(p); }} />

      <ReconcileDialog
        payment={reconcile}
        onClose={() => setReconcile(null)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["payments-platform"] });
          qc.invalidateQueries({ queryKey: ["payments-overview"] });
          qc.invalidateQueries({ queryKey: ["invoices-overview"] });
          qc.invalidateQueries({ queryKey: ["customer-balances"] });
          qc.invalidateQueries({ queryKey: ["customer360"] });
        }}
      />
    </PageShell>

  );
}


function RecordPaymentDialog({
  open, onOpenChange, customers, getContext, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customers: any[];
  getContext: (args: { data: { customer_id: string } }) => Promise<any>;
  onSubmit: (payload: any) => Promise<unknown>;
}) {
  const emptyForm = {
    customer_id: "", walk_in_name: "", walk_in_email: "", walk_in_phone: "",
    amount: "", currency: "USD", method: "cash", reference: "", status: "received",
    paid_at: new Date().toISOString().slice(0, 10), notes: "", service_context: "one_off",
  };
  const [form, setForm] = useState<any>(emptyForm);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [cashAccountId, setCashAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  const isWalkin = form.customer_id === "__walkin__";
  const showContext = form.customer_id && !isWalkin;

  const ctxQuery = useQuery({
    queryKey: ["pay-ctx", form.customer_id],
    queryFn: () => getContext({ data: { customer_id: form.customer_id } }),
    enabled: !!showContext,
  });

  const openInvoices: any[] = ctxQuery.data?.openInvoices ?? [];
  const cashAccounts: any[] = ctxQuery.data?.cashAccounts ?? [];
  const suggestedAccount = cashAccounts.find((a) =>
    form.method === "cash"
      ? String(a.kind).toLowerCase() === "cash"
      : form.method === "mobile_money"
        ? String(a.kind).toLowerCase() === "mobile_money"
        : String(a.kind).toLowerCase() === "bank",
  ) ?? cashAccounts.find((a) => a.is_default) ?? cashAccounts[0];
  const activeCashAccountId = cashAccountId || suggestedAccount?.id || "";
  const allocSum = Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0);
  const amount = Number(form.amount) || 0;
  const remaining = amount - allocSum;

  function reset() { setForm(emptyForm); setAllocations({}); setCashAccountId(""); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_id) return toast.error("Select a customer");
    if (isWalkin && !form.walk_in_name) return toast.error("Walk-in name required");
    if (!amount || amount <= 0) return toast.error("Enter an amount");
    if (!activeCashAccountId) return toast.error("Select where the money was received");
    if (allocSum > amount + 0.001) return toast.error("Allocations exceed the payment amount");
    setSaving(true);
    try {
      const allocs = Object.entries(allocations)
        .map(([invoice_id, v]) => ({ invoice_id, amount: Number(v) || 0 }))
        .filter((a) => a.amount > 0);
      await onSubmit({
        ...form,
        amount,
        cash_account_id: activeCashAccountId,
        paid_at: form.paid_at ? new Date(form.paid_at).toISOString() : new Date().toISOString(),
        allocations: allocs,
      });
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogTrigger asChild><span /></DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Record payment</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">Capture the payment, allocate to open invoices, tag the service context.</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /></Button>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="grid min-w-0 grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Left: payment details */}
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
              <div>
                <Label>Customer *</Label>
                <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer or walk-in" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__walkin__">➕ Walk-in client / cash customer</SelectItem>
                    {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {isWalkin && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div><Label>Walk-in name *</Label><Input value={form.walk_in_name} onChange={(e) => setForm({ ...form, walk_in_name: e.target.value })} placeholder="Client name" /></div>
                  <div><Label>Phone</Label><Input value={form.walk_in_phone} onChange={(e) => setForm({ ...form, walk_in_phone: e.target.value })} /></div>
                  <div className="md:col-span-2"><Label>Email</Label><Input type="email" value={form.walk_in_email} onChange={(e) => setForm({ ...form, walk_in_email: e.target.value })} /></div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div><Label>Amount *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                <div><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
                <div>
                  <Label>Method</Label>
                  <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Money received into *</Label>
                <Select value={activeCashAccountId} onValueChange={setCashAccountId} disabled={!showContext}>
                  <SelectTrigger><SelectValue placeholder="Select bank, cash or mobile money account" /></SelectTrigger>
                  <SelectContent>
                    {cashAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} · {String(a.kind).replace(/_/g, " ")}{a.is_default ? " (default)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {form.method === "cash" ? "Cash payments are posted to a cash drawer such as Main Cash." : "This account receives the payment and updates the ledger."}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <Label>Service context</Label>
                  <Select value={form.service_context} onValueChange={(v) => setForm({ ...form, service_context: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CONTEXTS.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Reference</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="TXN-…" /></div>
                <div><Label>Paid on</Label><Input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} /></div>
              </div>

              <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>

            {/* Invoice allocation */}
            {showContext && (
              <div className="rounded-xl border p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold text-sm">Allocate to open invoices</div>
                    <div className="text-xs text-muted-foreground">Auto-updates invoice paid status and reconciliation.</div>
                  </div>
                  <div className="text-right text-xs">
                    <div>Allocated: <span className="font-mono">{fmt(allocSum, form.currency)}</span></div>
                    <div className={remaining < 0 ? "text-destructive" : "text-muted-foreground"}>Remaining: <span className="font-mono">{fmt(remaining, form.currency)}</span></div>
                  </div>
                </div>
                {openInvoices.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">No open invoices for this customer.</div>
                ) : (
                  <div className="space-y-2">
                    {openInvoices.map((inv) => (
                      <div key={inv.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-2 sm:flex sm:gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-xs font-semibold">{inv.invoice_number}</div>
                          <div className="text-xs text-muted-foreground">{inv.status} · due {inv.due_date ?? "—"} · {fmt(inv.total, inv.currency)}</div>
                        </div>
                        <Input
                          type="number" step="0.01" placeholder="0.00" className="h-8 w-24 font-mono text-right sm:w-28"
                          value={allocations[inv.id] ?? ""}
                          onChange={(e) => setAllocations((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                        />
                        <Button type="button" size="sm" variant="ghost" className="col-start-2" onClick={() => setAllocations((prev) => ({ ...prev, [inv.id]: String(inv.total) }))}>Full</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: customer context */}
          <aside className="space-y-3">
            {showContext ? (
              <>
                <div className="rounded-xl border p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Active subscriptions</div>
                  {(ctxQuery.data?.subscriptions ?? []).length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2">None</div>
                  ) : (ctxQuery.data?.subscriptions ?? []).map((s: any) => (
                    <div key={s.id} className="mt-2 flex items-center justify-between text-sm">
                      <div><div className="font-medium">{s.plan_name}</div><div className="text-xs text-muted-foreground">{s.status} · renews {s.next_renewal ?? "—"}</div></div>
                      <div className="font-mono text-xs">{fmt(s.amount, s.currency)}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Recent payments</div>
                  {(ctxQuery.data?.recentPayments ?? []).slice(0, 5).map((p: any) => (
                    <div key={p.id} className="mt-2 flex items-center justify-between text-xs">
                      <div className="font-mono">{p.receipt_number}</div>
                      <div className="font-mono">{fmt(p.amount, p.currency)}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                Select an existing customer to see open invoices, subscriptions and recent payments.
              </div>
            )}
          </aside>

          <DialogFooter className="sticky bottom-0 col-span-full -mx-6 border-t bg-background/95 px-6 py-4 backdrop-blur">
            <Button type="submit" disabled={saving} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              {saving ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDrawer({ payment, onClose, onReconcile }: { payment: any; onClose: () => void; onReconcile: (p: any) => void }) {
  return (
    <Sheet open={!!payment} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        {payment && (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono">{payment.receipt_number}</SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-4 text-sm">
              <div className="rounded-xl border p-4">
                <div className="text-xs uppercase text-muted-foreground">Amount</div>
                <div className="mt-1 text-3xl font-mono font-semibold">{fmt(payment.amount, payment.currency)}</div>
                <div className="mt-2 flex gap-2">
                  <StatusBadge tone={toneForStatus(payment.status === "received" ? "success" : "warning" as any)}>{payment.status}</StatusBadge>
                  <StatusBadge tone={toneForStatus(payment.reconciliation_status === "matched" ? "success" : "neutral" as any)}>{payment.reconciliation_status ?? "pending"}</StatusBadge>
                </div>
              </div>

              <Row label="Customer">
                <Link to="/customers/$accountNumber" params={{ accountNumber: payment.account_number }} className="font-mono text-solar hover:underline">{payment.account_number}</Link>
              </Row>
              <Row label="Method">{payment.method?.replace(/_/g, " ")}</Row>
              <Row label="Reference">{payment.reference ?? "—"}</Row>
              <Row label="Context">{payment.service_context ?? "—"}</Row>
              <Row label="Paid at">{new Date(payment.paid_at).toLocaleString()}</Row>
              {payment.notes && <Row label="Notes">{payment.notes}</Row>}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => window.print()}>Print receipt</Button>
                {payment.reconciliation_status !== "matched" && payment.status !== "failed" && payment.customer_id && (
                  <Button size="sm" onClick={() => onReconcile(payment)} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                    Apply to invoices
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2 last:border-0">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-right">{children}</div>
    </div>
  );
}


/**
 * Reconciling is a money movement, not a label: the amount is applied to open
 * invoices, which lowers each invoice balance and the customer's balance due.
 */
function ReconcileDialog({ payment, onClose, onDone }: { payment: any; onClose: () => void; onDone: () => void }) {
  const loadCtx = useServerFn(getPaymentReconciliation);
  const apply = useServerFn(reconcilePayment);
  const [split, setSplit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const ctx = useQuery({
    queryKey: ["payment-reconciliation", payment?.id],
    queryFn: () => loadCtx({ data: { payment_id: payment.id } }),
    enabled: !!payment?.id,
  });

  const data = ctx.data as any;
  const currency = payment?.currency || "USD";
  const entered = Object.values(split).reduce((s, v) => s + (Number(v) || 0), 0);
  const unapplied = Number(data?.unapplied ?? 0);
  const remaining = Math.round((unapplied - entered) * 100) / 100;

  async function run(auto: boolean) {
    setBusy(true);
    try {
      const allocations = auto ? [] : Object.entries(split)
        .map(([invoice_id, v]) => ({ invoice_id, amount: Number(v) || 0 }))
        .filter((a) => a.amount > 0);
      const res: any = await apply({ data: { payment_id: payment.id, allocations } });
      toast.success(
        `${fmt(res.applied, currency)} applied to ${res.invoiceNumbers?.join(", ") || "open invoices"} · balance now ${fmt(res.outstandingAfter, currency)}`
          + (res.resumedServices ? ` · ${res.resumedServices} service(s) resumed` : ""),
      );
      setSplit({});
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not reconcile this payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!payment} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apply payment to invoices</DialogTitle>
        </DialogHeader>
        {ctx.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading open invoices…</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl border p-3">
                <div className="text-xs uppercase text-muted-foreground">Payment</div>
                <div className="font-mono font-semibold">{fmt(payment?.amount, currency)}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs uppercase text-muted-foreground">Already applied</div>
                <div className="font-mono font-semibold">{fmt(data?.applied ?? 0, currency)}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs uppercase text-muted-foreground">Unapplied</div>
                <div className="font-mono font-semibold">{fmt(unapplied, currency)}</div>
              </div>
            </div>

            {(data?.openInvoices ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No open invoices on this account — generate an invoice first, or keep the amount as customer credit.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {(data.openInvoices as any[]).map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 rounded-lg border p-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs font-semibold">{inv.invoice_number}</div>
                      <div className="text-xs text-muted-foreground">
                        due {inv.due_date ?? "—"} · balance {fmt(inv.balance, inv.currency)}
                        {inv.is_overdue ? ` · ${inv.days_overdue}d overdue` : ""}
                      </div>
                    </div>
                    <Input
                      type="number" step="0.01" placeholder="0.00" className="h-8 w-28 text-right font-mono"
                      value={split[inv.id] ?? ""}
                      onChange={(e) => setSplit((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                    />
                    <Button type="button" size="sm" variant="ghost"
                      onClick={() => setSplit((prev) => ({ ...prev, [inv.id]: String(Math.min(inv.balance, Math.max(0, unapplied))) }))}>
                      Max
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Allocating {fmt(entered, currency)}</span>
              <span>{remaining < -0.005 ? "Over-allocated" : `${fmt(Math.max(0, remaining), currency)} would stay unapplied`}</span>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" disabled={busy || unapplied <= 0.005 || !(data?.openInvoices ?? []).length} onClick={() => run(true)}>
                Auto-apply oldest first
              </Button>
              <Button
                disabled={busy || entered <= 0.005 || remaining < -0.005}
                onClick={() => run(false)}
                className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}
              >
                {busy ? "Applying…" : "Apply payment"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
