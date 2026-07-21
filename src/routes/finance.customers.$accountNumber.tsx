import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { manageSubscription, updateCustomerRecord, setCustomerLifecycle, sendPaymentReminder } from "@/lib/ops.functions";

import { PageContainer } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Building2, Mail, Phone, MapPin, DollarSign, Receipt, FileText, Repeat,
  AlertTriangle, Plus, Send, Ban, PlayCircle, PauseCircle, RefreshCw, MoreHorizontal,
  TrendingUp, CheckCircle2, Clock, Download, ExternalLink, User, Pencil, CreditCard,
  Users as UsersIcon, MessageSquare, Bell,
} from "lucide-react";


export const Route = createFileRoute("/finance/customers/$accountNumber")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.accountNumber} — Payment Profile · IMT Finance` },
      { name: "description", content: `Complete payment profile for account ${params.accountNumber}: invoices, payments, subscriptions, balance and receivables.` },
      { property: "og:title", content: `Payment Profile ${params.accountNumber}` },
      { property: "og:description", content: "Full customer payment profile: invoices, receipts, subscriptions and actions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentProfile,
});

const money = (n: number, c = "USD") => `${c === "USD" ? "$" : c === "GBP" ? "£" : c + " "}${Math.round(Number(n || 0)).toLocaleString()}`;
const daysBetween = (a: string | Date, b: string | Date) =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

async function loadProfile(accountNumber: string) {
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("account_number", accountNumber)
    .maybeSingle();
  if (!customer) return { customer: null, invoices: [], payments: [], subs: [], quotes: [], timeline: [], contacts: [], comms: [] };

  const cid = customer.id;
  const [inv, pay, sub, quo, tl, contacts, comms] = await Promise.all([
    (supabase.from as any)("invoices").select("*").eq("customer_id", cid).is("archived_at", null).order("issue_date", { ascending: false }),
    (supabase.from as any)("payments").select("*").eq("customer_id", cid).is("archived_at", null).order("paid_at", { ascending: false }),
    (supabase.from as any)("subscriptions").select("*").eq("customer_id", cid).is("archived_at", null).order("created_at", { ascending: false }),
    (supabase.from as any)("quotes").select("*").eq("customer_id", cid).is("archived_at", null).order("created_at", { ascending: false }).limit(20),
    (supabase.from as any)("customer_timeline").select("*").eq("customer_id", cid).order("created_at", { ascending: false }).limit(50),
    (supabase.from as any)("customer_contacts").select("*").eq("customer_id", cid).is("archived_at", null),
    (supabase.from as any)("communications").select("*").eq("customer_id", cid).order("created_at", { ascending: false }).limit(50),
  ]);
  return {
    customer,
    invoices: (inv.data ?? []) as any[],
    payments: (pay.data ?? []) as any[],
    subs: (sub.data ?? []) as any[],
    quotes: (quo.data ?? []) as any[],
    timeline: (tl.data ?? []) as any[],
    contacts: (contacts.data ?? []) as any[],
    comms: (comms.data ?? []) as any[],
  };
}


function PaymentProfile() {
  const { accountNumber } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["finance-profile", accountNumber],
    queryFn: () => loadProfile(accountNumber),
    refetchInterval: 30_000,
  });

  const c = data?.customer;
  const invs = data?.invoices ?? [];
  const pays = data?.payments ?? [];
  const subs = data?.subs ?? [];
  const quotes = data?.quotes ?? [];
  const contacts = data?.contacts ?? [];
  const comms = data?.comms ?? [];
  const currency = (invs[0]?.currency || pays[0]?.currency || "USD") as string;


  const stats = useMemo(() => {
    const today = new Date();
    const unpaid = invs.filter((i: any) => i.status !== "paid" && i.status !== "void");
    const overdue = unpaid.filter((i: any) => i.due_date && new Date(i.due_date) < today);
    const outstanding = unpaid.reduce((a: number, i: any) => a + Number(i.amount_total ?? i.total ?? 0), 0);
    const overdueTotal = overdue.reduce((a: number, i: any) => a + Number(i.amount_total ?? i.total ?? 0), 0);
    const revenue = pays.reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
    const mrr = subs.filter((s: any) => s.status === "active").reduce((a: number, s: any) => a + Number(s.mrr ?? s.amount ?? 0), 0);
    const avgDaysToPay = (() => {
      const paid = invs.filter((i: any) => i.status === "paid" && i.paid_at && i.issue_date);
      if (!paid.length) return null;
      return Math.round(paid.reduce((a: number, i: any) => a + daysBetween(i.paid_at, i.issue_date), 0) / paid.length);
    })();
    return { outstanding, overdueTotal, revenue, mrr, overdueCount: overdue.length, unpaidCount: unpaid.length, avgDaysToPay };
  }, [invs, pays, subs]);

  if (isLoading) {
    return <PageContainer><p className="text-muted-foreground p-6">Loading payment profile…</p></PageContainer>;
  }
  if (!c) {
    return (
      <PageContainer>
        <Card><CardContent className="p-6 text-center">
          <p className="text-muted-foreground">No customer found for {accountNumber}.</p>
          <Button asChild variant="link"><Link to="/finance">Back to Finance</Link></Button>
        </CardContent></Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/finance" className="hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" />Finance</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Payment Profile</span>
      </div>

      {/* Header hero */}
      <div className="relative overflow-hidden rounded-2xl p-6 md:p-8 text-navy-foreground" style={{ background: "var(--gradient-navy)" }}>
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl" style={{ background: "var(--gradient-solar)" }} />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[3px] text-solar font-semibold">Payment Profile</p>
            <h1 className="font-display text-2xl md:text-3xl font-bold mt-1 truncate">{c.company_name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-navy-foreground/75">
              <span className="font-mono">{c.account_number}</span>
              {c.status && <Badge variant="outline" className="border-white/30 text-navy-foreground">{c.status}</Badge>}
              {c.primary_email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{c.primary_email}</span>}
              {(c as any).phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{(c as any).phone}</span>}
              {(c as any).billing_address && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{(c as any).billing_address}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickCreateInvoice customer={c} onDone={() => { refetch(); qc.invalidateQueries({ queryKey: ["finance-profile"] }); }} />
            <QuickRecordPayment customer={c} invoices={invs} onDone={() => { refetch(); qc.invalidateQueries({ queryKey: ["finance-profile"] }); }} />
            <SendReminderAction customer={c} invoices={invs} />
            <EditCustomerDialog customer={c} onDone={refetch} />
            <LifecycleAction customer={c} onDone={refetch} />
            <Button asChild size="sm" variant="secondary" className="bg-white/10 border-white/20 text-navy-foreground hover:bg-white/20">
              <Link to="/customers/$accountNumber" params={{ accountNumber: c.account_number }}>
                <ExternalLink className="h-4 w-4 mr-1.5" />Full 360
              </Link>
            </Button>
          </div>
        </div>
      </div>


      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <ProfileKpi label="Outstanding" value={money(stats.outstanding, currency)} tone="warning" icon={AlertTriangle} hint={`${stats.unpaidCount} unpaid`} />
        <ProfileKpi label="Overdue" value={money(stats.overdueTotal, currency)} tone="danger" icon={Clock} hint={`${stats.overdueCount} past due`} />
        <ProfileKpi label="Revenue LTD" value={money(stats.revenue, currency)} tone="success" icon={TrendingUp} />
        <ProfileKpi label="MRR" value={money(stats.mrr, currency)} tone="solar" icon={Repeat} />
        <ProfileKpi label="Invoices" value={invs.length} tone="info" icon={Receipt} />
        <ProfileKpi label="Avg Days to Pay" value={stats.avgDaysToPay ?? "—"} tone="info" icon={CheckCircle2} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="mails">Mails ({comms.length})</TabsTrigger>
          <TabsTrigger value="statement">Statement</TabsTrigger>
          <TabsTrigger value="contacts">Contact Persons ({contacts.length})</TabsTrigger>
          <TabsTrigger value="payment-methods">Payment Methods</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({invs.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({pays.length})</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions ({subs.length})</TabsTrigger>
          <TabsTrigger value="quotes">Quotes ({quotes.length})</TabsTrigger>
        </TabsList>


        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionBox title="Recent invoices" action={<Button asChild variant="ghost" size="sm"><Link to="/billing">View all</Link></Button>}>
              {invs.slice(0, 6).map((i: any) => (
                <InvoiceRow key={i.id} invoice={i} currency={currency} onRefresh={refetch} />
              ))}
              {invs.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No invoices yet</p>}
            </SectionBox>
            <SectionBox title="Recent payments" action={<Button asChild variant="ghost" size="sm"><Link to="/payments">View all</Link></Button>}>
              {pays.slice(0, 6).map((p: any) => (
                <PaymentRow key={p.id} payment={p} currency={currency} />
              ))}
              {pays.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No payments yet</p>}
            </SectionBox>
          </div>
          <SectionBox title="Active subscriptions">
            {subs.filter((s: any) => s.status === "active").map((s: any) => (
              <SubscriptionRow key={s.id} sub={s} currency={currency} onRefresh={refetch} />
            ))}
            {subs.filter((s: any) => s.status === "active").length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No active subscriptions</p>
            )}
          </SectionBox>
        </TabsContent>

        <TabsContent value="invoices">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Invoice #</TableHead><TableHead>Issued</TableHead><TableHead>Due</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="w-24"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {invs.map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell><Link to="/invoices/$id" params={{ id: i.id }} className="font-mono text-solar hover:underline font-semibold">{i.invoice_number}</Link></TableCell>
                    <TableCell className="text-sm">{i.issue_date ? new Date(i.issue_date).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-sm">{i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"}</TableCell>
                    <TableCell><StatusBadge status={i.status} /></TableCell>
                    <TableCell className="text-right font-mono font-semibold">{money(Number(i.amount_total ?? i.total ?? 0), i.currency || currency)}</TableCell>
                    <TableCell><InvoiceActions invoice={i} onRefresh={refetch} /></TableCell>
                  </TableRow>
                ))}
                {invs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No invoices</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Receipt #</TableHead><TableHead>Paid on</TableHead><TableHead>Method</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {pays.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">{p.receipt_number || "—"}</TableCell>
                    <TableCell className="text-sm">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-sm capitalize">{p.method || "—"}</TableCell>
                    <TableCell><StatusBadge status={p.status || p.reconciliation_status} /></TableCell>
                    <TableCell className="text-right font-mono font-semibold text-success">{money(Number(p.amount || 0), p.currency || currency)}</TableCell>
                  </TableRow>
                ))}
                {pays.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No payments</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="subscriptions">
          <div className="space-y-2">
            {subs.map((s: any) => <SubscriptionRow key={s.id} sub={s} currency={currency} onRefresh={refetch} />)}
            {subs.length === 0 && <Card><CardContent className="py-8 text-center text-muted-foreground">No subscriptions</CardContent></Card>}
          </div>
        </TabsContent>

        <TabsContent value="quotes">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Quote #</TableHead><TableHead>Status</TableHead><TableHead>Valid until</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {quotes.map((q: any) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono">{q.quote_number}</TableCell>
                    <TableCell><StatusBadge status={q.status} /></TableCell>
                    <TableCell className="text-sm">{q.valid_until ? new Date(q.valid_until).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{money(Number(q.total || 0), q.currency || currency)}</TableCell>
                  </TableRow>
                ))}
                {quotes.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No quotes</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="statement">
          <StatementView customer={c} invoices={invs} payments={pays} currency={currency} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

/* ------------ small pieces ------------ */

function ProfileKpi({ label, value, tone, icon: Icon, hint }: { label: string; value: any; tone: string; icon: any; hint?: string }) {
  const map: Record<string, string> = {
    solar: "bg-solar/15 text-solar",
    info: "bg-info/15 text-info",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-[oklch(0.45_0.13_75)]",
    danger: "bg-destructive/15 text-destructive",
  };
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">{label}</p>
            <p className="font-display text-xl md:text-2xl font-bold tabular-nums mt-1 truncate">{value}</p>
            {hint && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
          </div>
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", map[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = (status || "").toLowerCase();
  const tone =
    s === "paid" || s === "matched" || s === "active" ? "bg-success/15 text-success"
    : s === "overdue" || s === "cancelled" ? "bg-destructive/15 text-destructive"
    : s === "sent" || s === "pending" ? "bg-info/15 text-info"
    : s === "partial" || s === "paused" || s === "draft" ? "bg-warning/20 text-[oklch(0.45_0.13_75)]"
    : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize", tone)}>{status || "—"}</span>;
}

function SectionBox({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="border-border">
      <div className="flex items-center justify-between px-5 pt-4">
        <h3 className="font-display font-semibold">{title}</h3>
        {action}
      </div>
      <CardContent className="p-3">{children}</CardContent>
    </Card>
  );
}

function InvoiceRow({ invoice, currency, onRefresh }: { invoice: any; currency: string; onRefresh: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-muted/40">
      <div className="min-w-0">
        <Link to="/invoices/$id" params={{ id: invoice.id }} className="font-mono text-sm font-semibold text-solar hover:underline">
          {invoice.invoice_number}
        </Link>
        <p className="text-xs text-muted-foreground">
          {invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString() : "—"}
          {invoice.due_date && <> · due {new Date(invoice.due_date).toLocaleDateString()}</>}
        </p>
      </div>
      <StatusBadge status={invoice.status} />
      <span className="font-mono font-semibold tabular-nums">{money(Number(invoice.amount_total ?? invoice.total ?? 0), invoice.currency || currency)}</span>
      <InvoiceActions invoice={invoice} onRefresh={onRefresh} />
    </div>
  );
}

function InvoiceActions({ invoice, onRefresh }: { invoice: any; onRefresh: () => void }) {
  const setStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await (supabase.from as any)("invoices").update({ status: newStatus }).eq("id", invoice.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Invoice updated"); onRefresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link to="/invoices/$id" params={{ id: invoice.id }}><FileText className="h-4 w-4 mr-2" />Open</Link></DropdownMenuItem>
        {invoice.status !== "sent" && invoice.status !== "paid" && (
          <DropdownMenuItem onClick={() => setStatus.mutate("sent")}><Send className="h-4 w-4 mr-2" />Mark sent</DropdownMenuItem>
        )}
        {invoice.status !== "paid" && (
          <DropdownMenuItem onClick={() => setStatus.mutate("paid")}><CheckCircle2 className="h-4 w-4 mr-2" />Mark paid</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {invoice.status !== "void" && (
          <DropdownMenuItem onClick={() => setStatus.mutate("void")} className="text-destructive"><Ban className="h-4 w-4 mr-2" />Void</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PaymentRow({ payment, currency }: { payment: any; currency: string }) {
  return (
    <div className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-muted/40">
      <div className="min-w-0">
        <p className="font-mono text-sm font-semibold">{payment.receipt_number || "—"}</p>
        <p className="text-xs text-muted-foreground capitalize">
          {payment.method || "—"} · {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : "—"}
        </p>
      </div>
      <StatusBadge status={payment.reconciliation_status || payment.status} />
      <span className="font-mono font-semibold tabular-nums text-success">{money(Number(payment.amount || 0), payment.currency || currency)}</span>
    </div>
  );
}

function SubscriptionRow({ sub, currency, onRefresh }: { sub: any; currency: string; onRefresh: () => void }) {
  const manage = useServerFn(manageSubscription);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [form, setForm] = useState({ plan_name: sub.plan_name, amount: sub.amount, billing_cycle: sub.billing_cycle || "monthly" });

  const run = useMutation({
    mutationFn: async (action: "suspend" | "resume" | "cancel" | "renew" | "upgrade" | "downgrade") => {
      return manage({ data: { subscription_id: sub.id, action, ...(action === "upgrade" || action === "downgrade" ? form : {}) } });
    },
    onSuccess: () => { toast.success("Subscription updated"); setUpgradeOpen(false); onRefresh(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  return (
    <Card className="border-border">
      <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-display font-semibold">{sub.plan_name}</p>
            <StatusBadge status={sub.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {money(Number(sub.amount || 0), sub.currency || currency)}/{sub.billing_cycle || "mo"}
            {sub.next_renewal && <> · renews {new Date(sub.next_renewal).toLocaleDateString()}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sub.status === "active" ? (
            <Button size="sm" variant="outline" onClick={() => run.mutate("suspend")} disabled={run.isPending}><PauseCircle className="h-4 w-4 mr-1" />Suspend</Button>
          ) : sub.status === "paused" ? (
            <Button size="sm" variant="outline" onClick={() => run.mutate("resume")} disabled={run.isPending}><PlayCircle className="h-4 w-4 mr-1" />Resume</Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => run.mutate("renew")} disabled={run.isPending}><RefreshCw className="h-4 w-4 mr-1" />Renew</Button>
          <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><TrendingUp className="h-4 w-4 mr-1" />Change plan</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Change plan · {sub.plan_name}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Plan name</Label><Input value={form.plan_name} onChange={(e) => setForm({ ...form, plan_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
                  <div><Label>Billing cycle</Label>
                    <Select value={form.billing_cycle} onValueChange={(v) => setForm({ ...form, billing_cycle: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["monthly", "quarterly", "yearly", "weekly"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => run.mutate("downgrade")} disabled={run.isPending}>Downgrade</Button>
                <Button onClick={() => run.mutate("upgrade")} disabled={run.isPending}>Upgrade</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {sub.status !== "cancelled" && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => run.mutate("cancel")} disabled={run.isPending}>
              <Ban className="h-4 w-4 mr-1" />Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ----- Quick create dialogs ----- */

function QuickCreateInvoice({ customer, onDone }: { customer: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    subtotal: 0,
    tax: 0,
    currency: "USD",
    notes: "",
  });
  const create = useMutation({
    mutationFn: async () => {
      const subtotal = Number(form.subtotal) || 0;
      const tax = Number(form.tax) || 0;
      const { error } = await (supabase.from as any)("invoices").insert({
        customer_id: customer.id,
        account_number: customer.account_number,
        status: "draft",
        currency: form.currency,
        issue_date: form.issue_date,
        due_date: form.due_date || null,
        subtotal, tax, total: subtotal + tax,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Invoice created"); setOpen(false); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
          <Plus className="h-4 w-4 mr-1" />New invoice
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New invoice · {customer.company_name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Issue date</Label><Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></div>
          <div><Label>Due date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          <div><Label>Subtotal</Label><Input type="number" step="0.01" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: Number(e.target.value) })} /></div>
          <div><Label>Tax</Label><Input type="number" step="0.01" value={form.tax} onChange={(e) => setForm({ ...form, tax: Number(e.target.value) })} /></div>
          <div><Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["USD", "GBP", "ZWL"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Saving…" : "Create invoice"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickRecordPayment({ customer, invoices, onDone }: { customer: any; invoices: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const unpaid = invoices.filter((i: any) => i.status !== "paid" && i.status !== "void");
  const [form, setForm] = useState({
    amount: 0,
    currency: "USD",
    method: "bank_transfer",
    paid_at: new Date().toISOString().slice(0, 10),
    invoice_id: "",
    reference: "",
  });
  const create = useMutation({
    mutationFn: async () => {
      const insert: any = {
        customer_id: customer.id,
        account_number: customer.account_number,
        amount: Number(form.amount) || 0,
        currency: form.currency,
        method: form.method,
        paid_at: form.paid_at,
        status: "completed",
        reference: form.reference || null,
      };
      const { data: pay, error } = await (supabase.from as any)("payments").insert(insert).select("id").single();
      if (error) throw error;
      if (form.invoice_id && pay?.id) {
        await (supabase.from as any)("payment_allocations").insert({
          payment_id: pay.id,
          invoice_id: form.invoice_id,
          amount: Number(form.amount) || 0,
        });
      }
    },
    onSuccess: () => { toast.success("Payment recorded"); setOpen(false); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="bg-white/10 border-white/20 text-navy-foreground hover:bg-white/20">
          <DollarSign className="h-4 w-4 mr-1" />Record payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record payment · {customer.company_name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div><Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["USD", "GBP", "ZWL"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Method</Label>
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["bank_transfer", "cash", "card", "mobile_money", "cheque", "other"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Paid on</Label><Input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} /></div>
          <div className="col-span-2"><Label>Apply to invoice (optional)</Label>
            <Select value={form.invoice_id || "none"} onValueChange={(v) => setForm({ ...form, invoice_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Walk-in / unallocated" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Walk-in / unallocated</SelectItem>
                {unpaid.map((i: any) => (
                  <SelectItem key={i.id} value={i.id}>{i.invoice_number} · {money(Number(i.amount_total ?? i.total ?? 0), i.currency)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Reference</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={create.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
            {create.isPending ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatementView({ customer, invoices, payments, currency }: { customer: any; invoices: any[]; payments: any[]; currency: string }) {
  const rows = useMemo(() => {
    const events: Array<{ date: string; type: "inv" | "pay"; ref: string; debit: number; credit: number }> = [];
    for (const i of invoices) events.push({ date: i.issue_date || i.created_at, type: "inv", ref: i.invoice_number, debit: Number(i.amount_total ?? i.total ?? 0), credit: 0 });
    for (const p of payments) events.push({ date: p.paid_at || p.created_at, type: "pay", ref: p.receipt_number || "—", debit: 0, credit: Number(p.amount || 0) });
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let bal = 0;
    return events.map((e) => { bal += e.debit - e.credit; return { ...e, balance: bal }; });
  }, [invoices, payments]);

  const totalDebit = rows.reduce((a, r) => a + r.debit, 0);
  const totalCredit = rows.reduce((a, r) => a + r.credit, 0);

  const exportCSV = () => {
    const csv = ["Date,Type,Reference,Debit,Credit,Balance"];
    for (const r of rows) csv.push(`${r.date},${r.type},${r.ref},${r.debit},${r.credit},${r.balance}`);
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${customer.account_number}-statement.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card><CardContent className="p-0">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div>
          <h3 className="font-display font-semibold">Account statement</h3>
          <p className="text-xs text-muted-foreground">All invoices and payments, chronologically</p>
        </div>
        <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Type</TableHead>
          <TableHead className="text-right">Debit</TableHead>
          <TableHead className="text-right">Credit</TableHead>
          <TableHead className="text-right">Balance</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="text-sm">{r.date ? new Date(r.date).toLocaleDateString() : "—"}</TableCell>
              <TableCell className="font-mono text-sm">{r.ref}</TableCell>
              <TableCell className="text-sm capitalize">{r.type === "inv" ? "Invoice" : "Payment"}</TableCell>
              <TableCell className="text-right font-mono">{r.debit ? money(r.debit, currency) : "—"}</TableCell>
              <TableCell className="text-right font-mono text-success">{r.credit ? money(r.credit, currency) : "—"}</TableCell>
              <TableCell className="text-right font-mono font-semibold">{money(r.balance, currency)}</TableCell>
            </TableRow>
          ))}
          {rows.length > 0 && (
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell colSpan={3}>Totals</TableCell>
              <TableCell className="text-right font-mono">{money(totalDebit, currency)}</TableCell>
              <TableCell className="text-right font-mono text-success">{money(totalCredit, currency)}</TableCell>
              <TableCell className="text-right font-mono">{money(totalDebit - totalCredit, currency)}</TableCell>
            </TableRow>
          )}
          {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No transactions</TableCell></TableRow>}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}
