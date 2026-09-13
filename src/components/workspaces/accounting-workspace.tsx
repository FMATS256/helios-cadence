import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, DetailCard, StatusBadge,
} from "@/components/enterprise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, RefreshCw, Plus, Trash2, Undo2, Scale } from "lucide-react";
import { fmtCurrency } from "@/lib/currency.shared";
import {
  getAccounting, postLedger, saveAccount, createJournalEntry, reverseJournalEntry,
} from "@/lib/accounting.functions";
import { cn } from "@/lib/utils";

export type AccountingSection = "accounts" | "journal" | "trial" | "balance";

const usd = (n: number) => fmtCurrency(n, "USD");
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

function download(name: string, rows: Record<string, any>[]) {
  if (!rows.length) { toast.error("Nothing to export"); return; }
  const keys = Object.keys(rows[0]!);
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

const META: Record<AccountingSection, { eyebrow: string; title: string; description: string }> = {
  accounts: {
    eyebrow: "Accounting", title: "Chart of Accounts",
    description: "Every account money can land in — assets, liabilities, equity, income and costs — with live balances.",
  },
  journal: {
    eyebrow: "Accounting", title: "General Journal",
    description: "Double-entry postings behind every invoice, payment, refund, credit, expense and cash movement.",
  },
  trial: {
    eyebrow: "Accounting", title: "Trial Balance",
    description: "Debit and credit totals per account, proving the books balance before reporting.",
  },
  balance: {
    eyebrow: "Accounting", title: "Balance Sheet",
    description: "What the business owns and owes, with retained and current-period earnings.",
  },
};

const TYPE_TONE: Record<string, string> = {
  asset: "info", liability: "warning", equity: "neutral", income: "success", expense: "danger",
};

export function AccountingPage({ section }: { section: AccountingSection }) {
  const qc = useQueryClient();
  const fn = useServerFn(getAccounting);
  const postFn = useServerFn(postLedger);
  const { data, isLoading, error } = useQuery({
    queryKey: ["accounting"],
    queryFn: async () => (await fn()) as any,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["accounting"] });

  const post = useMutation({
    mutationFn: () => postFn(),
    onSuccess: (r: any) => {
      toast.success(r?.created ? `Posted ${r.created} new entr${r.created === 1 ? "y" : "ies"} to the ledger` : "Ledger already up to date");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Could not post to the ledger"),
  });

  const meta = META[section];
  const chips = useMemo(() => {
    const s = data?.stats;
    if (!s) return [];
    return [
      { label: "Accounts", value: String(s.accounts), color: "#1d4ed8" },
      { label: "Journal Entries", value: String(s.entries), color: "#4338ca" },
      { label: "Assets", value: usd(s.assets), color: "#0d9488" },
      { label: "Liabilities", value: usd(s.liabilities), color: "#b91c1c" },
      { label: "Equity", value: usd(s.equity), color: "#b45309" },
      { label: "Net Profit", value: usd(s.netProfit), color: "#15803d" },
    ];
  }, [data]);

  return (
    <PageShell>
      <SectionHeader
        eyebrow={meta.eyebrow}
        title={meta.title}
        description={meta.description}
        actions={
          <Button size="sm" variant="outline" onClick={() => post.mutate()} disabled={post.isPending}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", post.isPending && "animate-spin")} />
            {post.isPending ? "Posting…" : "Post to ledger"}
          </Button>
        }
      />
      {error ? (
        <DetailCard title="Access">
          <p className="text-sm text-muted-foreground">{(error as any)?.message || "Unable to load accounting data."}</p>
        </DetailCard>
      ) : (
        <>
          <StatChipRow chips={chips} cols={6} />
          {data && !data.stats.balanced && (
            <DetailCard title="Ledger check">
              <p className="text-sm text-destructive">
                Debits ({usd(data.tbTotals.debit)}) and credits ({usd(data.tbTotals.credit)}) do not agree. Post to the ledger, then review recent manual entries.
              </p>
            </DetailCard>
          )}
          {section === "accounts" && <Accounts data={data} loading={isLoading} onDone={refresh} />}
          {section === "journal" && <Journal data={data} loading={isLoading} onDone={refresh} />}
          {section === "trial" && <Trial data={data} loading={isLoading} />}
          {section === "balance" && <BalanceSheet data={data} />}
        </>
      )}
    </PageShell>
  );
}

// ---------- Chart of accounts ----------------------------------------------

function Accounts({ data, loading, onDone }: { data: any; loading: boolean; onDone: () => void }) {
  const accounts: any[] = data?.accounts ?? [];
  const tb: any[] = data?.trialBalance ?? [];
  const balByCode = new Map(tb.map((r) => [r.code, r.balance]));
  const [editing, setEditing] = useState<any | null>(null);

  return (
    <>
      <DetailCard
        title={`Accounts (${accounts.length})`}
        padded={false}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => download("chart-of-accounts.csv", accounts.map((a) => ({
              code: a.code, name: a.name, type: a.type, category: a.category, normal_balance: a.normal_balance,
              active: a.is_active, balance_usd: balByCode.get(a.code) ?? 0,
            })))}>
              <Download className="h-3.5 w-3.5 mr-1.5" />Export
            </Button>
            <Button size="sm" onClick={() => setEditing({ code: "", name: "", type: "expense", category: "Operating Expenses" })}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />New account
            </Button>
          </div>
        }
      >
        <DataGrid
          rows={accounts}
          loading={loading}
          empty="No accounts yet."
          onRowClick={(r: any) => setEditing({ ...r })}
          columns={[
            { header: "Code", cell: (r: any) => <span className="font-mono font-medium">{r.code}</span> },
            { header: "Account", cell: (r: any) => (
              <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.category ?? "—"}</p></div>
            ) },
            { header: "Type", cell: (r: any) => <StatusBadge tone={(TYPE_TONE[r.type] ?? "neutral") as any}>{r.type}</StatusBadge> },
            { header: "Normal", cell: (r: any) => <span className="capitalize text-muted-foreground">{r.normal_balance}</span> },
            { header: "Balance", align: "right", cell: (r: any) => <span className="font-mono">{usd(Number(balByCode.get(r.code) ?? 0))}</span> },
            { header: "Status", cell: (r: any) => <StatusBadge tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "active" : "inactive"}</StatusBadge> },
          ]}
        />
      </DetailCard>
      {editing && <AccountDialog account={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); onDone(); }} />}
    </>
  );
}

