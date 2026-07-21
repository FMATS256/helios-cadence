import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/page";
import { HeroPanel, KpiCard, SectionCard, QuickAction } from "@/components/dashboards/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  DollarSign, FileText, Receipt, TrendingUp, AlertTriangle, Plus, Repeat, Users,
  Wallet, Landmark, PiggyBank, Percent, Package, Warehouse, Server, ShieldCheck,
  BookOpen, ClipboardList, Truck, ScrollText, FolderKanban, BarChart3, Activity,
  Search, ArrowUpRight, ArrowDownRight, CreditCard, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/finance")({
  head: () => ({
    meta: [
      { title: "Finance Workspace — IMT Operations" },
      { name: "description", content: "Central accounting command center: revenue, receivables, payables, subscriptions, banking, reports, and audit — one workspace." },
      { property: "og:title", content: "Finance Workspace — IMT Operations" },
      { property: "og:description", content: "Enterprise finance dashboard with KPIs, universal search, activity feed, and links to every finance module." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FinanceWorkspace,
});

// ----- data ---------------------------------------------------------------

async function loadFinanceOverview() {
  const [invoices, payments, subs, quotes, customers, catalog, assets, inventory] = await Promise.all([
    (supabase.from as any)("invoices").select("id,invoice_number,amount_total,total,currency,status,due_date,issue_date,paid_at,account_number,customer_id,created_at").is("archived_at", null).order("created_at", { ascending: false }).limit(400),
    (supabase.from as any)("payments").select("id,amount,currency,method,status,paid_at,receipt_number,account_number,customer_id,created_at").is("archived_at", null).order("created_at", { ascending: false }).limit(400),
    (supabase.from as any)("subscriptions").select("id,plan_name,amount,mrr,status,billing_cycle,renews_at,next_renewal,account_number,customer_id,created_at").is("archived_at", null),
    (supabase.from as any)("quotes").select("id,quote_number,total,currency,status,valid_until,account_number,customer_id,created_at").is("archived_at", null).order("created_at", { ascending: false }).limit(50),
    supabase.from("customers").select("id,company_name,account_number,status,created_at").is("archived_at", null),
    (supabase.from as any)("service_catalog").select("id,name,category,price"),
    (supabase.from as any)("assets").select("id,purchase_price,status").is("archived_at", null),
    (supabase.from as any)("inventory_items").select("id,quantity,unit_cost").is("archived_at", null),
  ]);

  const inv = (invoices.data ?? []) as any[];
  const pay = (payments.data ?? []) as any[];
  const s = (subs.data ?? []) as any[];
  const q = (quotes.data ?? []) as any[];
  const cust = (customers.data ?? []) as any[];
  const cat = (catalog.data ?? []) as any[];
  const ast = (assets.data ?? []) as any[];
  const invn = (inventory.data ?? []) as any[];

  const amt = (r: any) => Number(r.amount_total ?? r.total ?? 0);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);

  const paidInvoices = inv.filter((x) => x.status === "paid");
  const draftInvoices = inv.filter((x) => x.status === "draft");
  const unpaid = inv.filter((x) => x.status !== "paid" && x.status !== "void");
  const overdue = unpaid.filter((x) => x.due_date && new Date(x.due_date) < today);
  const activeSubs = s.filter((x) => x.status === "active");
  const mrr = activeSubs.reduce((a, x) => a + Number(x.mrr ?? x.amount ?? 0), 0);

  const revenue = (from: Date) =>
    pay.filter((p) => p.paid_at && new Date(p.paid_at) >= from).reduce((a, x) => a + Number(x.amount || 0), 0);

  return {
    invoices: inv, payments: pay, subs: s, quotes: q, customers: cust, catalog: cat,
    kpi: {
      todayRevenue: revenue(todayStart),
      mtdRevenue: revenue(monthStart),
      ytdRevenue: revenue(yearStart),
      mrr,
      arr: mrr * 12,
      ar: unpaid.reduce((a, x) => a + amt(x), 0),
      overdueTotal: overdue.reduce((a, x) => a + amt(x), 0),
      unpaidCount: unpaid.length,
      overdueCount: overdue.length,
      paidCount: paidInvoices.length,
      draftCount: draftInvoices.length,
      renewalsSoon: activeSubs.filter((x) => (x.renews_at || x.next_renewal) && new Date(x.renews_at || x.next_renewal) < in30).length,
      activeCustomers: cust.filter((c) => c.status !== "inactive").length,
      activeSubs: activeSubs.length,
      products: cat.length,
      inventoryValue: invn.reduce((a, x) => a + Number(x.quantity || 0) * Number(x.unit_cost || 0), 0),
      assetValue: ast.reduce((a, x) => a + Number(x.purchase_price || 0), 0),
    },
  };
}

async function loadCustomerFinancial(customerId: string) {
  const [cust, invs, pays, subs] = await Promise.all([
    supabase.from("customers").select("*").eq("id", customerId).maybeSingle(),
    (supabase.from as any)("invoices").select("id,invoice_number,amount_total,total,currency,status,due_date,issue_date,paid_at").eq("customer_id", customerId).is("archived_at", null).order("created_at", { ascending: false }).limit(20),
    (supabase.from as any)("payments").select("id,amount,currency,method,status,paid_at,receipt_number").eq("customer_id", customerId).is("archived_at", null).order("created_at", { ascending: false }).limit(20),
    (supabase.from as any)("subscriptions").select("id,plan_name,amount,status,billing_cycle,renews_at,next_renewal").eq("customer_id", customerId).is("archived_at", null),
  ]);
  return {
    customer: cust.data,
    invoices: (invs.data ?? []) as any[],
    payments: (pays.data ?? []) as any[],
    subscriptions: (subs.data ?? []) as any[],
  };
}

// ----- helpers ------------------------------------------------------------

const currencies = ["USD", "GBP", "ZWL"] as const;
type Ccy = (typeof currencies)[number];
const symbolOf: Record<Ccy, string> = { USD: "$", GBP: "£", ZWL: "Z$" };
const money = (n: number, c: Ccy = "USD") => `${symbolOf[c]}${Math.round(n).toLocaleString()}`;

// ----- main ---------------------------------------------------------------

function FinanceWorkspace() {
  const { data } = useQuery({ queryKey: ["finance-workspace"], queryFn: loadFinanceOverview, refetchInterval: 30_000 });
  const [currency, setCurrency] = useState<Ccy>("USD");
  const [period, setPeriod] = useState<"today" | "mtd" | "ytd">("mtd");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");

  const kpi = data?.kpi;

  const heroValue =
    period === "today" ? kpi?.todayRevenue :
    period === "ytd" ? kpi?.ytdRevenue :
    kpi?.mtdRevenue;

  return (
    <PageContainer>
      <HeroPanel
        eyebrow="Finance Workspace"
        accent="success"
        title="Revenue Command Center"
        subtitle={
          <>
            <span className="text-solar font-semibold">{money(heroValue ?? 0, currency)}</span> {period.toUpperCase()} revenue ·
            <span className="text-solar font-semibold"> {money(kpi?.mrr ?? 0, currency)}</span> MRR ·
            <span className="text-solar font-semibold"> {money(kpi?.ar ?? 0, currency)}</span> AR
          </>
        }
        actions={
          <>
            <div className="flex rounded-lg bg-white/10 border border-white/20 p-0.5">
              {(["today", "mtd", "ytd"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "px-3 h-8 text-xs font-semibold uppercase tracking-wider rounded-md transition",
                    period === p ? "bg-white/25 text-navy-foreground" : "text-navy-foreground/70 hover:text-navy-foreground",
                  )}
                >{p}</button>
              ))}
            </div>
            <div className="flex rounded-lg bg-white/10 border border-white/20 p-0.5">
              {currencies.map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={cn(
                    "px-2.5 h-8 text-xs font-mono font-semibold rounded-md transition",
                    currency === c ? "bg-white/25 text-navy-foreground" : "text-navy-foreground/70 hover:text-navy-foreground",
                  )}
                >{c}</button>
              ))}
            </div>
            <Button asChild className="text-solar-foreground border-0" style={{ background: "var(--gradient-solar)" }}>
              <Link to="/billing"><Plus className="h-4 w-4 mr-1.5" />New Invoice</Link>
            </Button>
          </>
        }
      />

      {/* Universal finance search */}
      <SearchPanel
        q={searchQ}
        setQ={setSearchQ}
        data={data}
        onPickCustomer={(id) => setCustomerId(id)}
      />

      {/* Quick actions */}
      <SectionCard title="Quick actions" description="Launch existing workflows without leaving Finance">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <QuickAction icon={FileText} label="Create Invoice" to="/billing" tone="warning" />
          <QuickAction icon={DollarSign} label="Record Payment" to="/payments" tone="success" />
          <QuickAction icon={Users} label="Create Customer" to="/customers/new" tone="info" />
          <QuickAction icon={Package} label="Add Product" to="/catalog" tone="solar" />
          <QuickAction icon={Repeat} label="Add Subscription" to="/subscriptions" tone="success" />
          <QuickAction icon={Receipt} label="Create Quote" to="/quotes" tone="info" />
          <QuickAction icon={Warehouse} label="Inventory" to="/inventory" tone="warning" />
          <QuickAction icon={Server} label="Assets" to="/assets" tone="info" />
          <QuickAction icon={BarChart3} label="Reports" to="/reports" tone="solar" />
          <QuickAction icon={ShieldCheck} label="Licenses" to="/licenses" tone="success" />
        </div>
      </SectionCard>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <KpiCard label="Today's Revenue" value={money(kpi?.todayRevenue ?? 0, currency)} icon={TrendingUp} tone="success" to="/payments" />
        <KpiCard label="MTD Revenue" value={money(kpi?.mtdRevenue ?? 0, currency)} icon={TrendingUp} tone="success" to="/payments" />
        <KpiCard label="YTD Revenue" value={money(kpi?.ytdRevenue ?? 0, currency)} icon={TrendingUp} tone="success" to="/reports" />
        <KpiCard label="MRR" value={money(kpi?.mrr ?? 0, currency)} icon={Repeat} tone="solar" to="/subscriptions" />
        <KpiCard label="ARR" value={money(kpi?.arr ?? 0, currency)} icon={Repeat} tone="solar" to="/subscriptions" />
        <KpiCard label="Accounts Receivable" value={money(kpi?.ar ?? 0, currency)} icon={FileText} tone="warning" to="/billing" hint={`${kpi?.unpaidCount ?? 0} unpaid`} />
        <KpiCard label="Overdue" value={money(kpi?.overdueTotal ?? 0, currency)} icon={AlertTriangle} tone="danger" to="/billing" hint={`${kpi?.overdueCount ?? 0} past due`} />
        <KpiCard label="Paid Invoices" value={kpi?.paidCount ?? 0} icon={Receipt} tone="success" to="/billing" />
        <KpiCard label="Draft Invoices" value={kpi?.draftCount ?? 0} icon={FileText} tone="info" to="/billing" />
        <KpiCard label="Renewals ≤ 30d" value={kpi?.renewalsSoon ?? 0} icon={Repeat} tone="warning" to="/subscriptions" />
        <KpiCard label="Active Customers" value={kpi?.activeCustomers ?? 0} icon={Users} tone="info" to="/customers" />
        <KpiCard label="Active Subs" value={kpi?.activeSubs ?? 0} icon={Repeat} tone="success" to="/subscriptions" />
        <KpiCard label="Products" value={kpi?.products ?? 0} icon={Package} tone="solar" to="/catalog" />
        <KpiCard label="Inventory Value" value={money(kpi?.inventoryValue ?? 0, currency)} icon={Warehouse} tone="info" to="/inventory" />
        <KpiCard label="Asset Value" value={money(kpi?.assetValue ?? 0, currency)} icon={Server} tone="info" to="/assets" />
        <PlaceholderKpi label="Bank Balance" icon={Landmark} />
        <PlaceholderKpi label="Cash Available" icon={Wallet} />
        <PlaceholderKpi label="Accounts Payable" icon={FileText} />
        <PlaceholderKpi label="Customer Credits" icon={PiggyBank} />
        <PlaceholderKpi label="Deposits" icon={PiggyBank} />
        <PlaceholderKpi label="Monthly Expenses" icon={ArrowDownRight} />
        <PlaceholderKpi label="Gross Profit" icon={ArrowUpRight} />
        <PlaceholderKpi label="Net Profit" icon={Percent} />
        <PlaceholderKpi label="Profit Margin" icon={Percent} />
        <PlaceholderKpi label="Tax Payable" icon={ScrollText} />
        <PlaceholderKpi label="Tax Receivable" icon={ScrollText} />
        <PlaceholderKpi label="Deferred Revenue" icon={Repeat} />
      </div>

      {/* Module grid */}
      <SectionCard title="Finance modules" description="Every finance area — open its dedicated workspace">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <ModuleTile to="/customers" label="Customers" icon={Users} tone="info" />
          <ModuleTile to="/catalog" label="Products & Services" icon={Package} tone="solar" />
          <ModuleTile to="/quotes" label="Quotations" icon={FileText} tone="info" />
          <ModuleTile to="/billing" label="Invoices" icon={Receipt} tone="warning" />
          <ModuleTile to="/payments" label="Payments" icon={CreditCard} tone="success" />
          <ModuleTile to="/subscriptions" label="Subscriptions" icon={Repeat} tone="solar" />
          <ModuleTile to="/licenses" label="Licenses" icon={ShieldCheck} tone="success" />
          <ModuleTile to="/inventory" label="Inventory" icon={Warehouse} tone="warning" />
          <ModuleTile to="/assets" label="Assets" icon={Server} tone="info" />
          <ModuleTile to="/reports" label="Financial Reports" icon={BarChart3} tone="solar" />
          <ModuleTile to="/projects" label="Projects" icon={FolderKanban} tone="info" />
          <ModuleTile to="/knowledge" label="Knowledge Base" icon={BookOpen} tone="info" />
          <ModuleTile label="Suppliers" icon={Truck} tone="info" soon />
          <ModuleTile label="Sales Orders" icon={ClipboardList} tone="warning" soon />
          <ModuleTile label="Customer Credits" icon={PiggyBank} tone="success" soon />
          <ModuleTile label="Banking" icon={Landmark} tone="info" soon />
          <ModuleTile label="Accounts Receivable" icon={FileText} tone="warning" soon />
          <ModuleTile label="Accounts Payable" icon={FileText} tone="danger" soon />
          <ModuleTile label="General Ledger" icon={BookOpen} tone="info" soon />
          <ModuleTile label="Journal Entries" icon={ScrollText} tone="info" soon />
          <ModuleTile label="Expenses" icon={ArrowDownRight} tone="danger" soon />
          <ModuleTile label="Procurement" icon={Truck} tone="warning" soon />
          <ModuleTile label="Tax" icon={ScrollText} tone="info" soon />
          <ModuleTile label="Revenue" icon={ArrowUpRight} tone="success" soon />
          <ModuleTile label="Audit Logs" icon={Activity} tone="info" soon />
          <ModuleTile to="/settings" label="Settings" icon={Building2} tone="info" />
        </div>
      </SectionCard>

      {/* Activity + AR + Renewals */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard title="Financial activity" description="Live feed across every module" className="xl:col-span-2">
          <ActivityFeed data={data} onPickCustomer={(id) => setCustomerId(id)} />
        </SectionCard>

        <SectionCard title="Accounts receivable" description="Aging & overdue">
          <ARSummary data={data} />
        </SectionCard>
      </div>

      <CustomerPanel customerId={customerId} onClose={() => setCustomerId(null)} currency={currency} />
    </PageContainer>
  );
}

