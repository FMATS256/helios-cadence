import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { getCustomerBalances, getCustomerFinancialAccount } from "@/lib/finance.functions";
import { createPaymentSchedule, recordInstallmentPayment } from "@/lib/schedules.functions";
import { useRoles } from "@/hooks/use-roles";
import { can } from "@/lib/rbac";
import { PageShell, SectionHeader, KpiRow, StatusBadge, money as fmtMoney } from "@/components/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Wallet, AlertTriangle, Users, Search, Receipt, Repeat, ArrowUpRight } from "lucide-react";


/**
 * Finance → Customer Accounts.
 * Every customer has one financial account; this lists them all and opens the
 * full statement (invoices, payments and where they were banked, credits,
 * refunds, subscriptions, ageing) in a drill-down panel.
 */
export function CustomerAccountsPage() {
  const load = useServerFn(getCustomerBalances);
  const { data, isLoading } = useQuery({ queryKey: ["customer-balances"], queryFn: () => load({ data: {} }) });
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);

  const rows = useMemo(() => {
    const list = (data?.balances ?? []) as any[];
    if (!search) return list;
    const v = search.toLowerCase();
    return list.filter((r) => [r.company_name, r.account_number].some((f) => String(f ?? "").toLowerCase().includes(v)));
  }, [data, search]);

  const stats = data?.stats;

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Receivables"
        title="Customer Financial Accounts"
        description="One financial account per customer — invoices, payments, credits, refunds, subscriptions and ageing in a single statement."
      />

      <KpiRow
        items={[
          { icon: Wallet, label: "Total due", value: fmtMoney(stats?.totalDue ?? 0), tone: "warning" },
          { icon: AlertTriangle, label: "Overdue", value: fmtMoney(stats?.totalOverdue ?? 0), tone: "danger" },
          { icon: Users, label: "Accounts in debt", value: String(stats?.accountsInDebt ?? 0), tone: "info" },
          { icon: Receipt, label: "Accounts overdue", value: String(stats?.accountsOverdue ?? 0), tone: "danger" },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search customer or account…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Invoiced</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance due</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Account</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Loading accounts…</TableCell></TableRow>}
                {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No customer accounts yet.</TableCell></TableRow>}
                {rows.map((r) => (
                  <TableRow key={r.customer_id}>
                    <TableCell className="font-medium">{r.company_name}</TableCell>
                    <TableCell className="font-mono text-xs">{r.account_number}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.invoiced)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.paid)}</TableCell>
                    <TableCell className={`text-right font-semibold ${r.balance > 0.005 ? "text-destructive" : ""}`}>{fmtMoney(r.balance)}</TableCell>
                    <TableCell className="text-right">
                      {r.overdue > 0.005 ? <StatusBadge tone="danger">{fmtMoney(r.overdue)}</StatusBadge> : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setOpen({ id: r.customer_id, name: r.company_name })}>
                        Open account
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AccountSheet target={open} onClose={() => setOpen(null)} />
    </PageShell>
  );
}

