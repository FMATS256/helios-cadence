import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, DetailCard, ActionBar,
  StatusBadge, toneForStatus,
} from "@/components/enterprise";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Wallet, Banknote, ArrowDownCircle, ArrowUpCircle, Plus, Trash2, Pencil } from "lucide-react";
import {
  getCashWorkspace, upsertExpense, deleteExpense, upsertCashAccount, recordCashMovement,
} from "@/lib/expenses.functions";

export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses & Cash — IMT Operations Platform" },
      { name: "description", content: "Track operating expenses, petty cash in hand, bank balances and cash movements." },
      { property: "og:title", content: "Expenses & Cash — IMT Operations Platform" },
      { property: "og:description", content: "Operating expenses, cash in hand and bank balances in one workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

const CATEGORIES = [
  "general", "salaries", "rent", "utilities", "internet", "fuel & transport",
  "hardware", "software & licenses", "provider costs", "marketing",
  "professional fees", "maintenance", "travel", "tax", "other",
];
const METHODS = ["cash", "bank transfer", "mobile money", "card", "cheque"];

const money = (n: number, c = "USD") =>
  `${c === "USD" ? "$" : `${c} `}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function ExpensesPage() {
  const qc = useQueryClient();
  const wsFn = useServerFn(getCashWorkspace);
  const { data, isLoading } = useQuery({ queryKey: ["cash-workspace"], queryFn: async () => (await wsFn()) as any });

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [moveKind, setMoveKind] = useState<null | "deposit" | "withdrawal">(null);

  const accounts: any[] = data?.accounts ?? [];
  const expenses: any[] = data?.expenses ?? [];
  const movements: any[] = data?.movements ?? [];
  const stats = data?.stats;

  const refresh = () => qc.invalidateQueries({ queryKey: ["cash-workspace"] });

  const delFn = useServerFn(deleteExpense);
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Expense deleted"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Delete failed"),
  });

  const chips = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Cash in Hand", value: money(stats.cashInHand), color: "#0d9488" },
      { label: "Bank Balance", value: money(stats.bankBalance), color: "#1d4ed8" },
      { label: "Spend This Month", value: money(stats.monthSpend), color: "#b91c1c" },
      { label: "Cash Collected", value: money(stats.cashCollected), color: "#15803d" },
      { label: "Pending Approvals", value: String(stats.pendingCount), color: "#b45309" },
      { label: "Total Expenses", value: String(stats.expenseCount), color: "#4338ca" },
    ];
  }, [stats]);

  const topCategories = useMemo(() => {
    const e = Object.entries(stats?.byCategory ?? {}) as [string, number][];
    return e.sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [stats]);

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Finance"
        title="Expenses & Cash"
        description="Operating spend, petty cash in hand, bank balances and every cash movement — live from the ledger."
      />

      <StatChipRow chips={chips} cols={6} />

      <ActionBar
        actions={[
          { tone: "rose", icon: Receipt, label: "Add Expense", onClick: () => { setEditing(null); setExpenseOpen(true); } },
          { tone: "emerald", icon: ArrowDownCircle, label: "Cash Deposit", onClick: () => setMoveKind("deposit") },
          { tone: "amber", icon: ArrowUpCircle, label: "Cash Withdrawal", onClick: () => setMoveKind("withdrawal") },
          { tone: "indigo", icon: Wallet, label: "New Account", onClick: () => setAccountOpen(true) },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-3">
        {accounts.map((a) => (
          <DetailCard key={a.id} title={a.name}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                  {a.kind} · {a.currency}
                </p>
                <p className="font-display text-2xl font-bold mt-2 tabular-nums">{money(a.balance, a.currency)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Opening {money(a.opening_balance, a.currency)} · Spent {money(a.spent, a.currency)}
                  {a.collected ? ` · Collected ${money(a.collected, a.currency)}` : ""}
                </p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-solar/15 text-solar flex items-center justify-center">
                {a.kind === "cash" ? <Banknote className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
              </div>
            </div>
          </DetailCard>
        ))}
      </div>

      <Tabs defaultValue="expenses">
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          {movements.length > 0 && <TabsTrigger value="movements">Cash Movements</TabsTrigger>}
          {topCategories.length > 0 && <TabsTrigger value="breakdown">Category Breakdown</TabsTrigger>}
        </TabsList>

        <TabsContent value="expenses" className="mt-4">
          <DetailCard title="Expense Ledger" padded={false}>
            <DataGrid
              rows={expenses}
              loading={isLoading}
              empty="No expenses recorded yet."
              columns={[
                { header: "Date", cell: (r: any) => <span className="tabular-nums">{r.expense_date}</span> },
                { header: "Description", cell: (r: any) => (
                  <div>
                    <p className="font-medium">{r.description}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {r.category}{r.vendor ? ` · ${r.vendor}` : ""}{r.customers ? ` · ${r.customers.company_name}` : ""}
                    </p>
                  </div>
                ) },
                { header: "Account", cell: (r: any) => r.cash_accounts?.name ?? "—" },
                { header: "Method", cell: (r: any) => <span className="capitalize">{r.payment_method}</span> },
                { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge> },
                { header: "Amount", align: "right", cell: (r: any) => <span className="font-mono">{money(r.amount, r.currency)}</span> },
                { header: "", align: "right", cell: (r: any) => (
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setExpenseOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(r.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ) },
              ]}
            />
          </DetailCard>
        </TabsContent>

        {movements.length > 0 && (
          <TabsContent value="movements" className="mt-4">
            <DetailCard title="Cash Movements" padded={false}>
              <DataGrid
                rows={movements}
                columns={[
                  { header: "Date", cell: (r: any) => new Date(r.occurred_at).toLocaleString() },
                  { header: "Account", cell: (r: any) => r.cash_accounts?.name ?? "—" },
                  { header: "Type", cell: (r: any) => <StatusBadge tone={r.kind === "deposit" ? "success" : "warning"}>{r.kind}</StatusBadge> },
                  { header: "Reference", cell: (r: any) => r.reference ?? "—" },
                  { header: "Amount", align: "right", cell: (r: any) => <span className="font-mono">{money(r.amount, r.currency)}</span> },
                ]}
              />
            </DetailCard>
          </TabsContent>
        )}

        {topCategories.length > 0 && (
          <TabsContent value="breakdown" className="mt-4">
            <DetailCard title="This Month by Category">
              <div className="space-y-3">
                {topCategories.map(([cat, amt]) => {
                  const max = topCategories[0][1] || 1;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-sm">
                        <span className="capitalize">{cat}</span>
                        <span className="font-mono">{money(amt)}</span>
                      </div>
                      <div className="mt-1 h-2 bg-muted rounded">
                        <div className="h-2 rounded bg-solar" style={{ width: `${Math.max(4, (amt / max) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </DetailCard>
          </TabsContent>
        )}
      </Tabs>

      {expenseOpen && (
        <ExpenseDialog
          accounts={accounts}
          expense={editing}
          onClose={() => { setExpenseOpen(false); setEditing(null); }}
          onSaved={refresh}
        />
      )}
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} onSaved={refresh} />}
      {moveKind && (
        <MovementDialog kind={moveKind} accounts={accounts} onClose={() => setMoveKind(null)} onSaved={refresh} />
      )}
    </PageShell>
  );
}