// ----- sub components -----------------------------------------------------

function PlaceholderKpi({ label, icon: Icon }: { label: string; icon: any }) {
  return (
    <Card className="relative overflow-hidden border-dashed border-border/70 bg-muted/20">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-[2px]">{label}</p>
            <p className="font-display text-3xl font-bold text-muted-foreground/50 mt-2 tabular-nums">—</p>
          </div>
          <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground/70 uppercase tracking-wider">Connect data</p>
      </CardContent>
    </Card>
  );
}

function ModuleTile({
  to, label, icon: Icon, tone = "info", soon,
}: {
  to?: string; label: string; icon: any;
  tone?: "info" | "solar" | "success" | "warning" | "danger";
  soon?: boolean;
}) {
  const toneMap: Record<string, string> = {
    solar: "text-solar bg-solar/10",
    info: "text-info bg-info/10",
    success: "text-success bg-success/10",
    warning: "text-[oklch(0.45_0.13_75)] bg-warning/20",
    danger: "text-destructive bg-destructive/10",
  };
  const inner = (
    <Card className={cn(
      "group relative overflow-hidden border-border transition-all",
      soon ? "opacity-60" : "hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)] cursor-pointer",
    )}>
      <CardContent className="p-4">
        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center mb-3", toneMap[tone])}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {soon && <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Coming soon</p>}
        {!soon && <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Open →</p>}
      </CardContent>
    </Card>
  );
  if (soon || !to) return inner;
  return <Link to={to as any}>{inner}</Link>;
}

