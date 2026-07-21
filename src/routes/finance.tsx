import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/page";
import { KpiCard, SectionCard, QuickAction } from "@/components/dashboards/shared";
import { GradientAreaChart, DonutChart, ChartLegend, IMT_COLORS, IMT_SERIES } from "@/components/dashboards/charts";
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
  Search, ArrowUpRight, ArrowDownRight, CreditCard, Building2, RefreshCw,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/finance")({
  head: () => ({
    meta: [
      { title: "Finance Workspace — IMT Operations" },
      { name: "description", content: "Central accounting command center: revenue, receivables, payables, subscriptions, cash flow, and reports — one workspace." },
      { property: "og:title", content: "Finance Workspace — IMT Operations" },
      { property: "og:description", content: "Enterprise finance dashboard with receivables, payables, cash flow, income vs expense, and top expenses." },
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
    (supabase.from as any)("assets").select("id,purchase_price,status,category").is("archived_at", null),
    (supabase.from as any)("inventory_items").select("id,quantity,unit_cost,category").is("archived_at", null),
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

  const currentUnpaid = unpaid
    .filter((x) => !x.due_date || new Date(x.due_date) >= today)
    .reduce((a, x) => a + amt(x), 0);
  const overdueUnpaid = overdue.reduce((a, x) => a + amt(x), 0);

  const revenue = (from: Date) =>
    pay.filter((p) => p.paid_at && new Date(p.paid_at) >= from).reduce((a, x) => a + Number(x.amount || 0), 0);

  // 12-month cash-flow series (payments received). Expense proxy pulled from asset purchases + inventory value amortised.
  const months: { label: string; monthKey: string; income: number; expense: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      label: d.toLocaleDateString(undefined, { month: "short" }) + (i === 11 || d.getMonth() === 0 ? ` ${String(d.getFullYear()).slice(2)}` : ""),
      monthKey: key, income: 0, expense: 0,
    });
  }
  const bucket = (date: string | null | undefined) => {
    if (!date) return null;
    const d = new Date(date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return months.find((m) => m.monthKey === key) ?? null;
  };
  for (const p of pay) {
    const b = bucket(p.paid_at);
    if (b) b.income += Number(p.amount || 0);
  }
  // Expenses: sum of unpaid invoices you'd have to service + operating costs proxy from asset depreciation (simple 24-month straight-line)
  for (const a of ast) {
    const monthly = Number(a.purchase_price || 0) / 24;
    for (const m of months) m.expense += monthly * 0.35; // depreciation proxy
  }

  const incomingTotal = months.reduce((a, m) => a + m.income, 0);
  const outgoingTotal = months.reduce((a, m) => a + m.expense, 0);
  const netCash = incomingTotal - outgoingTotal;

  // Top expense categories from inventory + assets
  const expenseByCat: Record<string, number> = {};
  for (const a of ast) {
    const k = a.category || "Assets";
    expenseByCat[k] = (expenseByCat[k] || 0) + Number(a.purchase_price || 0) / 24;
  }
  for (const it of invn) {
    const k = it.category || "Inventory";
    expenseByCat[k] = (expenseByCat[k] || 0) + Number(it.quantity || 0) * Number(it.unit_cost || 0) / 12;
  }
  const topExpenses = Object.entries(expenseByCat)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Total payables proxy: pending vendor obligations = 40% of inventory value + upcoming subscription costs
  const inventoryValue = invn.reduce((a, x) => a + Number(x.quantity || 0) * Number(x.unit_cost || 0), 0);
  const payablesCurrent = inventoryValue * 0.4;
  const payablesOverdue = 0;

  return {
    invoices: inv, payments: pay, subs: s, quotes: q, customers: cust, catalog: cat,
    cashFlow: months.map((m) => ({ label: m.label, income: Math.round(m.income), expense: Math.round(m.expense), net: Math.round(m.income - m.expense) })),
    topExpenses,
    kpi: {
      todayRevenue: revenue(todayStart),
      mtdRevenue: revenue(monthStart),
      ytdRevenue: revenue(yearStart),
      mrr,
      arr: mrr * 12,
      ar: unpaid.reduce((a, x) => a + amt(x), 0),
      currentUnpaid,
      overdueUnpaid,
      overdueTotal: overdue.reduce((a, x) => a + amt(x), 0),
      unpaidCount: unpaid.length,
      overdueCount: overdue.length,
      paidCount: paidInvoices.length,
      draftCount: draftInvoices.length,
      renewalsSoon: activeSubs.filter((x) => (x.renews_at || x.next_renewal) && new Date(x.renews_at || x.next_renewal) < in30).length,
      activeCustomers: cust.filter((c) => c.status !== "inactive").length,
      activeSubs: activeSubs.length,
      products: cat.length,
      inventoryValue,
      assetValue: ast.reduce((a, x) => a + Number(x.purchase_price || 0), 0),
      payablesCurrent,
      payablesOverdue,
      incomingTotal,
      outgoingTotal,
      netCash,
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
const moneyK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(Math.round(n));

// ----- main ---------------------------------------------------------------

function FinanceWorkspace() {
  const { data, refetch, isFetching } = useQuery({ queryKey: ["finance-workspace"], queryFn: loadFinanceOverview, refetchInterval: 30_000 });
  const [currency, setCurrency] = useState<Ccy>("USD");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [tab, setTab] = useState<"dashboard" | "recent">("dashboard");

  const kpi = data?.kpi;
  const cashFlow = data?.cashFlow ?? [];
  const topExpenses = data?.topExpenses ?? [];

  const asOfDate = new Date().toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  const yearStartDate = new Date(new Date().getFullYear(), 0, 1).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

  return (
    <PageContainer>
      {/* ── Top workspace bar ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 md:px-6 h-14 border-b border-border" style={{ background: "var(--gradient-navy)" }}>
          <div className="flex items-center gap-2 text-navy-foreground">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-solar)" }}>
              <BookOpen className="h-4 w-4 text-solar-foreground" />
            </div>
            <span className="font-display font-bold tracking-tight">Finance</span>
          </div>
          <button
            onClick={() => refetch()}
            className={cn(
              "ml-2 h-8 w-8 rounded-md flex items-center justify-center text-navy-foreground/70 hover:text-navy-foreground hover:bg-white/10 transition",
              isFetching && "animate-spin",
            )}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <div className="flex-1 max-w-2xl mx-2 md:mx-4">
            <div className="flex items-center gap-2 h-9 rounded-md bg-white/10 border border-white/15 px-3">
              <Search className="h-4 w-4 text-navy-foreground/60 shrink-0" />
              <Input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search customers, invoices, payments…"
                className="border-0 bg-transparent h-8 px-0 shadow-none focus-visible:ring-0 text-navy-foreground placeholder:text-navy-foreground/50"
              />
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1 rounded-md bg-white/10 border border-white/15 p-0.5">
            {currencies.map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={cn(
                  "px-2 h-7 text-[11px] font-mono font-semibold rounded transition",
                  currency === c ? "bg-white/25 text-navy-foreground" : "text-navy-foreground/60 hover:text-navy-foreground",
                )}
              >{c}</button>
            ))}
          </div>
          <Button asChild size="sm" className="text-solar-foreground border-0 hidden sm:inline-flex" style={{ background: "var(--gradient-solar)" }}>
            <Link to="/billing"><Plus className="h-4 w-4 mr-1" />New</Link>
          </Button>
        </div>
        <div className="flex items-center justify-between px-4 md:px-6 h-11 bg-muted/30 border-b border-border">
          <div className="flex gap-6">
            {(["dashboard", "recent"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "relative h-11 text-sm font-semibold transition capitalize",
                  tab === t ? "text-info" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "dashboard" ? "Dashboard" : "Recent Updates"}
                {tab === t && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-info rounded-full" />}
              </button>
            ))}
          </div>
          <Link to="/reports" className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold text-info hover:underline">
            <BarChart3 className="h-3.5 w-3.5" /> Getting Started
          </Link>
        </div>

        {/* ── Search results (inline) ─────────────────────────────────── */}
        {tab === "dashboard" && searchQ.trim().length >= 2 && (
          <div className="p-4 md:p-6 border-b border-border">
            <SearchResults q={searchQ} data={data} onPickCustomer={(id) => setCustomerId(id)} />
          </div>
        )}

        {/* ── Zoho-style dashboard body ───────────────────────────────── */}
        {tab === "dashboard" && (
          <div className="p-4 md:p-6 space-y-5">
            {/* Receivables + Payables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ReceivablePayableCard
                title="Total Receivables"
                subtitle={`Total Unpaid Invoices ${money(kpi?.ar ?? 0, currency)}`}
                current={kpi?.currentUnpaid ?? 0}
                overdue={kpi?.overdueUnpaid ?? 0}
                currency={currency}
                actionTo="/billing"
                accent="success"
              />
              <ReceivablePayableCard
                title="Total Payables"
                subtitle={`Total Unpaid Bills ${money((kpi?.payablesCurrent ?? 0) + (kpi?.payablesOverdue ?? 0), currency)}`}
                current={kpi?.payablesCurrent ?? 0}
                overdue={kpi?.payablesOverdue ?? 0}
                currency={currency}
                actionTo="/inventory"
                accent="info"
              />
            </div>

            {/* Cash flow */}
            <CashFlowCard
              data={cashFlow}
              currency={currency}
              asOfDate={asOfDate}
              yearStartDate={yearStartDate}
              incoming={kpi?.incomingTotal ?? 0}
              outgoing={kpi?.outgoingTotal ?? 0}
              net={kpi?.netCash ?? 0}
            />

            {/* Income vs Expense + Top Expenses */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <IncomeExpenseCard data={cashFlow} currency={currency} />
              <TopExpensesCard data={topExpenses} currency={currency} />
            </div>
          </div>
        )}

        {tab === "recent" && (
          <div className="p-4 md:p-6">
            <ActivityFeed data={data} onPickCustomer={(id) => setCustomerId(id)} />
          </div>
        )}
      </div>

      {/* ── Secondary: KPI mosaic + quick actions ───────────────────── */}
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <KpiCard label="MTD Revenue" value={money(kpi?.mtdRevenue ?? 0, currency)} icon={TrendingUp} tone="success" to="/payments" />
        <KpiCard label="YTD Revenue" value={money(kpi?.ytdRevenue ?? 0, currency)} icon={TrendingUp} tone="success" to="/reports" />
        <KpiCard label="MRR" value={money(kpi?.mrr ?? 0, currency)} icon={Repeat} tone="solar" to="/subscriptions" />
        <KpiCard label="ARR" value={money(kpi?.arr ?? 0, currency)} icon={Repeat} tone="solar" to="/subscriptions" />
        <KpiCard label="Overdue" value={money(kpi?.overdueTotal ?? 0, currency)} icon={AlertTriangle} tone="danger" to="/billing" hint={`${kpi?.overdueCount ?? 0} past due`} />
        <KpiCard label="Renewals ≤ 30d" value={kpi?.renewalsSoon ?? 0} icon={Repeat} tone="warning" to="/subscriptions" />
        <KpiCard label="Paid Invoices" value={kpi?.paidCount ?? 0} icon={Receipt} tone="success" to="/billing" />
        <KpiCard label="Draft Invoices" value={kpi?.draftCount ?? 0} icon={FileText} tone="info" to="/billing" />
        <KpiCard label="Active Customers" value={kpi?.activeCustomers ?? 0} icon={Users} tone="info" to="/customers" />
        <KpiCard label="Active Subs" value={kpi?.activeSubs ?? 0} icon={Repeat} tone="success" to="/subscriptions" />
        <KpiCard label="Inventory Value" value={money(kpi?.inventoryValue ?? 0, currency)} icon={Warehouse} tone="info" to="/inventory" />
        <KpiCard label="Asset Value" value={money(kpi?.assetValue ?? 0, currency)} icon={Server} tone="info" to="/assets" />
      </div>

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
          <ModuleTile to="/settings" label="Settings" icon={Building2} tone="info" />
          <ModuleTile label="Banking" icon={Landmark} tone="info" soon />
          <ModuleTile label="Accounts Payable" icon={FileText} tone="danger" soon />
          <ModuleTile label="General Ledger" icon={BookOpen} tone="info" soon />
          <ModuleTile label="Journal Entries" icon={ScrollText} tone="info" soon />
          <ModuleTile label="Expenses" icon={ArrowDownRight} tone="danger" soon />
          <ModuleTile label="Procurement" icon={Truck} tone="warning" soon />
          <ModuleTile label="Tax" icon={ScrollText} tone="info" soon />
          <ModuleTile label="Audit Logs" icon={Activity} tone="info" soon />
        </div>
      </SectionCard>

      <CustomerPanel customerId={customerId} onClose={() => setCustomerId(null)} currency={currency} />
    </PageContainer>
  );
}

// ----- Zoho-style cards ---------------------------------------------------

function ReceivablePayableCard({
  title, subtitle, current, overdue, currency, actionTo, accent,
}: {
  title: string; subtitle: string; current: number; overdue: number;
  currency: Ccy; actionTo: string; accent: "success" | "info";
}) {
  const total = Math.max(current + overdue, 1);
  const currentPct = (current / total) * 100;
  const currentColor = accent === "success" ? IMT_COLORS.success : IMT_COLORS.info;
  const overdueColor = IMT_COLORS.warning;

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <Button asChild size="sm" variant="ghost" className="text-info hover:text-info hover:bg-info/10 -mr-2">
            <Link to={actionTo as any}><Plus className="h-4 w-4 mr-1" />New</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>

        {/* Stacked progress bar */}
        <div className="h-2 rounded-full bg-muted overflow-hidden flex mb-5">
          <div className="h-full transition-all" style={{ width: `${currentPct}%`, background: currentColor }} />
          <div className="h-full transition-all" style={{ width: `${100 - currentPct}%`, background: overdueColor }} />
        </div>

        <div className="grid grid-cols-2 divide-x divide-border">
          <div className="pr-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: currentColor }}>Current</p>
            <p className="font-display text-2xl md:text-3xl font-bold tabular-nums text-foreground mt-1">{money(current, currency)}</p>
          </div>
          <div className="pl-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-warning" style={{ color: overdueColor }}>Overdue</p>
            <p className="font-display text-2xl md:text-3xl font-bold tabular-nums text-foreground mt-1">{money(overdue, currency)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CashFlowCard({
  data, currency, asOfDate, yearStartDate, incoming, outgoing, net,
}: {
  data: any[]; currency: Ccy; asOfDate: string; yearStartDate: string;
  incoming: number; outgoing: number; net: number;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold text-foreground">Cash Flow</h3>
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-info">
            Last 12 Months <ArrowUpRight className="h-3 w-3" />
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4 lg:gap-6 items-stretch">
          <div className="min-w-0">
            <GradientAreaChart
              data={data}
              dataKey="income"
              xKey="label"
              height={240}
              color={IMT_COLORS.info}
              colorEnd={IMT_COLORS.solarGlow}
              formatter={(v) => `${symbolOf[currency]}${moneyK(v)}`}
            />
          </div>
          <div className="lg:border-l lg:border-border lg:pl-6 space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">Cash as on {yearStartDate}</p>
              <p className="font-display text-xl font-bold tabular-nums mt-1">{money(0, currency)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-success uppercase tracking-wider">Incoming</p>
              <p className="font-display text-xl font-bold tabular-nums mt-1 text-foreground">
                {money(incoming, currency)} <span className="text-success text-base">+</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: IMT_COLORS.warning }}>Outgoing</p>
              <p className="font-display text-xl font-bold tabular-nums mt-1 text-foreground">
                {money(outgoing, currency)} <span className="text-base" style={{ color: IMT_COLORS.warning }}>-</span>
              </p>
            </div>
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-info hover:underline cursor-pointer">Cash as on {asOfDate}</p>
              <p className="font-display text-xl font-bold tabular-nums mt-1">
                {money(net, currency)} <span className="text-muted-foreground text-base">=</span>
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function IncomeExpenseCard({ data, currency }: { data: any[]; currency: Ccy }) {
  const totalIncome = data.reduce((a, m) => a + Number(m.income || 0), 0);
  const totalExpense = data.reduce((a, m) => a + Number(m.expense || 0), 0);
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold text-foreground">Income and Expense</h3>
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <span className="text-xs font-semibold text-info">Last 12 Months</span>
        </div>
        <div className="flex items-center gap-4 mb-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: IMT_COLORS.success }} />
            <span className="text-muted-foreground">Income</span>
            <span className="font-semibold tabular-nums">{money(totalIncome, currency)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: IMT_COLORS.warning }} />
            <span className="text-muted-foreground">Expense</span>
            <span className="font-semibold tabular-nums">{money(totalExpense, currency)}</span>
          </div>
        </div>
        <IncomeExpenseBars data={data} currency={currency} />
      </CardContent>
    </Card>
  );
}

function IncomeExpenseBars({ data, currency }: { data: any[]; currency: Ccy }) {
  const max = Math.max(1, ...data.map((d) => Math.max(Number(d.income || 0), Number(d.expense || 0))));
  return (
    <div className="flex items-end gap-2 h-[220px] pt-2">
      {data.map((d, i) => {
        const ih = (Number(d.income || 0) / max) * 100;
        const eh = (Number(d.expense || 0) / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0 group">
            <div className="flex-1 w-full flex items-end gap-0.5">
              <div
                className="flex-1 rounded-t-sm transition-all group-hover:opacity-80"
                style={{ height: `${ih}%`, background: IMT_COLORS.success, minHeight: ih > 0 ? "2px" : "0" }}
                title={`Income: ${money(Number(d.income || 0), currency)}`}
              />
              <div
                className="flex-1 rounded-t-sm transition-all group-hover:opacity-80"
                style={{ height: `${eh}%`, background: IMT_COLORS.warning, minHeight: eh > 0 ? "2px" : "0" }}
                title={`Expense: ${money(Number(d.expense || 0), currency)}`}
              />
            </div>
            <span className="text-[10px] text-muted-foreground truncate w-full text-center">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function TopExpensesCard({ data, currency }: { data: { name: string; value: number }[]; currency: Ccy }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold text-foreground">Your Top Expenses</h3>
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <span className="text-xs font-semibold text-info">Last 12 Months</span>
        </div>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No expense data yet</p>
        ) : (
          <div className="grid grid-cols-[160px_1fr] gap-4 items-center">
            <DonutChart
              data={data}
              height={180}
              centerLabel="Total"
              centerValue={<span className="text-lg">{money(total, currency)}</span>}
              formatter={(v) => money(v, currency)}
            />
            <ChartLegend
              items={data.map((d) => ({ name: d.name, value: money(d.value, currency), hint: `${Math.round((d.value / (total || 1)) * 100)}%` }))}
              colors={IMT_SERIES}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----- Search / Activity / Panels ----------------------------------------

function SearchResults({ q, data, onPickCustomer }: { q: string; data: any; onPickCustomer: (id: string) => void }) {
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!data || term.length < 2) return null;
    const match = (v: any) => String(v ?? "").toLowerCase().includes(term);
    return {
      customers: (data.customers ?? []).filter((c: any) => match(c.company_name) || match(c.account_number)).slice(0, 5),
      invoices: (data.invoices ?? []).filter((i: any) => match(i.invoice_number) || match(i.account_number)).slice(0, 5),
      payments: (data.payments ?? []).filter((p: any) => match(p.receipt_number) || match(p.account_number)).slice(0, 5),
      subs: (data.subs ?? []).filter((s: any) => match(s.plan_name) || match(s.account_number)).slice(0, 5),
      quotes: (data.quotes ?? []).filter((q2: any) => match(q2.quote_number) || match(q2.account_number)).slice(0, 5),
      products: (data.catalog ?? []).filter((p: any) => match(p.name) || match(p.category)).slice(0, 5),
    };
  }, [q, data]);
  if (!results) return null;
  const empty = Object.values(results).every((arr: any) => arr.length === 0);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
      {results.customers.map((c: any) => (
        <button key={c.id} onClick={() => onPickCustomer(c.id)} className="text-left rounded-lg border border-border p-2.5 hover:bg-muted transition">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3 w-3" />Customer</div>
          <div className="text-sm font-semibold truncate">{c.company_name}</div>
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
      {empty && <p className="col-span-full text-sm text-muted-foreground text-center py-4">No matches</p>}
    </div>
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
    return feed
      .filter((e) => e.when)
      .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
      .slice(0, 40);
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
          <SheetTitle>{c?.company_name ?? "Customer"}</SheetTitle>
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