function ExpenseDialog({ accounts, expense, onClose, onSaved }: {
  accounts: any[]; expense: any | null; onClose: () => void; onSaved: () => void;
}) {
  const fn = useServerFn(upsertExpense);
  const [form, setForm] = useState({
    expense_date: expense?.expense_date ?? new Date().toISOString().slice(0, 10),
    category: expense?.category ?? "general",
    vendor: expense?.vendor ?? "",
    description: expense?.description ?? "",
    amount: expense ? String(expense.amount) : "",
    currency: expense?.currency ?? "USD",
    account_id: expense?.account_id ?? accounts[0]?.id ?? "",
    payment_method: expense?.payment_method ?? "cash",
    reference: expense?.reference ?? "",
    status: expense?.status ?? "paid",
    notes: expense?.notes ?? "",
  });

  const save = useMutation({
    mutationFn: () => fn({ data: { id: expense?.id, ...form, amount: Number(form.amount) } as any }),
    onSuccess: () => { toast.success(expense ? "Expense updated" : "Expense recorded"); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e?.message || "Could not save expense"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{expense ? "Edit expense" : "Record expense"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Date</Label>
            <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
          <div className="space-y-1"><Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="col-span-2 space-y-1"><Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What was this spend for?" /></div>
          <div className="space-y-1"><Label>Vendor / payee</Label>
            <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
          <div className="space-y-1"><Label>Amount</Label>
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-1"><Label>Paid from</Label>
            <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
              <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
              <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>Method</Label>
            <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending approval</SelectItem>
              </SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>Reference</Label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
          <div className="col-span-2 space-y-1"><Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
            {save.isPending ? "Saving…" : expense ? "Save changes" : "Record expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const fn = useServerFn(upsertCashAccount);
  const [form, setForm] = useState({ name: "", kind: "cash", currency: "USD", opening_balance: "0", is_default: false });
  const save = useMutation({
    mutationFn: () => fn({ data: { ...form, opening_balance: Number(form.opening_balance) } }),
    onSuccess: () => { toast.success("Account created"); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e?.message || "Could not create account"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New cash / bank account</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Harare Branch Petty Cash" /></div>
          <div className="space-y-1"><Label>Type</Label>
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="mobile">Mobile money</SelectItem>
              </SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>Currency</Label>
            <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></div>
          <div className="space-y-1"><Label>Opening balance</Label>
            <Input type="number" step="0.01" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></div>
          <div className="space-y-1"><Label>Default cash drawer</Label>
            <Select value={form.is_default ? "yes" : "no"} onValueChange={(v) => setForm({ ...form, is_default: v === "yes" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent>
            </Select></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            <Plus className="h-4 w-4 mr-1.5" />{save.isPending ? "Saving…" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementDialog({ kind, accounts, onClose, onSaved }: {
  kind: "deposit" | "withdrawal"; accounts: any[]; onClose: () => void; onSaved: () => void;
}) {
  const fn = useServerFn(recordCashMovement);
  const [form, setForm] = useState({
    account_id: accounts[0]?.id ?? "", amount: "", currency: accounts[0]?.currency ?? "USD",
    reference: "", notes: "",
  });
  const save = useMutation({
    mutationFn: () => fn({ data: { ...form, kind, amount: Number(form.amount) } }),
    onSuccess: () => { toast.success(`Cash ${kind} recorded`); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e?.message || "Could not record movement"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="capitalize">Cash {kind}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label>Account</Label>
            <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
              <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
              <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>Amount</Label>
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-1"><Label>Reference</Label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
          <div className="col-span-2 space-y-1"><Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Record"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
