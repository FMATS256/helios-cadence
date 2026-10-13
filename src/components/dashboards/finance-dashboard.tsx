import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { HeroPanel, KpiCard, QuickAction, SectionCard } from "./shared";
import { StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import { latestRateMap, toBase } from "@/lib/currency.shared";
import { businessDay, businessMonth } from "@/lib/finance-dates.shared";
import {
  DollarSign, FileText, Receipt, TrendingUp, AlertTriangle, Plus, ArrowUpRight, Repeat,
} from "lucide-react";

const CYCLE_TO_MONTHLY: Record<string, number> = {
  monthly: 1, quarterly: 1 / 3, semi_annual: 1 / 6, semiannual: 1 / 6,
  annual: 1 / 12, yearly: 1 / 12, weekly: 4.345, daily: 30.44, one_time: 0,
};
const monthlyOf = (s: any) =>
  Number(s.amount || 0) * (CYCLE_TO_MONTHLY[String(s.billing_cycle || "monthly").toLowerCase()] ?? 1);

async function loadFinance() {
  const [invoices, payments, subs, quotes] = await Promise.all([
    (supabase.from as any)("invoices").select("id,invoice_number,total,currency,status,due_date,account_number,issue_date").is("archived_at", null).order("issue_date", { ascending: false }),
    (supabase.from as any)("payments").select("id,amount,currency,method,status,paid_at,account_number").order("paid_at", { ascending: false }),
    (supabase.from as any)("subscriptions").select("id,amount,currency,billing_cycle,status,next_renewal,account_number"),
    (supabase.from as any)("quotes").select("id,quote_number,amount,currency,status,valid_until,account_number").order("created_at", { ascending: false }),
  ]);
  const { data: rateRows } = await (supabase.from as any)("exchange_rates").select("currency,rate,effective_date");
  const rates = latestRateMap((rateRows ?? []) as any[]);
  const usd = (n: any, c: any) => toBase(n, c, rates);
  const inv = (invoices.data ?? []) as any[];
  const pay = (payments.data ?? []) as any[];
  const s = (subs.data ?? []) as any[];
  const q = (quotes.data ?? []) as any[];
  const today = new Date();
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  const unpaid = inv.filter((x) => x.status !== "paid" && x.status !== "void" && x.status !== "cancelled");
  const overdue = unpaid.filter((x) => x.due_date && String(x.due_date).slice(0, 10) < todayKey);
  const received = pay.filter((x) => x.status !== "void" && x.status !== "cancelled" && x.status !== "failed");
  const thisMonth = businessMonth(today);
  const todayKey = businessDay(today);
  const mtdPayments = received.filter((x) => x.paid_at && businessMonth(x.paid_at) === thisMonth);
  const activeSubs = s.filter((x) => x.status === "active");
  const mrr = activeSubs.reduce((a, x) => a + usd(monthlyOf(x), x.currency), 0);
  return {
    mrr,
    arr: mrr * 12,
    unpaidTotal: unpaid.reduce((a, x) => a + usd(x.total, x.currency), 0),
    unpaidCount: unpaid.length,
    overdueTotal: overdue.reduce((a, x) => a + usd(x.total, x.currency), 0),
    overdueCount: overdue.length,
    mtdCollected: mtdPayments.reduce((a, x) => a + usd(x.amount, x.currency), 0),
    openQuotes: q.filter((x) => x.status === "sent" || x.status === "draft"),
    renewalsSoon: activeSubs.filter((x) => x.next_renewal && new Date(x.next_renewal) < in30),
    recentInvoices: inv.slice(0, 6),
    recentPayments: received.slice(0, 5),
  };
}


export function FinanceDashboard({ displayName }: { displayName: string }) {
  const { data: s } = useQuery({ queryKey: ["dash-finance"], queryFn: loadFinance });
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  return (
    <>
      <HeroPanel
        eyebrow="Finance"
        title={`Welcome, ${displayName}`}
        accent="success"
        subtitle={
          <>
            <span className="text-solar font-semibold">{money(s?.mrr ?? 0)}</span> MRR (USD) ·
            <span className="text-solar font-semibold"> {money(s?.unpaidTotal ?? 0)}</span> AR ·
            <span className="text-solar font-semibold"> {s?.overdueCount ?? 0}</span> overdue invoices
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" className="bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground">
              <Link to="/reports">Reports</Link>
            </Button>
            <Button asChild className="text-solar-foreground border-0" style={{ background: "var(--gradient-solar)" }}>
              <Link to="/finance" search={{ tab: "invoices" } as any}><Plus className="h-4 w-4 mr-1.5" />New Invoice</Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard label="MRR" value={money(s?.mrr ?? 0)} icon={TrendingUp} tone="success" to="/subscriptions" />
        <KpiCard label="ARR" value={money(s?.arr ?? 0)} icon={TrendingUp} tone="success" />
        <KpiCard label="Unpaid AR" value={money(s?.unpaidTotal ?? 0)} icon={FileText} tone="warning" to="/billing" hint={`${s?.unpaidCount ?? 0} invoices`} />
        <KpiCard label="Overdue" value={money(s?.overdueTotal ?? 0)} icon={AlertTriangle} tone="danger" to="/billing" hint={`${s?.overdueCount ?? 0} past due`} />
        <KpiCard label="Collected MTD" value={money(s?.mtdCollected ?? 0)} icon={Receipt} tone="info" to="/payments" />
        <KpiCard label="Renewals ≤ 30d" value={s?.renewalsSoon?.length ?? 0} icon={Repeat} tone="solar" to="/subscriptions" />
      </div>

      <SectionCard title="Finance workflows">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction icon={FileText} label="Draft Invoice" to="/billing" tone="warning" />
          <QuickAction icon={DollarSign} label="Record Payment" to="/payments" tone="success" />
          <QuickAction icon={Repeat} label="New Subscription" to="/subscriptions" tone="solar" />
          <QuickAction icon={Receipt} label="Send Quote" to="/quotes" tone="info" />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionCard title="Recent invoices" action={<Button variant="ghost" size="sm" asChild><Link to="/finance" search={{ tab: "invoices" } as any}>All <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></Button>}>
          <div className="space-y-2">
            {(s?.recentInvoices ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No invoices yet</p>}
            {(s?.recentInvoices ?? []).map((i: any) => (
              <div key={i.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className="h-10 w-10 rounded-lg bg-warning/15 text-[oklch(0.45_0.13_75)] flex items-center justify-center font-semibold text-xs">{i.invoice_number}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{money(Number(i.total || 0))} <span className="text-xs text-muted-foreground">{i.currency}</span></p>
                  <p className="text-xs text-muted-foreground">{i.account_number} · due {i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"}</p>
                </div>
                <StatusPill tone={i.status === "paid" ? "success" : i.status === "overdue" ? "danger" : "warning"}>{i.status}</StatusPill>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Recent payments" action={<Button variant="ghost" size="sm" asChild><Link to="/payments">All <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></Button>}>
          <div className="space-y-2">
            {(s?.recentPayments ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No payments logged</p>}
            {(s?.recentPayments ?? []).map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className="h-10 w-10 rounded-lg bg-success/15 text-success flex items-center justify-center"><DollarSign className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{money(Number(p.amount || 0))} <span className="text-xs text-muted-foreground">{p.currency}</span></p>
                  <p className="text-xs text-muted-foreground">{p.account_number} · {p.method} · {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}</p>
                </div>
                <StatusPill tone={p.status === "cleared" ? "success" : "info"}>{p.status}</StatusPill>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