function SearchPanel({
  q, setQ, data, onPickCustomer,
}: {
  q: string; setQ: (v: string) => void; data: any;
  onPickCustomer: (id: string) => void;
}) {
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!data || term.length < 2) return null;
    const match = (v: any) => String(v ?? "").toLowerCase().includes(term);
    return {
      customers: (data.customers ?? []).filter((c: any) => match(c.name) || match(c.account_number)).slice(0, 5),
      invoices: (data.invoices ?? []).filter((i: any) => match(i.invoice_number) || match(i.account_number)).slice(0, 5),
      payments: (data.payments ?? []).filter((p: any) => match(p.receipt_number) || match(p.account_number)).slice(0, 5),
      subs: (data.subs ?? []).filter((s: any) => match(s.plan_name) || match(s.account_number)).slice(0, 5),
      quotes: (data.quotes ?? []).filter((q2: any) => match(q2.quote_number) || match(q2.account_number)).slice(0, 5),
      products: (data.catalog ?? []).filter((p: any) => match(p.name) || match(p.category)).slice(0, 5),
    };
  }, [q, data]);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 h-11">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Universal finance search — customer, invoice, receipt, subscription, product, account number…"
            className="border-0 bg-transparent h-9 px-0 shadow-none focus-visible:ring-0"
          />
          {q && <Button size="sm" variant="ghost" onClick={() => setQ("")}>Clear</Button>}
        </div>
        {results && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {results.customers.map((c: any) => (
              <button key={c.id} onClick={() => onPickCustomer(c.id)} className="text-left rounded-lg border border-border p-2.5 hover:bg-muted transition">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3 w-3" />Customer</div>
                <div className="text-sm font-semibold truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.account_number}</div>
              </button>
            ))}
            {results.invoices.map((i: any) => (
              <Link key={i.id} to="/invoices/$id" params={{ id: i.id }} className="text-left rounded-lg border border-border p-2.5 hover:bg-muted transition">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Receipt className="h-3 w-3" />Invoice · {i.status}</div>
                <div className="text-sm font-semibold truncate">{i.invoice_number}</div>
                <div className="text-xs text-muted-foreground">{i.account_number} · {money(Number(i.amount_total ?? i.total ?? 0))}</div>
              </Link>
            ))}
            {results.payments.map((p: any) => (
              <Link key={p.id} to="/payments" className="text-left rounded-lg border border-border p-2.5 hover:bg-muted transition">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><CreditCard className="h-3 w-3" />Payment</div>
                <div className="text-sm font-semibold truncate">{p.receipt_number ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{p.account_number} · {money(Number(p.amount || 0))}</div>
              </Link>
            ))}
            {results.subs.map((s: any) => (
              <Link key={s.id} to="/subscriptions" className="text-left rounded-lg border border-border p-2.5 hover:bg-muted transition">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Repeat className="h-3 w-3" />Subscription</div>
                <div className="text-sm font-semibold truncate">{s.plan_name}</div>
                <div className="text-xs text-muted-foreground">{s.account_number}</div>
              </Link>
            ))}
            {results.quotes.map((q2: any) => (
              <Link key={q2.id} to="/quotes" className="text-left rounded-lg border border-border p-2.5 hover:bg-muted transition">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="h-3 w-3" />Quote</div>
                <div className="text-sm font-semibold truncate">{q2.quote_number}</div>
                <div className="text-xs text-muted-foreground">{q2.account_number}</div>
              </Link>
            ))}
            {results.products.map((p: any) => (
              <Link key={p.id} to="/catalog" className="text-left rounded-lg border border-border p-2.5 hover:bg-muted transition">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Package className="h-3 w-3" />Product</div>
                <div className="text-sm font-semibold truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.category} · {money(Number(p.price || 0))}</div>
              </Link>
            ))}
            {Object.values(results).every((arr: any) => arr.length === 0) && (
              <p className="col-span-full text-sm text-muted-foreground text-center py-4">No matches</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityFeed({ data, onPickCustomer }: { data: any; onPickCustomer: (id: string) => void }) {
  const events = useMemo(() => {
    if (!data) return [];
    const feed: Array<{ id: string; when: string; icon: any; tone: string; title: string; sub: string; customerId?: string; to?: string }> = [];
    for (const i of (data.invoices ?? []).slice(0, 20)) {
      feed.push({
        id: `inv-${i.id}`, when: i.created_at || i.issue_date,
        icon: Receipt, tone: "warning",
        title: `Invoice ${i.invoice_number} · ${i.status}`,
        sub: `${i.account_number ?? "—"} · ${money(Number(i.amount_total ?? i.total ?? 0))}`,
        customerId: i.customer_id, to: `/invoices/${i.id}`,
      });
    }
    for (const p of (data.payments ?? []).slice(0, 20)) {
      feed.push({
        id: `pay-${p.id}`, when: p.created_at || p.paid_at,
        icon: DollarSign, tone: "success",
        title: `Payment ${p.receipt_number ?? ""} recorded`,
        sub: `${p.account_number ?? "—"} · ${money(Number(p.amount || 0))} · ${p.method ?? ""}`,
        customerId: p.customer_id, to: "/payments",
      });
    }
    for (const s of (data.subs ?? []).slice(0, 10)) {
      feed.push({
        id: `sub-${s.id}`, when: s.created_at,
        icon: Repeat, tone: "solar",
        title: `Subscription · ${s.plan_name}`,
        sub: `${s.account_number ?? "—"} · ${s.status} · ${money(Number(s.amount ?? s.mrr ?? 0))}/${s.billing_cycle ?? "mo"}`,
        customerId: s.customer_id, to: "/subscriptions",
      });
    }
    for (const q of (data.quotes ?? []).slice(0, 10)) {
      feed.push({
        id: `q-${q.id}`, when: q.created_at,
        icon: FileText, tone: "info",
        title: `Quote ${q.quote_number} · ${q.status}`,
        sub: `${q.account_number ?? "—"} · ${money(Number(q.total || 0))}`,
        customerId: q.customer_id, to: "/quotes",
      });
    }
    for (const c of (data.customers ?? []).slice(0, 8)) {
      feed.push({
        id: `c-${c.id}`, when: (c as any).created_at ?? new Date().toISOString(),
        icon: Users, tone: "info",
        title: `Customer · ${c.name}`,
        sub: `${c.account_number ?? "—"} · ${c.status ?? ""}`,
        customerId: c.id,
      });
    }
    return feed
      .filter((e) => e.when)
      .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
      .slice(0, 25);
  }, [data]);

  const toneMap: Record<string, string> = {
    solar: "bg-solar/15 text-solar",
    info: "bg-info/15 text-info",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-[oklch(0.45_0.13_75)]",
  };

  if (events.length === 0) return <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>;

  return (
    <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
      {events.map((e) => {
        const Row = (
          <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition cursor-pointer">
            <div className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center", toneMap[e.tone])}>
              <e.icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{e.title}</p>
              <p className="text-xs text-muted-foreground truncate">{e.sub}</p>
            </div>
            <span className="text-[11px] text-muted-foreground shrink-0">{new Date(e.when).toLocaleDateString()}</span>
          </div>
        );
        if (e.customerId) {
          return (
            <button key={e.id} onClick={() => onPickCustomer(e.customerId!)} className="w-full text-left">
              {Row}
            </button>
          );
        }
        if (e.to) return <Link key={e.id} to={e.to as any}>{Row}</Link>;
        return <div key={e.id}>{Row}</div>;
      })}
    </div>
  );
}

function ARSummary({ data }: { data: any }) {
  const buckets = useMemo(() => {
    const inv = (data?.invoices ?? []) as any[];
    const today = new Date();
    const b = { current: 0, d30: 0, d60: 0, d90: 0, over: 0 };
    for (const i of inv) {
      if (i.status === "paid" || i.status === "void") continue;
      const amt = Number(i.amount_total ?? i.total ?? 0);
      if (!i.due_date) { b.current += amt; continue; }
      const days = Math.floor((today.getTime() - new Date(i.due_date).getTime()) / (86400 * 1000));
      if (days < 0) b.current += amt;
      else if (days < 30) b.d30 += amt;
      else if (days < 60) b.d60 += amt;
      else if (days < 90) b.d90 += amt;
      else b.over += amt;
    }
    return b;
  }, [data]);

  const rows: Array<[string, number, string]> = [
    ["Current", buckets.current, "bg-success/15 text-success"],
    ["1–30 days", buckets.d30, "bg-info/15 text-info"],
    ["31–60 days", buckets.d60, "bg-warning/20 text-[oklch(0.45_0.13_75)]"],
    ["61–90 days", buckets.d90, "bg-warning/25 text-[oklch(0.45_0.13_75)]"],
    ["90+ days", buckets.over, "bg-destructive/15 text-destructive"],
  ];
  const total = rows.reduce((a, [, v]) => a + v, 0) || 1;

  return (
    <div className="space-y-2">
      {rows.map(([label, val, tone]) => (
        <div key={label} className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <Badge variant="outline" className={cn("font-semibold", tone)}>{label}</Badge>
            <span className="text-sm font-semibold tabular-nums">{money(val)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${Math.round((val / total) * 100)}%` }} />
          </div>
        </div>
      ))}
      <Button asChild size="sm" variant="outline" className="w-full mt-2">
        <Link to="/billing">Open Invoices <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link>
      </Button>
    </div>
  );
}

function CustomerPanel({
  customerId, onClose, currency,
}: {
  customerId: string | null; onClose: () => void; currency: Ccy;
}) {
  const { data } = useQuery({
    queryKey: ["finance-customer", customerId],
    queryFn: () => loadCustomerFinancial(customerId!),
    enabled: !!customerId,
  });

  const c = data?.customer;
  const invs = data?.invoices ?? [];
  const pays = data?.payments ?? [];
  const subs = data?.subscriptions ?? [];

  const balance = useMemo(() => {
    const owed = invs.filter((i: any) => i.status !== "paid" && i.status !== "void")
      .reduce((a: number, i: any) => a + Number(i.amount_total ?? i.total ?? 0), 0);
    const revenue = pays.reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
    return { owed, revenue };
  }, [invs, pays]);

  return (
    <Sheet open={!!customerId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{c?.name ?? "Customer"}</SheetTitle>
          <SheetDescription>{c?.account_number ?? ""} · {c?.status ?? ""}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <MiniStat label="Outstanding" value={money(balance.owed, currency)} tone="warning" />
          <MiniStat label="Revenue" value={money(balance.revenue, currency)} tone="success" />
          <MiniStat label="Active Subs" value={subs.filter((s: any) => s.status === "active").length} tone="solar" />
          <MiniStat label="Invoices" value={invs.length} tone="info" />
        </div>

        <div className="mt-6 space-y-4">
          <PanelSection title="Recent invoices">
            {invs.slice(0, 6).map((i: any) => (
              <div key={i.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                <span className="font-mono text-xs">{i.invoice_number}</span>
                <span className="text-muted-foreground text-xs">{i.status}</span>
                <span className="font-semibold tabular-nums">{money(Number(i.amount_total ?? i.total ?? 0), currency)}</span>
              </div>
            ))}
            {invs.length === 0 && <p className="text-xs text-muted-foreground">No invoices</p>}
          </PanelSection>

          <PanelSection title="Recent payments">
            {pays.slice(0, 6).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                <span className="font-mono text-xs">{p.receipt_number ?? "—"}</span>
                <span className="text-muted-foreground text-xs">{p.method}</span>
                <span className="font-semibold tabular-nums">{money(Number(p.amount || 0), currency)}</span>
              </div>
            ))}
            {pays.length === 0 && <p className="text-xs text-muted-foreground">No payments</p>}
          </PanelSection>

          <PanelSection title="Subscriptions">
            {subs.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                <span className="truncate">{s.plan_name}</span>
                <span className="text-muted-foreground text-xs">{s.status}</span>
                <span className="font-semibold tabular-nums">{money(Number(s.amount || 0), currency)}</span>
              </div>
            ))}
            {subs.length === 0 && <p className="text-xs text-muted-foreground">No subscriptions</p>}
          </PanelSection>
        </div>

        {c && (
          <Button asChild className="w-full mt-6">
            <Link to="/customers/$accountNumber" params={{ accountNumber: c.account_number }} onClick={onClose}>
              Open full customer profile
            </Link>
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  const toneMap: Record<string, string> = {
    solar: "bg-solar/10 text-solar",
    info: "bg-info/10 text-info",
    success: "bg-success/10 text-success",
    warning: "bg-warning/20 text-[oklch(0.45_0.13_75)]",
  };
  return (
    <div className={cn("rounded-lg p-3", toneMap[tone])}>
      <p className="text-[10px] uppercase tracking-widest font-semibold opacity-80">{label}</p>
      <p className="font-display text-xl font-bold mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs uppercase tracking-widest font-semibold text-muted-foreground mb-2">{title}</h4>
      <div className="rounded-lg border border-border p-3">{children}</div>
    </div>
  );
}
