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
    (supabase.from as any)("invoices").select("id,amount_total,status,issued_at,due_date").is("archived_at", null),
    (supabase.from as any)("payments").select("id,amount,created_at").is("archived_at", null),
    (supabase.from as any)("cloud_servers").select("id,status,created_at").is("archived_at", null),
  ]);

  const c = customers.data ?? [];
  const t = tickets.data ?? [];
  const m = (monitoring.data ?? []) as any[];
  const inv = (invoices.data ?? []) as any[];
  const pays = (payments.data ?? []) as any[];
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

  const invIn = (start: Date, end: Date) => inv.filter((x) => x.issued_at && new Date(x.issued_at) >= start && new Date(x.issued_at) < end);
  const payIn = (start: Date, end: Date) => pays.filter((x) => x.created_at && new Date(x.created_at) >= start && new Date(x.created_at) < end);

  const buildFin = (start: Date, end: Date) => {
    const ii = invIn(start, end);
    const pp = payIn(start, end);
    const paid = ii.filter((x) => x.status === "paid");
    const unpaid = ii.filter((x) => x.status !== "paid" && x.status !== "credit");
    return {
      paymentsCount: pp.length,
      paymentsTotal: pp.reduce((s, x) => s + Number(x.amount || 0), 0),
      paidCount: paid.length,
      paidTotal: paid.reduce((s, x) => s + Number(x.amount_total || 0), 0),
      unpaidCount: unpaid.length,
      unpaidTotal: unpaid.reduce((s, x) => s + Number(x.amount_total || 0), 0),
      creditCount: ii.filter((x) => x.status === "credit").length,
      creditTotal: ii.filter((x) => x.status === "credit").reduce((s, x) => s + Number(x.amount_total || 0), 0),
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

/* ---------- KPI tile (Splynx style) ---------- */
function StatTile({
  label, value, icon: Icon, tone, to,
}: {
  label: string; value: string | number; icon: any;
  tone: "success" | "info" | "warning" | "danger";
  to: string;
}) {
  const toneMap = {
    success: { fg: "text-success", ring: "bg-success/10" },
    info: { fg: "text-info", ring: "bg-info/10" },
    warning: { fg: "text-solar", ring: "bg-solar/10" },
    danger: { fg: "text-destructive", ring: "bg-destructive/10" },
  }[tone];
  return (
    <Card className="border-border overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={cn("h-10 w-10 rounded-xl grid place-items-center shrink-0", toneMap.ring)}>
            <Icon className={cn("h-5 w-5", toneMap.fg)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{label}</p>
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between border-t border-border pt-3">
          <Link to={to as any} className="text-sm text-info hover:underline font-medium">View</Link>
          <p className={cn("font-display text-3xl font-bold tabular-nums", toneMap.fg)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Shortcut chip ---------- */
function Shortcut({ icon: Icon, label, to, color }: { icon: any; label: string; to: string; color: string }) {
  return (
    <Link
      to={to as any}
      className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50 transition-colors"
    >
      <div className="h-8 w-8 rounded-md grid place-items-center shrink-0" style={{ background: `${color}1A` }}>
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

export function ExecutiveDashboard({ displayName: _displayName }: { displayName: string }) {
  const { data: s } = useQuery({ queryKey: ["dash-exec-splynx"], queryFn: load });
  const [chartMode, setChartMode] = useState<"new" | "active">("new");

  const chartData = useMemo(() => (s?.chart ?? []).map((d) => ({
    label: d.label, value: chartMode === "new" ? d.new : d.active,
  })), [s, chartMode]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-lg bg-solar/10 grid place-items-center">
          <Wallet className="h-5 w-5 text-solar" />
        </div>
        <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Active customers" value={s?.active ?? 0} icon={Users} tone="success" to="/customers" />
        <StatTile label="New customers" value={s?.newThisMonth ?? 0} icon={UserPlus} tone="info" to="/customers" />
        <StatTile label="New & open tickets" value={s?.openTickets ?? 0} icon={LifeBuoy} tone="warning" to="/tickets" />
        <StatTile
          label={s && s.devicesDown > 0 ? "Devices down" : "Servers running"}
          value={s && s.devicesDown > 0 ? s.devicesDown : (s?.serversRunning ?? 0)}
          icon={s && s.devicesDown > 0 ? ServerOff : Server}
          tone={s && s.devicesDown > 0 ? "danger" : "success"}
          to="/monitoring"
        />
      </div>

      {/* Shortcuts */}
      <Card className="border-border">
        <CardContent className="p-5">
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">Shortcuts</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-1">
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
              <h2 className="font-display text-lg font-semibold text-foreground">Customers chart</h2>
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
                <button
                  onClick={() => setChartMode("new")}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded-md transition-colors",
                    chartMode === "new" ? "bg-info text-white" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  New
                </button>
                <button
                  onClick={() => setChartMode("active")}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded-md transition-colors",
                    chartMode === "active" ? "text-white" : "text-muted-foreground hover:text-foreground",
                  )}
                  style={chartMode === "active" ? { background: IMT_COLORS.solar } : undefined}
                >
                  Active
                </button>
              </div>
            </div>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 255)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "oklch(0.5 0.03 260)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.5 0.03 260)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8, border: "1px solid oklch(0.92 0.01 255)",
                      background: "white", fontSize: 12,
                    }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={chartMode === "new" ? IMT_COLORS.info : IMT_COLORS.solar}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: chartMode === "new" ? IMT_COLORS.info : IMT_COLORS.solar, strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
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
            <h2 className="font-display text-lg font-semibold text-foreground">Finance modules</h2>
            <Link to="/finance" className="text-xs text-info hover:underline flex items-center">
              Open finance <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-1">
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