function AccountSheet({ target, onClose }: { target: { id: string; name: string } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(getCustomerFinancialAccount);
  const { data, isLoading } = useQuery({
    queryKey: ["customer-financial-account", target?.id],
    queryFn: () => load({ data: { customer_id: target!.id } }),
    enabled: !!target,
  });
  const { roles } = useRoles();
  const canManage = can(roles, "payments.record");
  const [planOpen, setPlanOpen] = useState(false);
  const [payInstallment, setPayInstallment] = useState<{ id: string; amount: number; label: string } | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["customer-financial-account", target?.id] });
    qc.invalidateQueries({ queryKey: ["customer-balances"] });
  };
  const t = data?.totals;
  const a = data?.ageing;


  return (
    <Sheet open={!!target} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{target?.name ?? "Financial account"}</SheetTitle>
          <SheetDescription>
            {data?.customer?.account_number ? `Account ${data.customer.account_number}` : "Full financial statement"}
          </SheetDescription>
        </SheetHeader>

        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading statement…</p>}

        {data && (
          <div className="mt-4 space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Invoiced" value={fmtMoney(t?.invoiced ?? 0)} />
              <Stat label="Paid" value={fmtMoney(t?.paid ?? 0)} />
              <Stat label="Balance due" value={fmtMoney(t?.balance ?? 0)} tone={(t?.balance ?? 0) > 0.005 ? "danger" : undefined} />
              <Stat label="Overdue" value={fmtMoney(t?.overdue ?? 0)} tone={(t?.overdue ?? 0) > 0.005 ? "danger" : undefined} />
              <Stat label="Credit balance" value={fmtMoney(t?.creditBalance ?? 0)} />
              <Stat label="Refunded" value={fmtMoney(t?.refunded ?? 0)} />
              <Stat label="MRR" value={fmtMoney(t?.mrr ?? 0)} />
              <Stat label="Unapplied payments" value={fmtMoney(t?.unallocated ?? 0)} />
              <Stat label="Job & customer costs" value={fmtMoney(t?.expenses ?? 0)} />
              <Stat label="Installments outstanding" value={fmtMoney(t?.scheduledOutstanding ?? 0)}
                tone={(t?.scheduledOverdue ?? 0) > 0.005 ? "danger" : undefined} />
            </div>


            <div>
              <h4 className="mb-2 text-sm font-semibold">Ageing</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Current" value={fmtMoney(a?.current ?? 0)} />
                <Stat label="1–30 days" value={fmtMoney(a?.d30 ?? 0)} />
                <Stat label="31–60 days" value={fmtMoney(a?.d60 ?? 0)} />
                <Stat label="60+ days" value={fmtMoney(a?.d90 ?? 0)} />
              </div>
            </div>

            <Block title="Invoices" empty="No invoices yet.">
              {(data.invoices as any[]).map((i) => (
                <Row key={i.id}
                  left={<Link to="/invoices/$id" params={{ id: i.id }} className="font-medium hover:underline">{i.invoice_number}</Link>}
                  meta={`${i.issue_date ?? "—"} · due ${i.due_date ?? "—"}${i.days_overdue ? ` · ${i.days_overdue}d overdue` : ""}`}
                  right={<div className="text-right">
                    <p className="text-sm font-semibold">{fmtMoney(i.total)}</p>
                    <p className="text-xs text-muted-foreground">{fmtMoney(i.balance)} due</p>
                  </div>}
                  badge={<StatusBadge tone={i.balance > 0.005 ? (i.days_overdue ? "danger" : "warning") : "success"}>{i.status}</StatusBadge>}
                />
              ))}
            </Block>

            <Block title="Payments received" empty="No payments recorded.">
              {(data.payments as any[]).map((p) => (
                <Row key={p.id}
                  left={<span className="font-medium">{p.receipt_number ?? "Payment"}</span>}
                  meta={`${String(p.paid_at ?? "").slice(0, 10)} · ${p.method ?? "—"}${p.account_name ? ` · banked into ${p.account_name}` : ""}`}
                  right={<p className="text-sm font-semibold text-success">{fmtMoney(p.amount)}</p>}
                  badge={<StatusBadge tone={p.unallocated > 0.005 ? "warning" : "success"}>{p.unallocated > 0.005 ? "part applied" : "applied"}</StatusBadge>}
                />
              ))}
            </Block>

            <Block title="Subscriptions" empty="No subscriptions.">
              {(data.subscriptions as any[]).map((s) => (
                <Row key={s.id}
                  left={<span className="font-medium">{s.plan_name}</span>}
                  meta={`${s.billing_cycle ?? "monthly"}${s.next_renewal ? ` · renews ${s.next_renewal}` : ""}`}
                  right={<p className="text-sm font-semibold">{fmtMoney(s.amount)}</p>}
                  badge={<StatusBadge tone={s.status === "active" ? "success" : "neutral"}>{s.status}</StatusBadge>}
                />
              ))}
            </Block>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Payment plans (installments)</h4>
                {canManage && target && (
                  <Button size="sm" variant="outline" onClick={() => setPlanOpen(true)}>New plan</Button>
                )}
              </div>
              <div className="space-y-3">
                {(data.schedules as any[]).length === 0 && (
                  <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                    No installment plan on this account.
                  </p>
                )}
                {(data.schedules as any[]).map((s) => (
                  <div key={s.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.installment_count} × {s.frequency} from {s.start_date}
                          {s.invoices?.invoice_number ? ` · ${s.invoices.invoice_number}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{fmtMoney(s.outstanding)} left</p>
                        <p className="text-xs text-muted-foreground">of {fmtMoney(s.scheduled)}</p>
                      </div>
                      <StatusBadge tone={s.overdue_count ? "danger" : s.status === "completed" ? "success" : "info"}>
                        {s.overdue_count ? `${s.overdue_count} overdue` : s.status}
                      </StatusBadge>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {(s.installments as any[]).map((i) => (
                        <div key={i.id} className="flex items-center gap-3 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
                          <span className="w-6 tabular-nums text-muted-foreground">#{i.sequence}</span>
                          <span className="tabular-nums">{i.due_date}</span>
                          <StatusBadge tone={i.state === "paid" ? "success" : i.state === "overdue" ? "danger" : "warning"}>
                            {i.state === "overdue" ? `${i.days_overdue}d overdue` : i.state}
                          </StatusBadge>
                          <span className="ml-auto tabular-nums font-medium">{fmtMoney(i.amount_due)}</span>
                          <span className="tabular-nums text-muted-foreground">{fmtMoney(i.amount_paid)} paid</span>
                          {canManage && i.state !== "paid" && i.status !== "cancelled" && (
                            <Button size="sm" variant="ghost" className="h-6 px-2"
                              onClick={() => setPayInstallment({ id: i.id, amount: i.outstanding, label: `Installment ${i.sequence} · due ${i.due_date}` })}>
                              Record
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Block title="Job expenses" empty="No expenses recorded against this customer.">
              {(data.expenses as any[]).map((e) => (
                <Row key={e.id}
                  left={<span className="font-medium">{e.description}</span>}
                  meta={`${e.expense_date} · ${e.category}${e.job_title ? ` · job: ${e.job_title}` : ""}${e.vendor ? ` · ${e.vendor}` : ""}`}
                  right={<p className="text-sm font-semibold">{fmtMoney(e.amount)}</p>}
                  badge={<StatusBadge tone={e.is_job_expense ? "info" : "neutral"}>{e.is_job_expense ? "job cost" : e.category}</StatusBadge>}
                />
              ))}
            </Block>

            {(data.expensesByCategory as any[]).length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Cost by category</h4>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(data.expensesByCategory as any[]).map((c) => (
                    <Stat key={c.category} label={c.category} value={fmtMoney(c.amount)} />
                  ))}
                </div>
              </div>
            )}


            <Block title="Statement" empty="Nothing on this account yet.">
              {(data.ledger as any[]).map((e, idx) => (
                <Row key={`${e.kind}-${e.id}-${idx}`}
                  left={<span className="font-medium">{e.label}</span>}
                  meta={`${e.date || "—"} · ${e.kind}${e.account ? ` · ${e.account}` : ""}`}
                  right={<div className="text-right">
                    <p className={`text-sm font-semibold ${e.credit ? "text-success" : ""}`}>
                      {e.credit ? `- ${fmtMoney(e.credit)}` : fmtMoney(e.debit)}
                    </p>
                    <p className="text-xs text-muted-foreground">bal {fmtMoney(e.balance)}</p>
                  </div>}
                />
              ))}
            </Block>

            {data.customer?.account_number && (
              <Button asChild variant="outline" size="sm">
                <Link to="/customers/$accountNumber" params={{ accountNumber: data.customer.account_number }}>
                  Open Customer 360 <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        )}

        {target && (
          <NewPlanDialog
            open={planOpen}
            onClose={() => setPlanOpen(false)}
            customerId={target.id}
            invoices={(data?.invoices as any[]) ?? []}
            onSaved={() => { setPlanOpen(false); refresh(); }}
          />
        )}
        <InstallmentPaymentDialog
          item={payInstallment}
          onClose={() => setPayInstallment(null)}
          onSaved={() => { setPayInstallment(null); refresh(); }}
        />
      </SheetContent>
    </Sheet>
  );
}

function NewPlanDialog({ open, onClose, customerId, invoices, onSaved }: {
  open: boolean; onClose: () => void; customerId: string; invoices: any[]; onSaved: () => void;
}) {
  const fn = useServerFn(createPaymentSchedule);
  const [form, setForm] = useState({
    title: "Installment plan",
    invoice_id: "",
    total_amount: "",
    installment_count: "3",
    frequency: "monthly",
    start_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const save = useMutation({
    mutationFn: () => fn({
      data: {
        customer_id: customerId,
        title: form.title,
        invoice_id: form.invoice_id || null,
        total_amount: Number(form.total_amount),
        installment_count: Number(form.installment_count),
        frequency: form.frequency as any,
        start_date: form.start_date,
        notes: form.notes || undefined,
      } as any,
    }),
    onSuccess: () => { toast.success("Payment plan created"); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "Could not create plan"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>New payment plan</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="col-span-2 space-y-1"><Label>Invoice (optional)</Label>
            <Select value={form.invoice_id || "none"} onValueChange={(v) => {
              const inv = invoices.find((i) => i.id === v);
              setForm({ ...form, invoice_id: v === "none" ? "" : v, total_amount: inv ? String(inv.balance ?? inv.total) : form.total_amount });
            }}>
              <SelectTrigger><SelectValue placeholder="No invoice" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No invoice</SelectItem>
                {invoices.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.invoice_number} · {fmtMoney(i.balance ?? i.total)} due</SelectItem>
                ))}
              </SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>Total amount (USD)</Label>
            <Input type="number" step="0.01" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} /></div>
          <div className="space-y-1"><Label>Installments</Label>
            <Input type="number" min="1" value={form.installment_count} onChange={(e) => setForm({ ...form, installment_count: e.target.value })} /></div>
          <div className="space-y-1"><Label>Frequency</Label>
            <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["weekly", "fortnightly", "monthly", "quarterly", "annual"].map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>First due date</Label>
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="col-span-2 space-y-1"><Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending || !Number(form.total_amount)} onClick={() => save.mutate()}>
            {save.isPending ? "Creating…" : "Create plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InstallmentPaymentDialog({ item, onClose, onSaved }: {
  item: { id: string; amount: number; label: string } | null; onClose: () => void; onSaved: () => void;
}) {
  const fn = useServerFn(recordInstallmentPayment);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const save = useMutation({
    mutationFn: () => fn({ data: { installment_id: item!.id, amount: Number(amount || item!.amount), notes: reference || undefined } as any }),
    onSuccess: () => { toast.success("Installment updated"); setAmount(""); setReference(""); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "Could not record installment"),
  });

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Record installment payment</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">{item?.label}</p>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Amount (USD)</Label>
            <Input type="number" step="0.01" placeholder={String(item?.amount ?? "")} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1"><Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Record"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${tone === "danger" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function Block({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const list = Array.isArray(children) ? children.flat() : [children];
  const has = list.filter(Boolean).length > 0;
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {title === "Subscriptions" ? <Repeat className="h-3.5 w-3.5 text-muted-foreground" /> : null}
        {title}
      </h4>
      <div className="space-y-2">
        {has ? children : <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">{empty}</p>}
      </div>
    </div>
  );
}

function Row({ left, meta, right, badge }: { left: React.ReactNode; meta?: string; right?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{left}</div>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
      {badge}
      {right}
    </div>
  );
}