function AccountDialog({ account, onClose, onDone }: { account: any; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    code: account.code ?? "", name: account.name ?? "", type: account.type ?? "expense",
    category: account.category ?? "", description: account.description ?? "",
    normal_balance: account.normal_balance ?? "debit", is_active: account.is_active ?? true,
  });
  const fn = useServerFn(saveAccount);
  const save = useMutation({
    mutationFn: () => fn({ data: { id: account.id ?? null, ...form } as any }),
    onSuccess: () => { toast.success(account.id ? "Account updated" : "Account created"); onDone(); },
    onError: (e: any) => toast.error(e?.message || "Could not save the account"),
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{account.id ? `Edit ${account.name}` : "New account"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="6700" disabled={account.is_system} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v)} disabled={account.is_system}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["asset", "liability", "equity", "income", "expense"].map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Training & Development" />
          </div>
          <div className="space-y-1.5">
            <Label>Group</Label>
            <Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Operating Expenses" />
          </div>
          <div className="space-y-1.5">
            <Label>Normal balance</Label>
            <Select value={form.normal_balance} onValueChange={(v) => set("normal_balance", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="debit">Debit</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          {account.id && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.is_active ? "active" : "inactive"} onValueChange={(v) => set("is_active", v === "active")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save account"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Journal --------------------------------------------------------

function Journal({ data, loading, onDone }: { data: any; loading: boolean; onDone: () => void }) {
  const journal: any[] = data?.journal ?? [];
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<any | null>(null);
  const [manual, setManual] = useState(false);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return journal;
    return journal.filter((e) =>
      [e.memo, e.source_ref, e.source_type, e.customer, ...(e.lines ?? []).map((l: any) => l.account_name)]
        .filter(Boolean).some((v: any) => String(v).toLowerCase().includes(t)));
  }, [journal, q]);

  return (
    <>
      <DetailCard
        title={`Journal Entries (${rows.length})`}
        padded={false}
        action={
          <div className="flex flex-wrap gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memo, reference, account…" className="h-9 w-full sm:w-56" />
            <Button size="sm" variant="outline" onClick={() => download("general-journal.csv", rows.flatMap((e) => (e.lines ?? []).map((l: any) => ({
              entry_no: e.entry_no, date: e.entry_date, source: e.source_type, reference: e.source_ref,
              memo: e.memo, account: l.account_code, account_name: l.account_name, debit: l.debit, credit: l.credit,
            }))))}>
              <Download className="h-3.5 w-3.5 mr-1.5" />Export
            </Button>
            <Button size="sm" onClick={() => setManual(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Manual entry
            </Button>
          </div>
        }
      >
        <DataGrid
          rows={rows}
          loading={loading}
          empty="Nothing posted yet — use Post to ledger to bring the books up to date."
          onRowClick={(r: any) => setOpen(r)}
          columns={[
            { header: "#", cell: (r: any) => <span className="font-mono text-xs">{r.entry_no}</span> },
            { header: "Date", cell: (r: any) => fmtDate(r.entry_date) },
            { header: "Source", cell: (r: any) => <StatusBadge tone="neutral">{String(r.source_type).replace(/_/g, " ")}</StatusBadge> },
            { header: "Memo", cell: (r: any) => (
              <div className="max-w-[22rem]"><p className="font-medium truncate">{r.memo ?? "—"}</p>
                <p className="text-xs text-muted-foreground truncate">{r.source_ref ?? r.customer ?? "—"}</p></div>
            ) },
            { header: "Accounts", cell: (r: any) => <span className="text-xs text-muted-foreground">{(r.lines ?? []).map((l: any) => l.account_code).join(" / ")}</span> },
            { header: "Debit", align: "right", cell: (r: any) => <span className="font-mono">{usd(Number(r.total_debit))}</span> },
            { header: "Credit", align: "right", cell: (r: any) => <span className="font-mono">{usd(Number(r.total_credit))}</span> },
          ]}
        />
      </DetailCard>
      {open && <EntryDialog entry={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); onDone(); }} />}
      {manual && <ManualEntryDialog accounts={data?.accounts ?? []} onClose={() => setManual(false)} onDone={() => { setManual(false); onDone(); }} />}
    </>
  );
}

function EntryDialog({ entry, onClose, onDone }: { entry: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const fn = useServerFn(reverseJournalEntry);
  const reverse = useMutation({
    mutationFn: () => fn({ data: { id: entry.id, reason: reason.trim() || undefined } }),
    onSuccess: () => { toast.success("Entry reversed"); onDone(); },
    onError: (e: any) => toast.error(e?.message || "Could not reverse the entry"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Entry #{entry.entry_no} · {fmtDate(entry.entry_date)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">{entry.memo}</p>
          <p className="text-xs text-muted-foreground">
            {String(entry.source_type).replace(/_/g, " ")}{entry.source_ref ? ` · ${entry.source_ref}` : ""}
            {entry.customer ? ` · ${entry.customer}` : ""} · {entry.currency} @ {Number(entry.fx_rate)}
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left px-3 py-2">Account</th><th className="text-right px-3 py-2">Debit</th><th className="text-right px-3 py-2">Credit</th></tr>
              </thead>
              <tbody>
                {(entry.lines ?? []).map((l: any) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs mr-2">{l.account_code}</span>{l.account_name}
                      {l.description && <p className="text-xs text-muted-foreground">{l.description}</p>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{Number(l.debit) ? usd(Number(l.debit)) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{Number(l.credit) ? usd(Number(l.credit)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/40 font-semibold">
                <tr><td className="px-3 py-2">Totals</td>
                  <td className="px-3 py-2 text-right font-mono">{usd(Number(entry.total_debit))}</td>
                  <td className="px-3 py-2 text-right font-mono">{usd(Number(entry.total_credit))}</td></tr>
              </tfoot>
            </table>
          </div>
          <div className="space-y-1.5">
            <Label>Reversal reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Posted in error" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="destructive" onClick={() => reverse.mutate()} disabled={reverse.isPending}>
            <Undo2 className="h-3.5 w-3.5 mr-1.5" />{reverse.isPending ? "Reversing…" : "Reverse entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DraftLine = { account_code: string; debit: string; credit: string; description: string };

function ManualEntryDialog({ accounts, onClose, onDone }: { accounts: any[]; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { account_code: "", debit: "", credit: "", description: "" },
    { account_code: "", debit: "", credit: "", description: "" },
  ]);
  const fn = useServerFn(createJournalEntry);
  const create = useMutation({
    mutationFn: () => fn({ data: {
      entry_date: date, memo,
      lines: lines.map((l) => ({ account_code: l.account_code, debit: Number(l.debit || 0), credit: Number(l.credit || 0), description: l.description })),
    } }),
    onSuccess: () => { toast.success("Journal entry posted"); onDone(); },
    onError: (e: any) => toast.error(e?.message || "Could not post the entry"),
  });

  const debit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const credit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(debit - credit) < 0.009 && debit > 0;
  const setLine = (i: number, k: keyof DraftLine, v: string) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Manual journal entry</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Memo</Label>
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Depreciation for the month" />
            </div>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-12 items-end">
                <div className="sm:col-span-5 space-y-1.5">
                  {i === 0 && <Label>Account</Label>}
                  <Select value={l.account_code} onValueChange={(v) => setLine(i, "account_code", v)}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.filter((a) => a.is_active).map((a) => (
                        <SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-3 space-y-1.5">
                  {i === 0 && <Label>Narration</Label>}
                  <Input value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  {i === 0 && <Label>Debit</Label>}
                  <Input inputMode="decimal" value={l.debit} onChange={(e) => setLine(i, "debit", e.target.value)} />
                </div>
                <div className="sm:col-span-1 space-y-1.5">
                  {i === 0 && <Label>Credit</Label>}
                  <Input inputMode="decimal" value={l.credit} onChange={(e) => setLine(i, "credit", e.target.value)} />
                </div>
                <div className="sm:col-span-1">
                  <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} disabled={lines.length <= 2}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { account_code: "", debit: "", credit: "", description: "" }])}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add line
            </Button>
          </div>
          <div className={cn("flex items-center gap-2 text-sm", balanced ? "text-success" : "text-destructive")}>
            <Scale className="h-4 w-4" />
            Debits {usd(debit)} · Credits {usd(credit)} {balanced ? "· balanced" : "· must balance before posting"}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!balanced || create.isPending}>
            {create.isPending ? "Posting…" : "Post entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Trial balance --------------------------------------------------

function Trial({ data, loading }: { data: any; loading: boolean }) {
  const rows: any[] = (data?.trialBalance ?? []).filter((r: any) => r.debit || r.credit);
  const totals = data?.tbTotals ?? { dr: 0, cr: 0 };
  return (
    <DetailCard
      title="Trial Balance"
      padded={false}
      action={
        <Button size="sm" variant="outline" onClick={() => download("trial-balance.csv", rows.map((r) => ({
          code: r.code, account: r.name, type: r.type, debit: r.debit_balance, credit: r.credit_balance,
        })))}>
          <Download className="h-3.5 w-3.5 mr-1.5" />Export
        </Button>
      }
    >
      <DataGrid
        rows={rows}
        loading={loading}
        empty="No postings yet."
        columns={[
          { header: "Code", cell: (r: any) => <span className="font-mono">{r.code}</span> },
          { header: "Account", cell: (r: any) => <span className="font-medium">{r.name}</span> },
          { header: "Type", cell: (r: any) => <StatusBadge tone={(TYPE_TONE[r.type] ?? "neutral") as any}>{r.type}</StatusBadge> },
          { header: "Debit", align: "right", cell: (r: any) => <span className="font-mono">{r.debit_balance ? usd(r.debit_balance) : "—"}</span> },
          { header: "Credit", align: "right", cell: (r: any) => <span className="font-mono">{r.credit_balance ? usd(r.credit_balance) : "—"}</span> },
        ]}
      />
      <div className="flex flex-wrap items-center justify-end gap-6 border-t border-border px-5 py-3 text-sm font-semibold">
        <span>Total debits <span className="font-mono ml-2">{usd(totals.dr)}</span></span>
        <span>Total credits <span className="font-mono ml-2">{usd(totals.cr)}</span></span>
        <span className={Math.abs(totals.dr - totals.cr) < 0.05 ? "text-success" : "text-destructive"}>
          {Math.abs(totals.dr - totals.cr) < 0.05 ? "In balance" : `Out by ${usd(Math.abs(totals.dr - totals.cr))}`}
        </span>
      </div>
    </DetailCard>
  );
}

// ---------- Balance sheet --------------------------------------------------

function GroupBlock({ groups }: { groups: any[] }) {
  if (!groups.length) return <p className="text-sm text-muted-foreground">Nothing posted.</p>;
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.category}>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{g.category}</p>
          <div className="mt-1 divide-y divide-border">
            {g.rows.map((r: any) => (
              <div key={r.code} className="flex items-center justify-between py-1.5 text-sm">
                <span><span className="font-mono text-xs mr-2 text-muted-foreground">{r.code}</span>{r.name}</span>
                <span className="font-mono">{usd(r.balance)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-1.5 text-sm font-semibold">
              <span>Total {g.category}</span><span className="font-mono">{usd(g.total)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BalanceSheet({ data }: { data: any }) {
  const bs = data?.balanceSheet;
  const is = data?.incomeStatement;
  if (!bs) return <DetailCard title="Balance Sheet"><p className="text-sm text-muted-foreground">Loading…</p></DetailCard>;
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailCard title={`Assets · ${usd(bs.assets.total)}`}><GroupBlock groups={bs.assets.groups} /></DetailCard>
        <div className="space-y-4">
          <DetailCard title={`Liabilities · ${usd(bs.liabilities.total)}`}><GroupBlock groups={bs.liabilities.groups} /></DetailCard>
          <DetailCard title={`Equity · ${usd(bs.equity.total)}`}>
            <GroupBlock groups={bs.equity.groups} />
            <div className="mt-3 divide-y divide-border">
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span>Current period earnings</span><span className="font-mono">{usd(bs.equity.currentEarnings)}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 text-sm font-semibold">
                <span>Total equity</span><span className="font-mono">{usd(bs.equity.total)}</span>
              </div>
            </div>
          </DetailCard>
        </div>
      </div>

      <DetailCard title="Balance check">
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <span>Assets <span className="font-mono font-semibold ml-2">{usd(bs.assets.total)}</span></span>
          <span>Liabilities + Equity <span className="font-mono font-semibold ml-2">{usd(bs.liabilities.total + bs.equity.total)}</span></span>
          <span className={Math.abs(bs.check) < 0.05 ? "text-success font-semibold" : "text-destructive font-semibold"}>
            {Math.abs(bs.check) < 0.05 ? "Balanced" : `Difference ${usd(bs.check)}`}
          </span>
        </div>
      </DetailCard>

      {is && (
        <div className="grid gap-4 lg:grid-cols-2">
          <DetailCard title={`Income · ${usd(is.totalIncome)}`}><GroupBlock groups={is.income} /></DetailCard>
          <DetailCard title={`Costs & Expenses · ${usd(is.totalExpense)}`}>
            <GroupBlock groups={is.expense} />
            <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
              <span>Net profit ({is.margin}% margin)</span>
              <span className={cn("font-mono", is.netProfit >= 0 ? "text-success" : "text-destructive")}>{usd(is.netProfit)}</span>
            </div>
          </DetailCard>
        </div>
      )}
    </>
  );
}
