import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { IMT_COLORS } from "./charts";
import { cn } from "@/lib/utils";
import {
  Users, UserPlus, LifeBuoy, ServerOff, Plus, TicketPlus, FileText,
  DollarSign, KeyRound, Rocket, Server, Cloud, ChevronRight, Wallet,
  Receipt, CreditCard, Repeat, Package, Warehouse, ShieldCheck, BarChart3, FolderKanban,
  ArrowUpRight, TrendingUp, TrendingDown,
} from "lucide-react";

const USD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;


async function load() {
  const [customers, tickets, monitoring, invoices, payments, servers] = await Promise.all([
    supabase.from("customers").select("id,status,created_at").is("archived_at", null),
    supabase.from("tickets").select("id,status,created_at").is("archived_at", null),
    (supabase.from as any)("monitoring_checks").select("id,status").is("archived_at", null),
    (supabase.from as any)("invoices").select("id,total,status,issue_date,due_date").is("archived_at", null),
    (supabase.from as any)("payments").select("id,amount,status,paid_at"),
    (supabase.from as any)("cloud_servers").select("id,status,created_at").is("archived_at", null),
  ]);

  const c = customers.data ?? [];
  const t = tickets.data ?? [];
  const m = (monitoring.data ?? []) as any[];
  const inv = (invoices.data ?? []) as any[];
  const pays = ((payments.data ?? []) as any[]).filter((p) => p.status !== "void" && p.status !== "cancelled" && p.status !== "failed");
  const srv = (servers.data ?? []) as any[];

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const active = c.filter((x) => x.status === "active").length;
  const newThisMonth = c.filter((x) => new Date(x.created_at) >= startOfThisMonth).length;
  const openTickets = t.filter((x) => x.status !== "resolved" && x.status !== "closed").length;
  const newTicketsThisMonth = t.filter((x) => new Date(x.created_at) >= startOfThisMonth).length;
  const devicesDown = m.filter((x) => x.status === "down").length;
  const serversRunning = srv.filter((x) => x.status === "running" || x.status === "active").length;

  // Customers chart — 6 months of "new" vs "active cumulative"
  const chart: { label: string; new: number; active: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const nw = c.filter((x) => new Date(x.created_at) >= d && new Date(x.created_at) < end).length;
    const cum = c.filter((x) => new Date(x.created_at) < end && x.status === "active").length;
    chart.push({ label: d.toLocaleDateString("en", { month: "short" }), new: nw, active: cum });
  }

  const invIn = (start: Date, end: Date) => inv.filter((x) => x.issue_date && new Date(x.issue_date) >= start && new Date(x.issue_date) < end);
  const payIn = (start: Date, end: Date) => pays.filter((x) => x.paid_at && new Date(x.paid_at) >= start && new Date(x.paid_at) < end);

  const buildFin = (start: Date, end: Date) => {
    const ii = invIn(start, end);
    const pp = payIn(start, end);
    const paid = ii.filter((x) => x.status === "paid");
    const unpaid = ii.filter((x) => x.status !== "paid" && x.status !== "credit");
    return {
      paymentsCount: pp.length,
      paymentsTotal: pp.reduce((s, x) => s + Number(x.amount || 0), 0),
      paidCount: paid.length,
      paidTotal: paid.reduce((s, x) => s + Number(x.total || 0), 0),
      unpaidCount: unpaid.length,
      unpaidTotal: unpaid.reduce((s, x) => s + Number(x.total || 0), 0),
      creditCount: ii.filter((x) => x.status === "credit").length,
      creditTotal: ii.filter((x) => x.status === "credit").reduce((s, x) => s + Number(x.total || 0), 0),
    };
  };
  const current = buildFin(startOfThisMonth, new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const last = buildFin(startOfLastMonth, startOfThisMonth);

  return {
    active, newThisMonth, openTickets, newTicketsThisMonth, devicesDown,
    serversRunning, serversTotal: srv.length,
    chart, current, last,
  };
}

/* ---------- Gradient KPI tile (Netzur-inspired) ---------- */
function StatTile({
  label, value, icon: Icon, tone, to, hint, delta,
}: {
  label: string; value: string | number; icon: any;
  tone: "success" | "info" | "warning" | "danger";
  to: string; hint?: string; delta?: number;
}) {
  const grad = {
    success: "linear-gradient(135deg, oklch(0.62 0.15 152), oklch(0.72 0.14 162))",
    info: "linear-gradient(135deg, oklch(0.52 0.16 255), oklch(0.64 0.15 240))",
    warning: "linear-gradient(135deg, oklch(0.68 0.15 60), oklch(0.78 0.15 80))",
    danger: "linear-gradient(135deg, oklch(0.55 0.2 20), oklch(0.66 0.19 30))",
  }[tone];
  return (
    <Link to={to as any} className="group block">
      <Card className="relative overflow-hidden border-0 text-navy-foreground transition-transform group-hover:-translate-y-0.5 group-hover:shadow-[var(--shadow-elegant)]">
        <div className="absolute inset-0" style={{ background: grad }} />
        <div
          className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full opacity-20 blur-2xl"
          style={{ background: "oklch(1 0 0)" }}
        />
        <CardContent className="relative p-5">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[2px] opacity-80">{label}</p>
              <p className="font-display text-4xl font-bold tabular-nums mt-2 leading-none">{value}</p>
              {hint && <p className="text-[11px] opacity-80 mt-2">{hint}</p>}
            </div>
            <div className="h-10 w-10 rounded-xl grid place-items-center bg-white/20 backdrop-blur-sm shrink-0">
              <Icon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/25 pt-3">
            <span className="text-xs font-medium opacity-90 inline-flex items-center gap-1">
              View <ArrowUpRight className="h-3 w-3" />
            </span>
            {typeof delta === "number" && (
              <span className="text-[11px] font-semibold tabular-nums inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5">
                {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(delta)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/* ---------- Shortcut chip ---------- */
function Shortcut({ icon: Icon, label, to, color }: { icon: any; label: string; to: string; color: string }) {
  return (
    <Link
      to={to as any}
      className="group flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-solar/40 hover:shadow-sm"
    >
      <div className="h-8 w-8 rounded-lg grid place-items-center shrink-0" style={{ background: `${color}1A` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <span className="text-sm text-foreground group-hover:text-solar transition-colors truncate">{label}</span>
    </Link>
  );
}

/* ---------- Finance row ---------- */
function FinRow({ label, count, total, danger }: { label: string; count: number; total: number; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", danger ? "text-destructive" : "text-foreground")}>
        {count} ({USD(total)})
      </span>
    </div>
  );
}

export function ExecutiveDashboard({ displayName }: { displayName: string }) {
  const { data: s } = useQuery({ queryKey: ["dash-exec-splynx"], queryFn: load });
  const [chartMode, setChartMode] = useState<"new" | "active">("new");

  const chartData = useMemo(() => (s?.chart ?? []).map((d) => ({
    label: d.label, value: chartMode === "new" ? d.new : d.active,
  })), [s, chartMode]);

  const collected = s?.current.paymentsTotal ?? 0;
  const outstanding = s?.current.unpaidTotal ?? 0;
  const lastCollected = s?.last.paymentsTotal ?? 0;
  const collectedDelta = lastCollected > 0 ? Math.round(((collected - lastCollected) / lastCollected) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl p-6 md:p-8 text-navy-foreground" style={{ background: "var(--gradient-navy)" }}>
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-40 blur-3xl" style={{ background: "var(--gradient-solar)" }} />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.6) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[3px] text-solar font-semibold">IMT Operations</p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-2">
              Welcome back{displayName ? `, ${displayName}` : ""}
            </h1>
            <p className="text-navy-foreground/70 mt-2 max-w-xl">
              {new Date().toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · live view of customers, service health and cash flow.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 shrink-0">
            <HeroStat label="Collected MTD" value={USD(collected)} />
            <HeroStat label="Outstanding" value={USD(outstanding)} />
            <HeroStat label="Servers up" value={`${s?.serversRunning ?? 0}/${s?.serversTotal ?? 0}`} />
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Active customers" value={s?.active ?? 0} icon={Users} tone="success" to="/customers" hint={`${s?.newThisMonth ?? 0} added this month`} />
        <StatTile label="New customers" value={s?.newThisMonth ?? 0} icon={UserPlus} tone="info" to="/customers" hint="Current month" />
        <StatTile label="Open tickets" value={s?.openTickets ?? 0} icon={LifeBuoy} tone="warning" to="/tickets" hint={`${s?.newTicketsThisMonth ?? 0} raised this month`} />
        <StatTile
          label={s && s.devicesDown > 0 ? "Devices down" : "Servers running"}
          value={s && s.devicesDown > 0 ? s.devicesDown : (s?.serversRunning ?? 0)}
          icon={s && s.devicesDown > 0 ? ServerOff : Server}
          tone={s && s.devicesDown > 0 ? "danger" : "success"}
          to="/monitoring"
          hint={s && s.devicesDown > 0 ? "Needs attention" : `${s?.serversTotal ?? 0} total`}
        />
      </div>

      {/* Shortcuts */}
      <Card className="border-border">
        <CardContent className="p-5">
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">Shortcuts</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
            <Shortcut icon={Plus} label="Add customer" to="/customers/new" color={IMT_COLORS.info} />
            <Shortcut icon={TicketPlus} label="Add ticket" to="/tickets" color={IMT_COLORS.solar} />
            <Shortcut icon={DollarSign} label="Record payment" to="/payments" color={IMT_COLORS.success} />
            <Shortcut icon={FileText} label="Create invoice" to="/billing" color={IMT_COLORS.warning} />
            <Shortcut icon={Rocket} label="Provision server" to="/cloud-ops/new" color={IMT_COLORS.solar} />
            <Shortcut icon={KeyRound} label="Vault entry" to="/credentials" color={IMT_COLORS.navy} />
            <Shortcut icon={Cloud} label="Cloud ops" to="/cloud-ops" color={IMT_COLORS.info} />
            <Shortcut icon={Server} label="Monitoring" to="/monitoring" color={IMT_COLORS.success} />
          </div>
        </CardContent>
      </Card>

      {/* Chart + Finance */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Customers chart */}
        <Card className="border-border xl:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">Customer growth</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Last 6 months</p>
              </div>
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
                <button
                  onClick={() => setChartMode("new")}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded-md transition-colors",
                    chartMode === "new" ? "bg-info text-navy-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  New
                </button>
                <button
                  onClick={() => setChartMode("active")}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded-md transition-colors",
                    chartMode === "active" ? "text-navy-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  style={chartMode === "active" ? { background: IMT_COLORS.solar } : undefined}
                >
                  Active
                </button>
              </div>
            </div>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartMode === "new" ? IMT_COLORS.info : IMT_COLORS.solar} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={chartMode === "new" ? IMT_COLORS.info : IMT_COLORS.solar} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 255)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "oklch(0.5 0.03 260)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.5 0.03 260)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12, border: "1px solid oklch(0.92 0.01 255)",
                      background: "var(--card)", fontSize: 12, boxShadow: "var(--shadow-elegant)",
                    }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={chartMode === "new" ? IMT_COLORS.info : IMT_COLORS.solar}
                    strokeWidth={2.5}
                    fill="url(#dashArea)"
                    dot={{ r: 3, fill: chartMode === "new" ? IMT_COLORS.info : IMT_COLORS.solar, strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Finance */}
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-success/10 grid place-items-center">
                  <Wallet className="h-4 w-4 text-success" />
                </div>
                <h2 className="font-display text-lg font-semibold text-foreground">Finance</h2>
              </div>
              <Link to="/finance" className="text-xs text-info hover:underline flex items-center">
                Open <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-4 mb-4">
              <p className="text-[11px] uppercase tracking-[2px] font-semibold text-muted-foreground">Collected this month</p>
              <p className="font-display text-3xl font-bold tabular-nums mt-1">{USD(collected)}</p>
              <p className={cn("text-xs font-semibold mt-1", collectedDelta >= 0 ? "text-success" : "text-destructive")}>
                {collectedDelta >= 0 ? "▲" : "▼"} {Math.abs(collectedDelta)}% vs last month
              </p>
            </div>

            <p className="text-sm font-semibold text-success mb-1">Current month</p>
            <div>
              <FinRow label="Payments" count={s?.current.paymentsCount ?? 0} total={s?.current.paymentsTotal ?? 0} />
              <FinRow label="Paid invoices" count={s?.current.paidCount ?? 0} total={s?.current.paidTotal ?? 0} />
              <FinRow label="Unpaid invoices" count={s?.current.unpaidCount ?? 0} total={s?.current.unpaidTotal ?? 0} danger={(s?.current.unpaidCount ?? 0) > 0} />
              <FinRow label="Credit notes" count={s?.current.creditCount ?? 0} total={s?.current.creditTotal ?? 0} />
            </div>

            <p className="text-sm font-semibold text-solar mt-5 mb-1">Last month</p>
            <div>
              <FinRow label="Payments" count={s?.last.paymentsCount ?? 0} total={s?.last.paymentsTotal ?? 0} />
              <FinRow label="Paid invoices" count={s?.last.paidCount ?? 0} total={s?.last.paidTotal ?? 0} />
              <FinRow label="Unpaid invoices" count={s?.last.unpaidCount ?? 0} total={s?.last.unpaidTotal ?? 0} danger={(s?.last.unpaidCount ?? 0) > 0} />
              <FinRow label="Credit notes" count={s?.last.creditCount ?? 0} total={s?.last.creditTotal ?? 0} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Finance modules mini menu */}
      <Card className="border-border">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-foreground">Modules</h2>
            <Link to="/finance" className="text-xs text-info hover:underline flex items-center">
              Open finance <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
            <Shortcut icon={Users} label="Customers" to="/customers" color={IMT_COLORS.info} />
            <Shortcut icon={Package} label="Products & Services" to="/catalog" color={IMT_COLORS.solar} />
            <Shortcut icon={FileText} label="Quotations" to="/quotes" color={IMT_COLORS.info} />
            <Shortcut icon={Receipt} label="Invoices" to="/billing" color={IMT_COLORS.warning} />
            <Shortcut icon={CreditCard} label="Payments" to="/payments" color={IMT_COLORS.success} />
            <Shortcut icon={Repeat} label="Subscriptions" to="/subscriptions" color={IMT_COLORS.solar} />
            <Shortcut icon={ShieldCheck} label="Licenses" to="/licenses" color={IMT_COLORS.success} />
            <Shortcut icon={Warehouse} label="Inventory" to="/inventory" color={IMT_COLORS.warning} />
            <Shortcut icon={Server} label="Assets" to="/assets" color={IMT_COLORS.info} />
            <Shortcut icon={BarChart3} label="Financial reports" to="/reports" color={IMT_COLORS.solar} />
            <Shortcut icon={FolderKanban} label="Projects" to="/projects" color={IMT_COLORS.info} />
            <Shortcut icon={Wallet} label="Finance workspace" to="/finance" color={IMT_COLORS.success} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-sm min-w-[92px]">
      <p className="text-[10px] uppercase tracking-[2px] opacity-70">{label}</p>
      <p className="font-display text-lg font-bold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

