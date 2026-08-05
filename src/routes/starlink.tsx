import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  checkStarlinkAccount,
  createStarlinkAccount,
  recordStarlinkRecharge,
  advanceStarlinkRecharge,
  getStarlinkRechargeWorkflow,
} from "@/lib/starlink.functions";
import { getStarlinkOverview } from "@/lib/infra.functions";
import {
  STARLINK_EXTERNAL_PAYOUT_USD, STARLINK_PLANS,
  ALLOWED_TRANSITIONS, RECHARGE_STATUS_LABELS, RECHARGE_STATUS_TONE, type RechargeStatus,
} from "@/lib/starlink.shared";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Activity, AlertTriangle, CheckCircle2, Plus, RefreshCw, Satellite, Search, WalletCards } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/starlink")({
  head: () => ({ meta: [{ title: "Starlink — IMT Operations" }, { name: "description", content: "Manage Starlink customer accounts, plans, account checks and recharge margins." }] }),
  component: StarlinkPage,
});

function money(n: number | string | null | undefined) {
  return `USD ${Number(n ?? 0).toFixed(2)}`;
}

function dateTime(s?: string | null) {
  return s ? new Date(s).toLocaleString() : "—";
}

function StarlinkPage() {
  const { user, loading } = useAuth();
  const overviewFn = useServerFn(getStarlinkOverview);
  const [addOpen, setAddOpen] = useState(false);
  const [rechargeFor, setRechargeFor] = useState<any | null>(null);
  const [workflowFor, setWorkflowFor] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const authReady = !loading && !!user;

  const overview = useQuery({ queryKey: ["starlink-overview"], queryFn: () => overviewFn(), enabled: authReady });
  const accounts = overview.data?.accounts ?? [];
  const recharges = overview.data?.recharges ?? [];
  const stats = overview.data?.stats;

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a: any) => [
      a.account_number, a.starlink_account_number, a.kit_serial,
      a.terminal_id, a.service_address, a.customers?.company_name,
    ].some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [accounts, search]);

  const accountCols: ColumnDef<any>[] = [
    {
      header: "Customer",
      cell: (a) => (
        <div>
          <div className="font-semibold">{a.customers?.company_name ?? "—"}</div>
          <Link to="/customers/$accountNumber" params={{ accountNumber: a.account_number }} className="font-mono text-xs text-solar hover:underline">{a.account_number}</Link>
        </div>
      ),
    },
    {
      header: "Starlink details",
      cell: (a) => (
        <div>
          <div className="font-mono text-xs">{a.starlink_account_number || "No Starlink account #"}</div>
          <div className="text-xs text-muted-foreground">Kit {a.kit_serial || "—"} · Terminal {a.terminal_id || "—"}</div>
          <div className="max-w-xs truncate text-xs text-muted-foreground">{a.service_address || "—"}</div>
        </div>
      ),
    },
    {
      header: "Plan",
      cell: (a) => (
        <div>
          <StatusBadge tone={a.plan_type === "business" ? "info" : "neutral"}>{a.plan_type}</StatusBadge>
          <div className="mt-1 text-xs font-mono">{money(a.monthly_price)}/mo</div>
        </div>
      ),
    },
    { header: "Balance", align: "right", cell: (a) => <span className="font-mono text-sm">{money(a.balance_usd)}</span> },
    { header: "Status", cell: (a) => <StatusBadge tone={a.status === "active" ? "success" : a.status === "suspended" ? "danger" : "neutral"}>{a.status}</StatusBadge> },
    { header: "Last checked", cell: (a) => <span className="text-xs text-muted-foreground">{dateTime(a.last_checked_at)}</span> },
    {
      header: "Actions", align: "right",
      cell: (a) => (
        <div className="flex items-center justify-end gap-1">
          <CheckButton id={a.id} />
          <Button size="sm" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }} onClick={() => setRechargeFor(a)}>Recharge</Button>
        </div>
      ),
    },
  ];

  const rechargeCols: ColumnDef<any>[] = [
    { header: "Reference", cell: (r) => <span className="font-mono text-xs">{r.payment_reference ?? "—"}</span> },
    {
      header: "Account",
      cell: (r) => (
        <div>
          <div className="font-mono text-xs">{r.starlink_accounts?.starlink_account_number ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{r.account_number}</div>
        </div>
      ),
    },
    { header: "Customer charge", align: "right", cell: (r) => <span className="font-mono">{money(r.customer_charge_usd)}</span> },
    { header: "External payout", align: "right", cell: (r) => <span className="font-mono">{money(r.external_payout_usd)}</span> },
    { header: "Margin", align: "right", cell: (r) => <span className="font-mono font-semibold text-success">{money(r.margin_usd)}</span> },
    {
      header: "Workflow",
      cell: (r) => {
        const st = (r.workflow_status ?? "pending_finance") as RechargeStatus;
        return (
          <div>
            <StatusBadge tone={RECHARGE_STATUS_TONE[st] ?? "neutral"}>{RECHARGE_STATUS_LABELS[st] ?? st}</StatusBadge>
            {r.next_check_at && ["awaiting_supplier"].includes(st) && (
              <div className="mt-1 text-[11px] text-muted-foreground">Next check {dateTime(r.next_check_at)}</div>
            )}
            {r.failure_reason && <div className="mt-1 max-w-[16rem] truncate text-[11px] text-destructive">{r.failure_reason}</div>}
          </div>
        );
      },
    },
    { header: "External", cell: (r) => <StatusBadge tone={r.external_status === "sent" || r.external_status === "confirmed" ? "success" : r.external_status === "failed" ? "danger" : "warning"}>{r.external_status}</StatusBadge> },
    { header: "Date", cell: (r) => <span className="text-xs text-muted-foreground">{dateTime(r.created_at)}</span> },
    {
      header: "Actions", align: "right",
      cell: (r) => <Button size="sm" variant="outline" onClick={() => setWorkflowFor(r)}>Manage</Button>,
    },
  ];

  if (loading) return <PageShell><div className="p-6 text-sm text-muted-foreground">Loading…</div></PageShell>;
  if (!user) {
    return (
      <PageShell>
        <SectionHeader eyebrow="Connectivity" title="Starlink" description="Sign in to manage Starlink accounts and recharges." />
        <Card><CardContent className="p-6 text-sm">Please <Link to="/auth" className="font-medium text-solar underline">sign in</Link> before checking accounts or recording recharges.</CardContent></Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Connectivity"
        title="Starlink"
        description="Track customer terminals, check account records, apply Residential or Business packages and record recharge margins."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onClick={() => overview.refetch()} loading={overview.isFetching} />
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add Starlink account
                </Button>
              </DialogTrigger>
              <AddStarlinkDialog onDone={() => { setAddOpen(false); overview.refetch(); }} />
            </Dialog>
          </div>
        }
      />

      <StatChipRow
        cols={5}
        chips={[
          { label: "Terminals", value: stats?.total ?? 0, color: "#4f46e5", hint: stats ? `${stats.business} business · ${stats.residential} residential` : undefined },
          { label: "Active", value: stats?.active ?? 0, color: "#10b981", hint: stats?.suspended ? `${stats.suspended} suspended` : undefined },
          { label: "Starlink MRR", value: money(stats?.mrr ?? 0), color: "#f59e0b", text: "#3b2606" },
          { label: "Margin (30d)", value: money(stats?.margin30d ?? 0), color: "#0ea5e9", hint: stats ? `${stats.recharges30d} recharges` : undefined },
          { label: "Needs check", value: stats?.needsCheck ?? 0, color: "#f43f5e", hint: stats?.failedExternal ? `${stats.failedExternal} failed sends` : "not checked in 7d" },
        ]}
      />


      <div className="grid gap-3 md:grid-cols-2">
        <PlanCard name="Residential" price={STARLINK_PLANS.residential.monthlyPrice} />
        <PlanCard name="Business" price={STARLINK_PLANS.business.monthlyPrice} />
      </div>

      <Tabs defaultValue="accounts">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="accounts">Accounts ({accounts.length})</TabsTrigger>
          <TabsTrigger value="recharges">Recharges ({recharges.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4">
          <DetailCard
            title="Customer Starlink accounts"
            padded={false}
            action={
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search account, kit, terminal…" className="pl-9 h-9" />
              </div>
            }
          >
            <DataGrid
              rows={filteredAccounts}
              columns={accountCols}
              loading={overview.isLoading}
              empty={<EmptyState title="No Starlink accounts" description="Add a customer terminal to start tracking plans and recharges." icon={Satellite} />}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="recharges" className="mt-4">
          <DetailCard title="Recharge history" padded={false}>
            <DataGrid
              rows={recharges}
              columns={rechargeCols}
              loading={overview.isLoading}
              empty={<EmptyState title="No recharges yet" description="Recorded recharges will show customer charge, payout and retained margin." icon={WalletCards} />}
            />
          </DetailCard>
        </TabsContent>
      </Tabs>

      {workflowFor && (
        <Dialog open={!!workflowFor} onOpenChange={() => setWorkflowFor(null)}>
          <RechargeWorkflowDialog recharge={workflowFor} onChanged={() => overview.refetch()} />
        </Dialog>
      )}

      {rechargeFor && (
        <Dialog open={!!rechargeFor} onOpenChange={() => setRechargeFor(null)}>
          <RechargeDialog account={rechargeFor} onDone={() => { setRechargeFor(null); overview.refetch(); }} />
        </Dialog>
      )}
    </PageShell>
  );
}


function PlanCard({ name, price }: { name: string; price: number }) {
  const margin = price - STARLINK_EXTERNAL_PAYOUT_USD;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-solar font-semibold">Starlink package</p>
            <h2 className="mt-1 font-display text-xl font-bold">{name}</h2>
          </div>
          <div className="text-right"><div className="font-display text-2xl font-bold">${price}</div><div className="text-xs text-muted-foreground">per month</div></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">External payout</div><div className="font-mono font-semibold">${STARLINK_EXTERNAL_PAYOUT_USD}</div></div>
          <div className="rounded-lg bg-success/10 p-3"><div className="text-xs text-muted-foreground">Margin kept</div><div className="font-mono font-semibold text-success">${margin}</div></div>
        </div>
      </CardContent>
    </Card>
  );
}

function AddStarlinkDialog({ onDone }: { onDone: () => void }) {
  const fn = useServerFn(createStarlinkAccount);
  const [form, setForm] = useState({ customer_id: "", starlink_account_number: "", kit_serial: "", terminal_id: "", service_address: "", plan_type: "residential", balance_usd: 0, status: "active", notes: "" });
  const customers = useQuery({ queryKey: ["customers-min"], queryFn: async () => (await supabase.from("customers").select("id,account_number,company_name").is("archived_at", null).order("company_name")).data ?? [] });
  const create = useMutation({
    mutationFn: () => fn({ data: { ...form, balance_usd: Number(form.balance_usd) || 0 } }),
    onSuccess: () => { toast.success("Starlink account added and subscription logged"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Add Starlink account</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2"><Label>Customer *</Label><Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Package</Label><Select value={form.plan_type} onValueChange={(v) => setForm({ ...form, plan_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="residential">Residential · $89/mo</SelectItem><SelectItem value="business">Business · $187/mo</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["active", "pending", "suspended", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Starlink account #</Label><Input value={form.starlink_account_number} onChange={(e) => setForm({ ...form, starlink_account_number: e.target.value })} placeholder="ACC-…" /></div>
          <div className="space-y-2"><Label>Kit serial</Label><Input value={form.kit_serial} onChange={(e) => setForm({ ...form, kit_serial: e.target.value })} placeholder="KIT…" /></div>
          <div className="space-y-2"><Label>Terminal ID</Label><Input value={form.terminal_id} onChange={(e) => setForm({ ...form, terminal_id: e.target.value })} placeholder="ut…" /></div>
          <div className="space-y-2"><Label>Current balance</Label><Input type="number" step="0.01" value={form.balance_usd} onChange={(e) => setForm({ ...form, balance_usd: Number(e.target.value) })} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Service address</Label><Input value={form.service_address} onChange={(e) => setForm({ ...form, service_address: e.target.value })} placeholder="Physical install address" /></div>
          <div className="space-y-2 md:col-span-2"><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Router details, install notes, account owner…" /></div>
        </div>
        <DialogFooter><Button type="submit" disabled={create.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{create.isPending ? "Saving…" : "Save Starlink account"}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function CheckButton({ id }: { id: string }) {
  const fn = useServerFn(checkStarlinkAccount);
  const qc = useQueryClient();
  const check = useMutation({
    mutationFn: () => fn({ data: { id } }),
    onSuccess: () => { toast.success("Account checked"); qc.invalidateQueries({ queryKey: ["starlink-accounts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return <Button size="sm" variant="outline" onClick={() => check.mutate()} disabled={check.isPending}><RefreshCw className={`h-3.5 w-3.5 mr-1 ${check.isPending ? "animate-spin" : ""}`} />Check</Button>;
}

function RechargeDialog({ account, onDone }: { account: any; onDone: () => void }) {
  const fn = useServerFn(recordStarlinkRecharge);
  const defaultCharge = Number(account.monthly_price || (account.plan_type === "business" ? STARLINK_PLANS.business.monthlyPrice : STARLINK_PLANS.residential.monthlyPrice));
  const [form, setForm] = useState({ customer_charge_usd: defaultCharge, payment_method: "cash", payment_reference: "", notes: "" });
  const margin = Number(form.customer_charge_usd || 0) - STARLINK_EXTERNAL_PAYOUT_USD;
  const recharge = useMutation({
    mutationFn: () => fn({ data: { starlink_account_id: account.id, customer_charge_usd: Number(form.customer_charge_usd), payment_method: form.payment_method, payment_reference: form.payment_reference || undefined, notes: form.notes || undefined } }),
    onSuccess: (r: any) => { toast.success(`Recharge recorded · margin ${money(r.margin_usd)}`); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>Recharge Starlink account</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); recharge.mutate(); }} className="space-y-4">
        <div className="rounded-xl border bg-muted/20 p-4 text-sm">
          <div className="font-semibold">{account.customers?.company_name ?? account.account_number}</div>
          <div className="font-mono text-xs text-muted-foreground">{account.starlink_account_number || account.kit_serial || account.terminal_id || "No external identifier"}</div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>Customer charge</Label><Input type="number" step="0.01" value={form.customer_charge_usd} onChange={(e) => setForm({ ...form, customer_charge_usd: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Payment method</Label><Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["cash", "bank_transfer", "ecocash", "card", "other"].map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2 md:col-span-2"><Label>Reference</Label><Input value={form.payment_reference} onChange={(e) => setForm({ ...form, payment_reference: e.target.value })} placeholder="Optional receipt / transfer reference" /></div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Collected</div><div className="font-mono font-semibold">{money(form.customer_charge_usd)}</div></div>
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">External payout</div><div className="font-mono font-semibold">{money(STARLINK_EXTERNAL_PAYOUT_USD)}</div></div>
          <div className="rounded-lg bg-success/10 p-3"><div className="text-xs text-muted-foreground">Margin</div><div className="font-mono font-semibold text-success">{money(margin)}</div></div>
        </div>
        <div className="space-y-2"><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        <DialogFooter><Button type="submit" disabled={recharge.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{recharge.isPending ? "Sending…" : "Record & send recharge"}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
function RechargeWorkflowDialog({ recharge, onChanged }: { recharge: any; onChanged: () => void }) {
  const loadFn = useServerFn(getStarlinkRechargeWorkflow);
  const advanceFn = useServerFn(advanceStarlinkRecharge);
  const [note, setNote] = useState("");
  const [reply, setReply] = useState("");
  const [waLink, setWaLink] = useState<string | null>(null);

  const wf = useQuery({
    queryKey: ["starlink-recharge-workflow", recharge.id],
    queryFn: () => loadFn({ data: { recharge_id: recharge.id } }),
  });
  const row: any = wf.data?.recharge ?? recharge;
  const events: any[] = wf.data?.events ?? [];
  const status = (row.workflow_status ?? "pending_finance") as RechargeStatus;
  const next = ALLOWED_TRANSITIONS[status] ?? [];

  const advance = useMutation({
    mutationFn: (to: RechargeStatus) =>
      advanceFn({ data: { recharge_id: recharge.id, to_status: to as any, note: note || undefined, supplier_reply: reply || undefined } }),
    onSuccess: (res: any) => {
      toast.success(`Recharge moved to ${RECHARGE_STATUS_LABELS[res.status as RechargeStatus] ?? res.status}`);
      if (res.whatsapp && !res.whatsapp.sent) setWaLink(res.whatsapp.link);
      setNote(""); setReply("");
      wf.refetch(); onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tone: Record<string, string> = {
    paid: "#10b981", message_sent: "#0ea5e9", awaiting_supplier: "#f59e0b",
    completed: "#16a34a", failed: "#f43f5e", cancelled: "#64748b",
  };

  return (
    <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Recharge workflow · {row.payment_reference ?? row.id.slice(0, 8)}</DialogTitle></DialogHeader>

      <div className="space-y-4">
        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold">{row.customers?.company_name ?? row.account_number}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {row.starlink_accounts?.starlink_account_number || row.starlink_accounts?.kit_serial || row.account_number}
              </div>
            </div>
            <StatusBadge tone={RECHARGE_STATUS_TONE[status] ?? "neutral"}>{RECHARGE_STATUS_LABELS[status] ?? status}</StatusBadge>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Collected</div><div className="font-mono font-semibold">{money(row.customer_charge_usd)}</div></div>
            <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Supplier payout</div><div className="font-mono font-semibold">{money(row.external_payout_usd)}</div></div>
            <div className="rounded-lg bg-success/10 p-3"><div className="text-xs text-muted-foreground">Margin</div><div className="font-mono font-semibold text-success">{money(row.margin_usd)}</div></div>
          </div>
        </div>

        {row.whatsapp_message && (
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Activity className="h-3.5 w-3.5" /> WhatsApp request · {row.whatsapp_number}
            </div>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{row.whatsapp_message}</pre>
            <div className="mt-2 text-[11px] text-muted-foreground">Channel {row.message_channel ?? "—"} · sent {dateTime(row.message_sent_at)}</div>
          </div>
        )}

        {waLink && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> No WhatsApp provider connected</div>
            <p className="mt-1 text-xs text-muted-foreground">The request is prepared and logged. Open WhatsApp to send it to the supplier, then mark the recharge as awaiting supplier.</p>
            <a href={waLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-medium text-solar underline">Open WhatsApp with the prepared message</a>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2"><Label>Note (recorded on the audit trail)</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="space-y-2"><Label>Supplier reply</Label><Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Paste the supplier confirmation" /></div>
        </div>

        <div className="flex flex-wrap gap-2">
          {next.length === 0 && <span className="text-xs text-muted-foreground">This recharge is closed — no further transitions.</span>}
          {next.map((to) => (
            <Button
              key={to}
              size="sm"
              disabled={advance.isPending}
              className="text-white"
              style={{ background: tone[to] ?? "#4f46e5" }}
              onClick={() => advance.mutate(to)}
            >
              {to === "message_sent" ? <><Satellite className="h-3.5 w-3.5 mr-1.5" />Send WhatsApp request</>
                : to === "completed" ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Mark completed</>
                : `Mark ${RECHARGE_STATUS_LABELS[to].toLowerCase()}`}
            </Button>
          ))}
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Workflow history</div>
          <div className="mt-2 space-y-2">
            {events.length === 0 && <div className="text-xs text-muted-foreground">No transitions recorded yet.</div>}
            {events.map((e) => (
              <div key={e.id} className="rounded-lg border p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{RECHARGE_STATUS_LABELS[e.to_status as RechargeStatus] ?? e.to_status}</span>
                  <span className="text-muted-foreground">{dateTime(e.created_at)}</span>
                </div>
                {e.note && <div className="mt-1 text-muted-foreground">{e.note}</div>}
                {e.actor_email && <div className="mt-1 text-[11px] text-muted-foreground">{e.actor_email}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </DialogContent>
  );
}
