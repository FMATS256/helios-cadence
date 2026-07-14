import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listVoipAccounts, listVoipRecharges, createVoipAccount, updateVoipAccount,
  recordVoipRecharge, syncVoipAccount, voipSummary,
} from "@/lib/voip.functions";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { PhoneCall, Plus, RefreshCw, Wallet, AlertTriangle, CheckCircle2, Ban, ReceiptText } from "lucide-react";

export const Route = createFileRoute("/voip")({
  head: () => ({ meta: [{ title: "VoIP Management — IMT Operations" }, { name: "description", content: "Manage Dandemutande VoIP customer accounts, balances, recharges and Proof of Payment." }] }),
  component: VoipPage,
});

function fmtMoney(n: number | null | undefined) {
  return `USD ${Number(n ?? 0).toFixed(2)}`;
}
function fmtDate(s?: string | null) { return s ? new Date(s).toLocaleString() : "—"; }

function VoipPage() {
  const listFn = useServerFn(listVoipAccounts);
  const summaryFn = useServerFn(voipSummary);
  const rechargesFn = useServerFn(listVoipRecharges);

  const accountsQ = useQuery({ queryKey: ["voip-accounts"], queryFn: () => listFn() });
  const summaryQ = useQuery({ queryKey: ["voip-summary"], queryFn: () => summaryFn(), refetchInterval: 30_000 });
  const rechargesQ = useQuery({ queryKey: ["voip-recharges"], queryFn: () => rechargesFn({ data: { limit: 50 } }) });

  const [addOpen, setAddOpen] = useState(false);
  const [rechargeFor, setRechargeFor] = useState<any | null>(null);
  const [balanceFor, setBalanceFor] = useState<any | null>(null);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Communications"
        title="Dandemutande VoIP"
        description="Manage VoIP numbers, monitor balances, log recharges and email Proof of Payment to Dandemutande support."
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                <Plus className="h-4 w-4 mr-1.5" /> Add VoIP number
              </Button>
            </DialogTrigger>
            <AddVoipDialog onDone={() => { setAddOpen(false); accountsQ.refetch(); summaryQ.refetch(); }} />
          </Dialog>
        }
      />

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard icon={<PhoneCall className="h-5 w-5" />} label="Active accounts" value={summaryQ.data?.active ?? 0} tone="success" />
        <KpiCard icon={<Ban className="h-5 w-5" />} label="Suspended" value={summaryQ.data?.suspended ?? 0} tone="danger" />
        <KpiCard icon={<AlertTriangle className="h-5 w-5" />} label="Low balance" value={summaryQ.data?.low_balance ?? 0} tone="warning" />
        <KpiCard icon={<Wallet className="h-5 w-5" />} label="Total balance" value={fmtMoney(summaryQ.data?.total_balance ?? 0)} />
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="recharges">Recharges</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {accountsQ.isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : (accountsQ.data?.length ?? 0) === 0 ? (
                <div className="p-12 text-center">
                  <PhoneCall className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No VoIP numbers yet. Add your first number to get started.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>VoIP number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last synced</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(accountsQ.data ?? []).map((a: any) => {
                      const low = Number(a.balance_usd) <= Number(a.low_balance_threshold_usd ?? 0);
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="font-mono font-semibold">{a.voip_number}
                            <div className="text-xs text-muted-foreground font-sans">{a.dandemutande_account ?? "—"}</div>
                          </TableCell>
                          <TableCell>{a.customers?.company_name ?? "—"}
                            <div className="text-xs font-mono text-muted-foreground">{a.customers?.account_number ?? ""}</div>
                          </TableCell>
                          <TableCell>
                            <div className={`font-semibold ${low ? "text-destructive" : ""}`}>{fmtMoney(a.balance_usd)}</div>
                            <div className="text-xs text-muted-foreground">threshold {fmtMoney(a.low_balance_threshold_usd)}</div>
                          </TableCell>
                          <TableCell><StatusPill tone={a.status === "active" ? "success" : a.status === "suspended" ? "danger" : "neutral"}>{a.status}</StatusPill></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(a.last_synced_at)}</TableCell>
                          <TableCell className="text-right space-x-1">
                            <SyncButton id={a.id} />
                            <Button size="sm" variant="outline" onClick={() => setBalanceFor(a)}>Balance</Button>
                            <Button size="sm" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }} onClick={() => setRechargeFor(a)}>Recharge</Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recharges" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Recharge history</CardTitle></CardHeader>
            <CardContent className="p-0">
              {rechargesQ.isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
                : (rechargesQ.data?.length ?? 0) === 0 ? <div className="p-12 text-center text-sm text-muted-foreground">No recharges yet.</div>
                : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(rechargesQ.data ?? []).map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.receipt_number}</TableCell>
                        <TableCell className="font-mono">{r.voip_accounts?.voip_number ?? "—"}</TableCell>
                        <TableCell className="font-semibold">{fmtMoney(r.amount_usd)}</TableCell>
                        <TableCell className="text-muted-foreground">{r.payment_reference ?? "—"}</TableCell>
                        <TableCell><StatusPill tone={r.email_status === "sent" ? "success" : r.email_status === "failed" ? "danger" : "neutral"}>{r.email_status}</StatusPill></TableCell>
                        <TableCell><StatusPill tone={r.status === "submitted" ? "info" : r.status === "verified" ? "success" : "neutral"}>{r.status}</StatusPill></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Alerts</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(accountsQ.data ?? []).filter((a: any) => Number(a.balance_usd) <= Number(a.low_balance_threshold_usd ?? 0)).map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <div className="flex-1">
                    <div className="font-semibold font-mono">{a.voip_number}</div>
                    <div className="text-xs text-muted-foreground">Balance {fmtMoney(a.balance_usd)} · Threshold {fmtMoney(a.low_balance_threshold_usd)}</div>
                  </div>
                  <Button size="sm" onClick={() => setRechargeFor(a)}>Recharge</Button>
                </div>
              ))}
              {(accountsQ.data ?? []).filter((a: any) => a.status === "suspended").map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-orange-500/30 bg-orange-500/5">
                  <Ban className="h-5 w-5 text-orange-500" />
                  <div className="flex-1">
                    <div className="font-semibold font-mono">{a.voip_number}</div>
                    <div className="text-xs text-muted-foreground">Account suspended — recharge to reactivate.</div>
                  </div>
                </div>
              ))}
              {(accountsQ.data ?? []).every((a: any) => a.status !== "suspended" && Number(a.balance_usd) > Number(a.low_balance_threshold_usd ?? 0)) && (
                <div className="flex items-center gap-2 text-green-500 p-4">
                  <CheckCircle2 className="h-5 w-5" /> All VoIP accounts healthy.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {rechargeFor && (
        <Dialog open={!!rechargeFor} onOpenChange={() => setRechargeFor(null)}>
          <RechargeDialog account={rechargeFor} onDone={() => { setRechargeFor(null); accountsQ.refetch(); rechargesQ.refetch(); summaryQ.refetch(); }} />
        </Dialog>
      )}
      {balanceFor && (
        <Dialog open={!!balanceFor} onOpenChange={() => setBalanceFor(null)}>
          <BalanceDialog account={balanceFor} onDone={() => { setBalanceFor(null); accountsQ.refetch(); summaryQ.refetch(); }} />
        </Dialog>
      )}
    </PageContainer>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: "success" | "warning" | "danger" }) {
  const toneClass = tone === "success" ? "text-green-500" : tone === "warning" ? "text-orange-500" : tone === "danger" ? "text-destructive" : "text-solar";
  return (
    <Card>
      <CardContent className="p-5">
        <div className={`flex items-center gap-2 text-xs uppercase tracking-widest ${toneClass}`}>{icon}<span>{label}</span></div>
        <div className="mt-2 font-display text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function SyncButton({ id }: { id: string }) {
  const fn = useServerFn(syncVoipAccount);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => fn({ data: { id } }),
    onSuccess: () => { toast.success("Synced (portal balance requires manual entry)"); qc.invalidateQueries({ queryKey: ["voip-accounts"] }); },
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
