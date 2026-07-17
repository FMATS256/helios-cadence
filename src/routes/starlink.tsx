import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  checkStarlinkAccount,
  createStarlinkAccount,
  listStarlinkAccounts,
  listStarlinkRecharges,
  recordStarlinkRecharge,
} from "@/lib/starlink.functions";
import { STARLINK_EXTERNAL_PAYOUT_USD, STARLINK_PLANS } from "@/lib/starlink.server";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Activity, CheckCircle2, Plus, RefreshCw, Satellite, Search, WalletCards } from "lucide-react";
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
  const listAccounts = useServerFn(listStarlinkAccounts);
  const listRecharges = useServerFn(listStarlinkRecharges);
  const [addOpen, setAddOpen] = useState(false);
  const [rechargeFor, setRechargeFor] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const authReady = !loading && !!user;

  const accounts = useQuery({ queryKey: ["starlink-accounts"], queryFn: () => listAccounts(), enabled: authReady });
  const recharges = useQuery({ queryKey: ["starlink-recharges"], queryFn: () => listRecharges({ data: { limit: 100 } }), enabled: authReady });

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts.data ?? [];
    return (accounts.data ?? []).filter((a: any) => [
      a.account_number,
      a.starlink_account_number,
      a.kit_serial,
      a.terminal_id,
      a.service_address,
      a.customers?.company_name,
    ].some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [accounts.data, search]);

  const active = (accounts.data ?? []).filter((a: any) => a.status === "active").length;
  const monthlyRevenue = (accounts.data ?? []).reduce((sum: number, a: any) => sum + Number(a.monthly_price ?? 0), 0);
  const rechargeMargin = (recharges.data ?? []).reduce((sum: number, r: any) => sum + Number(r.margin_usd ?? 0), 0);

  if (loading) return <PageContainer><div className="p-6 text-sm text-muted-foreground">Loading…</div></PageContainer>;
  if (!user) {
    return (
      <PageContainer>
        <PageHeader eyebrow="Connectivity" title="Starlink" description="Sign in to manage Starlink accounts and recharges." />
        <Card><CardContent className="p-6 text-sm">Please <Link to="/auth" className="font-medium text-solar underline">sign in</Link> before checking accounts or recording recharges.</CardContent></Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Connectivity"
        title="Starlink"
        description="Track customer terminals, check account records, apply Residential or Business packages and record recharge margins."
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                <Plus className="h-4 w-4 mr-1.5" /> Add Starlink account
              </Button>
            </DialogTrigger>
            <AddStarlinkDialog onDone={() => { setAddOpen(false); accounts.refetch(); }} />
          </Dialog>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Stat icon={<Satellite className="h-4 w-4" />} label="Accounts" value={accounts.data?.length ?? 0} />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Active" value={active} tone="success" />
        <Stat icon={<WalletCards className="h-4 w-4" />} label="Monthly revenue" value={money(monthlyRevenue)} />
        <Stat icon={<Activity className="h-4 w-4" />} label="Recharge margin" value={money(rechargeMargin)} tone="success" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <PlanCard name="Residential" price={STARLINK_PLANS.residential.monthlyPrice} />
        <PlanCard name="Business" price={STARLINK_PLANS.business.monthlyPrice} />
      </div>

      <Tabs defaultValue="accounts">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="recharges">Recharges</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4">
          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Customer Starlink accounts</CardTitle>
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search account, kit, terminal, customer…" className="pl-9" />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {accounts.isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
                : filteredAccounts.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No Starlink accounts found.</div>
                : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Starlink details</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last checked</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {filteredAccounts.map((a: any) => (
                        <TableRow key={a.id}>
                          <TableCell>
                            <div className="font-semibold">{a.customers?.company_name ?? "—"}</div>
                            <Link to="/customers/$accountNumber" params={{ accountNumber: a.account_number }} className="font-mono text-xs text-solar hover:underline">{a.account_number}</Link>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-xs">{a.starlink_account_number || "No Starlink account #"}</div>
                            <div className="text-xs text-muted-foreground">Kit {a.kit_serial || "—"} · Terminal {a.terminal_id || "—"}</div>
                            <div className="max-w-xs truncate text-xs text-muted-foreground">{a.service_address || "—"}</div>
                          </TableCell>
                          <TableCell><StatusPill tone={a.plan_type === "business" ? "info" : "neutral"}>{a.plan_type}</StatusPill><div className="mt-1 text-xs font-mono">{money(a.monthly_price)}/mo</div></TableCell>
                          <TableCell className="font-mono text-sm">{money(a.balance_usd)}</TableCell>
                          <TableCell><StatusPill tone={a.status === "active" ? "success" : a.status === "suspended" ? "danger" : "neutral"}>{a.status}</StatusPill></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{dateTime(a.last_checked_at)}</TableCell>
                          <TableCell className="text-right space-x-1">
                            <CheckButton id={a.id} />
                            <Button size="sm" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }} onClick={() => setRechargeFor(a)}>Recharge</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recharges" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Recharge history</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(recharges.data?.length ?? 0) === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No Starlink recharges recorded.</div> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Account</TableHead><TableHead>Customer charge</TableHead><TableHead>External payout</TableHead><TableHead>Margin</TableHead><TableHead>External</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(recharges.data ?? []).map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.payment_reference ?? "—"}</TableCell>
                        <TableCell><div className="font-mono text-xs">{r.starlink_accounts?.starlink_account_number ?? "—"}</div><div className="text-xs text-muted-foreground">{r.account_number}</div></TableCell>
                        <TableCell className="font-mono">{money(r.customer_charge_usd)}</TableCell>
                        <TableCell className="font-mono">{money(r.external_payout_usd)}</TableCell>
                        <TableCell className="font-mono font-semibold text-success">{money(r.margin_usd)}</TableCell>
                        <TableCell><StatusPill tone={r.external_status === "sent" ? "success" : r.external_status === "failed" ? "danger" : "warning"}>{r.external_status}</StatusPill></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{dateTime(r.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {rechargeFor && (
        <Dialog open={!!rechargeFor} onOpenChange={() => setRechargeFor(null)}>
          <RechargeDialog account={rechargeFor} onDone={() => { setRechargeFor(null); accounts.refetch(); recharges.refetch(); }} />
        </Dialog>
      )}
    </PageContainer>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: "success" }) {
  return <Card><CardContent className="p-4"><div className={`flex items-center gap-2 text-xs uppercase tracking-widest ${tone === "success" ? "text-success" : "text-solar"}`}>{icon}{label}</div><div className="mt-2 font-display text-2xl font-bold">{value}</div></CardContent></Card>;
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
    onSuccess: (r) => { toast.success(`Recharge recorded · margin ${money(r.margin_usd)}`); onDone(); },
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