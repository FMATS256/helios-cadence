import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  createVoipAccount, updateVoipAccount,
  recordVoipRecharge, syncVoipAccount, lookupDandemutandeVoip,
} from "@/lib/voip.functions";
import { getVoipOverview } from "@/lib/infra.functions";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, DetailCard, StatusBadge, EmptyState,
  RefreshButton, type ColumnDef,
} from "@/components/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { PhoneCall, Plus, RefreshCw, Wallet, AlertTriangle, CheckCircle2, Ban, ReceiptText, Search } from "lucide-react";

export const Route = createFileRoute("/voip")({
  head: () => ({
    meta: [
      { title: "VoIP Management — IMT Operations" },
      { name: "description", content: "Manage Dandemutande VoIP customer accounts, balances, recharges and Proof of Payment." },
      { property: "og:title", content: "VoIP Management — IMT Operations" },
      { property: "og:description", content: "VoIP numbers, balances, recharges and proof of payment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VoipPage,
});

function fmtMoney(n: number | null | undefined) {
  return `USD ${Number(n ?? 0).toFixed(2)}`;
}
function fmtDate(s?: string | null) { return s ? new Date(s).toLocaleString() : "—"; }

function VoipPage() {
  const { user, loading } = useAuth();
  const overviewFn = useServerFn(getVoipOverview);
  const authReady = !loading && !!user;

  const overview = useQuery({
    queryKey: ["voip-overview"],
    queryFn: () => overviewFn(),
    enabled: authReady,
    refetchInterval: authReady ? 60_000 : false,
  });

  const accounts = overview.data?.accounts ?? [];
  const recharges = overview.data?.recharges ?? [];
  const stats = overview.data?.stats;

  const [addOpen, setAddOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [rechargeFor, setRechargeFor] = useState<any | null>(null);
  const [balanceFor, setBalanceFor] = useState<any | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a: any) =>
      [a.voip_number, a.dandemutande_account, a.sip_username, a.customers?.company_name, a.customers?.account_number]
        .some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [accounts, search]);

  const alerts = accounts.filter((a: any) => a.low_balance || a.status === "suspended");
  const refreshAll = () => overview.refetch();

  const accountCols: ColumnDef<any>[] = [
    {
      header: "VoIP number",
      cell: (a) => (
        <div>
          <div className="font-mono font-semibold">{a.voip_number}</div>
          <div className="text-xs text-muted-foreground">{a.dandemutande_account ?? "No Dandemutande account"}</div>
        </div>
      ),
    },
    {
      header: "Customer",
      cell: (a) => a.customers ? (
        <div>
          <div className="text-sm">{a.customers.company_name}</div>
          <Link to="/customers/$accountNumber" params={{ accountNumber: a.customers.account_number }} className="font-mono text-xs text-solar hover:underline">{a.customers.account_number}</Link>
        </div>
      ) : <span className="text-xs text-muted-foreground">Unassigned</span>,
    },
    {
      header: "Balance", align: "right",
      cell: (a) => (
        <div>
          <div className={`font-mono font-semibold ${a.low_balance ? "text-destructive" : ""}`}>{fmtMoney(a.balance_usd)}</div>
          <div className="text-xs text-muted-foreground">threshold {fmtMoney(a.low_balance_threshold_usd)}</div>
        </div>
      ),
    },
    { header: "Extensions", align: "center", cell: (a) => <span className="font-mono text-sm">{a.extension_count || 0}</span> },
    { header: "Status", cell: (a) => <StatusBadge tone={a.status === "active" ? "success" : a.status === "suspended" ? "danger" : "neutral"}>{a.status}</StatusBadge> },
    { header: "Last synced", cell: (a) => <span className="text-xs text-muted-foreground">{fmtDate(a.last_synced_at)}</span> },
    {
      header: "Actions", align: "right",
      cell: (a) => (
        <div className="flex items-center justify-end gap-1">
          <SyncButton id={a.id} />
          <Button size="sm" variant="outline" onClick={() => setBalanceFor(a)}>Balance</Button>
          <Button size="sm" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }} onClick={() => setRechargeFor(a)}>Recharge</Button>
        </div>
      ),
    },
  ];

  const rechargeCols: ColumnDef<any>[] = [
    { header: "Receipt", cell: (r) => <span className="font-mono text-xs">{r.receipt_number}</span> },
    { header: "Number", cell: (r) => <span className="font-mono text-sm">{r.voip_accounts?.voip_number ?? "—"}</span> },
    { header: "Amount", align: "right", cell: (r) => <span className="font-mono font-semibold">{fmtMoney(r.amount_usd)}</span> },
    { header: "Reference", cell: (r) => <span className="text-xs text-muted-foreground">{r.payment_reference ?? "—"}</span> },
    { header: "POP email", cell: (r) => <StatusBadge tone={r.email_status === "sent" ? "success" : r.email_status === "failed" ? "danger" : "neutral"}>{r.email_status ?? "—"}</StatusBadge> },
    { header: "Status", cell: (r) => <StatusBadge tone={r.status === "verified" ? "success" : r.status === "submitted" ? "info" : "neutral"}>{r.status}</StatusBadge> },
    { header: "Date", cell: (r) => <span className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</span> },
  ];

  if (loading) return <PageShell><div className="p-6 text-sm text-muted-foreground">Loading…</div></PageShell>;

  if (!user) {
    return (
      <PageShell>
        <SectionHeader eyebrow="Communications" title="Dandemutande VoIP" description="Sign in to manage VoIP numbers, balances, recharges and Proof of Payment." />
        <Card><CardContent className="p-6 text-sm">Please <Link to="/auth" className="font-medium text-solar underline">sign in</Link> to continue.</CardContent></Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Communications"
        title="Dandemutande VoIP"
        description="Manage VoIP numbers, monitor balances, log recharges and email Proof of Payment to Dandemutande support."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onClick={refreshAll} loading={overview.isFetching} />
            <Dialog open={lookupOpen} onOpenChange={setLookupOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Search className="mr-1.5 h-4 w-4" /> Lookup number</Button>
              </DialogTrigger>
              <LookupDialog />
            </Dialog>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                  <Plus className="mr-1.5 h-4 w-4" /> Add VoIP number
                </Button>
              </DialogTrigger>
              <AddVoipDialog onDone={() => { setAddOpen(false); refreshAll(); }} />
            </Dialog>
          </div>
        }
      />

      <KpiRow
        cols={5}
        items={[
          { label: "Active accounts", value: stats?.active ?? 0, icon: PhoneCall, tone: "success", hint: stats ? `${stats.total} total numbers` : undefined },
          { label: "Total balance", value: fmtMoney(stats?.totalBalance ?? 0), icon: Wallet, tone: "solar", hint: stats ? `${stats.extensions} extensions` : undefined },
          { label: "Recharges today", value: fmtMoney(stats?.rechargedToday ?? 0), icon: ReceiptText, tone: "info", hint: stats ? `${stats.rechargesToday} transactions` : undefined },
          { label: "Low balance", value: stats?.lowBalance ?? 0, icon: AlertTriangle, tone: stats?.lowBalance ? "danger" : "neutral", hint: "at or below threshold" },
          { label: "Suspended", value: stats?.suspended ?? 0, icon: Ban, tone: stats?.suspended ? "warning" : "neutral", hint: stats?.failedEmails ? `${stats.failedEmails} failed POP emails` : undefined },
        ]}
      />

      <Tabs defaultValue="accounts">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="accounts">Accounts ({accounts.length})</TabsTrigger>
          <TabsTrigger value="recharges">Recharges ({recharges.length})</TabsTrigger>
          <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4">
          <DetailCard
            title="VoIP accounts"
            padded={false}
            action={
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, account, customer…" className="h-9 pl-9" />
              </div>
            }
          >
            <DataGrid
              rows={filtered}
              columns={accountCols}
              loading={overview.isLoading}
              empty={<EmptyState title="No VoIP numbers" description="Add your first number to track balances and recharges." icon={PhoneCall} />}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="recharges" className="mt-4">
          <DetailCard title="Recharge history" padded={false}>
            <DataGrid
              rows={recharges}
              columns={rechargeCols}
              loading={overview.isLoading}
              empty={<EmptyState title="No recharges yet" description="Recorded recharges will appear here with receipts and POP status." icon={ReceiptText} />}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <DetailCard title="Account alerts">
            {alerts.length === 0 ? (
              <div className="flex items-center gap-2 p-4 text-sm text-success"><CheckCircle2 className="h-5 w-5" /> All VoIP accounts healthy.</div>
            ) : (
              <div className="space-y-2">
                {alerts.map((a: any) => (
                  <div key={a.id} className={`flex items-center gap-3 rounded-lg border p-3 ${a.status === "suspended" ? "border-warning/40 bg-warning/5" : "border-destructive/30 bg-destructive/5"}`}>
                    {a.status === "suspended" ? <Ban className="h-5 w-5 text-warning" /> : <AlertTriangle className="h-5 w-5 text-destructive" />}
                    <div className="flex-1">
                      <div className="font-mono font-semibold">{a.voip_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.status === "suspended" ? "Account suspended — recharge to reactivate." : `Balance ${fmtMoney(a.balance_usd)} · Threshold ${fmtMoney(a.low_balance_threshold_usd)}`}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => setRechargeFor(a)}>Recharge</Button>
                  </div>
                ))}
              </div>
            )}
          </DetailCard>
        </TabsContent>
      </Tabs>

      {rechargeFor && (
        <Dialog open={!!rechargeFor} onOpenChange={() => setRechargeFor(null)}>
          <RechargeDialog account={rechargeFor} onDone={() => { setRechargeFor(null); refreshAll(); }} />
        </Dialog>
      )}
      {balanceFor && (
        <Dialog open={!!balanceFor} onOpenChange={() => setBalanceFor(null)}>
          <BalanceDialog account={balanceFor} onDone={() => { setBalanceFor(null); refreshAll(); }} />
        </Dialog>
      )}
    </PageShell>
  );
}

function SyncButton({ id }: { id: string }) {
  const fn = useServerFn(syncVoipAccount);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => fn({ data: { id } }),
    onSuccess: () => { toast.success("Synced (portal balance requires manual entry)"); qc.invalidateQueries({ queryKey: ["voip-overview"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return <Button size="sm" variant="ghost" onClick={() => m.mutate()} disabled={m.isPending}><RefreshCw className={`h-4 w-4 ${m.isPending ? "animate-spin" : ""}`} /></Button>;
}

function AddVoipDialog({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({
    customer_id: "", voip_number: "", dandemutande_account: "", sip_username: "", sip_password: "",
    extensions: "", balance_usd: 0, low_balance_threshold_usd: 5, status: "active", notes: "",
  });
  const customersQ = useQuery({
    queryKey: ["customers-select"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id,company_name,account_number").is("archived_at", null).order("company_name");
      return data ?? [];
    },
  });
  const fn = useServerFn(createVoipAccount);
  const m = useMutation({
    mutationFn: () => fn({ data: {
      customer_id: f.customer_id || null,
      voip_number: f.voip_number.trim(),
      dandemutande_account: f.dandemutande_account || undefined,
      sip_username: f.sip_username || undefined,
      sip_password: f.sip_password || undefined,
      extensions: f.extensions ? f.extensions.split(",").map((s) => s.trim()).filter(Boolean) : [],
      balance_usd: Number(f.balance_usd) || 0,
      low_balance_threshold_usd: Number(f.low_balance_threshold_usd) || 0,
      status: f.status,
      notes: f.notes || undefined,
    } }),
    onSuccess: () => { toast.success("VoIP number added — SIP password saved in vault"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Add VoIP number</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label>Customer</Label>
          <Select value={f.customer_id} onValueChange={(v) => setF({ ...f, customer_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>
              {(customersQ.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>VoIP number *</Label><Input required value={f.voip_number} onChange={(e) => setF({ ...f, voip_number: e.target.value })} placeholder="+263..." /></div>
        <div className="space-y-1.5"><Label>Dandemutande account #</Label><Input value={f.dandemutande_account} onChange={(e) => setF({ ...f, dandemutande_account: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>SIP username</Label><Input value={f.sip_username} onChange={(e) => setF({ ...f, sip_username: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>SIP password</Label><Input type="password" value={f.sip_password} onChange={(e) => setF({ ...f, sip_password: e.target.value })} placeholder="Stored encrypted in vault" /></div>
        <div className="space-y-1.5 md:col-span-2"><Label>Extensions (comma separated)</Label><Input value={f.extensions} onChange={(e) => setF({ ...f, extensions: e.target.value })} placeholder="100, 101, 102" /></div>
        <div className="space-y-1.5"><Label>Current balance (USD)</Label><Input type="number" step="0.01" value={f.balance_usd} onChange={(e) => setF({ ...f, balance_usd: Number(e.target.value) })} /></div>
        <div className="space-y-1.5"><Label>Low balance threshold (USD)</Label><Input type="number" step="0.01" value={f.low_balance_threshold_usd} onChange={(e) => setF({ ...f, low_balance_threshold_usd: Number(e.target.value) })} /></div>
        <div className="space-y-1.5"><Label>Status</Label>
          <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["active", "suspended", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <DialogFooter className="md:col-span-2"><Button type="submit" disabled={m.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{m.isPending ? "Saving…" : "Add VoIP number"}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function BalanceDialog({ account, onDone }: { account: any; onDone: () => void }) {
  const [balance, setBalance] = useState<number>(Number(account.balance_usd ?? 0));
  const [status, setStatus] = useState<string>(account.status);
  const fn = useServerFn(updateVoipAccount);
  const m = useMutation({
    mutationFn: () => fn({ data: { id: account.id, balance_usd: balance, status } }),
    onSuccess: () => { toast.success("Updated"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Update balance · <span className="font-mono">{account.voip_number}</span></DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="text-xs text-muted-foreground">Portal balance requires an authenticated Dandemutande session, which isn't available. Enter the balance manually from the portal or invoice.</div>
        <div className="space-y-1.5"><Label>Balance (USD)</Label><Input type="number" step="0.01" value={balance} onChange={(e) => setBalance(Number(e.target.value))} /></div>
        <div className="space-y-1.5"><Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["active", "suspended", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter><Button onClick={() => m.mutate()} disabled={m.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{m.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}

function LookupDialog() {
  const [number, setNumber] = useState("");
  const lookupFn = useServerFn(lookupDandemutandeVoip);
  const lookup = useMutation({
    mutationFn: () => lookupFn({ data: { voip_number: number } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const result: any = lookup.data;
  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader><DialogTitle>Dandemutande public lookup</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label>Number or account reference</Label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Enter VoIP number" />
          </div>
          <Button className="self-end" onClick={() => lookup.mutate()} disabled={lookup.isPending || !number.trim()}>
            <Search className="h-4 w-4 mr-1.5" /> {lookup.isPending ? "Searching…" : "Search"}
          </Button>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          This searches public Dandemutande pages and web results only. Balance and account-private data still require Dandemutande login credentials.
        </div>
        {result && (
          <div className="max-h-[55vh] overflow-auto space-y-4 pr-1">
            {result.error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{result.error}</div>}
            <div>
              <h3 className="text-sm font-semibold mb-2">Exact number matches</h3>
              {result.matches?.length ? result.matches.map((m: any, i: number) => (
                <a key={`${m.url}-${i}`} href={m.url} target="_blank" rel="noreferrer" className="block rounded-lg border p-3 hover:bg-muted/40 mb-2">
                  <div className="font-medium">{m.title || m.url}</div>
                  <div className="text-xs text-muted-foreground break-all">{m.url}</div>
                  <p className="text-sm mt-1 line-clamp-3">{m.description || String(m.markdown || "").slice(0, 240)}</p>
                </a>
              )) : <p className="text-sm text-muted-foreground">No exact public match found for this number.</p>}
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">Dandemutande self-service page</h3>
              <div className="rounded-lg border p-3 text-sm">
                <div className="font-medium">{result.portal?.title || "VoIP self-service"}</div>
                <p className="text-muted-foreground mt-1">{result.portal?.summary || result.portal?.markdown_preview || "No public summary available."}</p>
                {(result.portal?.links ?? []).slice(0, 8).map((link: string) => <div key={link} className="text-xs font-mono break-all text-muted-foreground">{link}</div>)}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">Other public search results</h3>
              {result.search_results?.length ? result.search_results.map((m: any, i: number) => (
                <a key={`${m.url}-result-${i}`} href={m.url} target="_blank" rel="noreferrer" className="block rounded-lg border p-3 hover:bg-muted/40 mb-2">
                  <div className="font-medium">{m.title || m.url}</div>
                  <div className="text-xs text-muted-foreground break-all">{m.url}</div>
                  <p className="text-sm mt-1 line-clamp-3">{m.description || m.markdown_preview}</p>
                </a>
              )) : <p className="text-sm text-muted-foreground">No public results returned.</p>}
            </div>
          </div>
        )}
      </div>
    </DialogContent>
  );
}

function RechargeDialog({ account, onDone }: { account: any; onDone: () => void }) {
  const [f, setF] = useState({ amount_usd: 10, payment_reference: "", payment_method: "bank_transfer", pop_url: "", notes: "", send_email: true });
  const fn = useServerFn(recordVoipRecharge);
  const m = useMutation({
    mutationFn: () => fn({ data: {
      voip_account_id: account.id,
      amount_usd: Number(f.amount_usd),
      payment_reference: f.payment_reference || undefined,
      payment_method: f.payment_method,
      pop_url: f.pop_url || undefined,
      notes: f.notes || undefined,
      send_email: f.send_email,
    } }),
    onSuccess: (r) => {
      toast.success(`Recharge recorded · Receipt ${r.receipt_number}${r.email_status === "sent" ? " · POP emailed to Dandemutande" : r.email_status === "failed" ? " · Email failed: " + r.email_error : ""}`);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Recharge · <span className="font-mono">{account.voip_number}</span></DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Amount (USD) *</Label><Input required type="number" step="0.01" min="0.01" value={f.amount_usd} onChange={(e) => setF({ ...f, amount_usd: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Method</Label>
            <Select value={f.payment_method} onValueChange={(v) => setF({ ...f, payment_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["bank_transfer", "ecocash", "card", "cash", "internal_credit"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label>Payment reference</Label><Input value={f.payment_reference} onChange={(e) => setF({ ...f, payment_reference: e.target.value })} placeholder="Bank ref / TX ID" /></div>
        <div className="space-y-1.5"><Label>Proof of payment URL</Label><Input value={f.pop_url} onChange={(e) => setF({ ...f, pop_url: e.target.value })} placeholder="Upload PDF to storage and paste URL" /></div>
        <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.send_email} onChange={(e) => setF({ ...f, send_email: e.target.checked })} /> Email POP to <code>[email protected]</code></label>
        <DialogFooter>
          <Button type="submit" disabled={m.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
            <ReceiptText className="h-4 w-4 mr-1.5" /> {m.isPending ? "Recording…" : "Record recharge"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
