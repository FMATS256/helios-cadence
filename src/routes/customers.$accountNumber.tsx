import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  KeyRound, LifeBuoy, FileText, CreditCard, Receipt, Server, DollarSign, TrendingUp,
  Plus, FileCheck, Laptop, Activity, Sparkles, CalendarClock, Target, Building2,
  Mail, Phone, ShieldCheck, Heart,
} from "lucide-react";
import { getCustomer360, generateInvoiceForSubscription, manageSubscription } from "@/lib/ops.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, ArrowUpCircle, ArrowDownCircle, PauseCircle, PlayCircle, XCircle, RefreshCw, Settings2 } from "lucide-react";

export const Route = createFileRoute("/customers/$accountNumber")({
  head: ({ params }) => ({ meta: [{ title: `${params.accountNumber} — Customer 360` }] }),
  component: Customer360,
  notFoundComponent: () => (
    <PageContainer><PageHeader title="Customer not found" description="That M-number doesn't exist." /></PageContainer>
  ),
});

function money(n: number, ccy = "USD") {
  return `${ccy} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function daysUntil(d?: string | null) {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  return Math.round(ms / 86400000);
}

function computeHealth(view: any): { score: number; label: string; tone: "success" | "warning" | "danger" } {
  let score = 100;
  const outstanding = Number(view?.stats?.openInvoiceTotal || 0);
  const overdue = (view?.invoices || []).filter((i: any) => i.status === "overdue").length;
  const openTickets = (view?.tickets || []).filter((t: any) => t.status !== "resolved" && t.status !== "closed").length;
  const critical = (view?.tickets || []).filter((t: any) => t.priority === "critical" && t.status !== "resolved").length;
  const active = view?.stats?.activeServices || 0;
  if (outstanding > 0) score -= Math.min(25, Math.floor(outstanding / 100));
  score -= overdue * 8;
  score -= openTickets * 3;
  score -= critical * 10;
  if (active === 0) score -= 15;
  score = Math.max(5, Math.min(100, score));
  const tone = score >= 75 ? "success" : score >= 50 ? "warning" : "danger";
  const label = score >= 75 ? "Healthy" : score >= 50 ? "At risk" : "Critical";
  return { score, label, tone };
}

function tierOf(amount: number, cycle?: string): "platinum" | "gold" | "silver" | "bronze" {
  const monthly = (cycle || "monthly").toLowerCase() === "yearly" || (cycle || "").toLowerCase() === "annual"
    ? Number(amount || 0) / 12
    : (cycle || "").toLowerCase() === "quarterly" ? Number(amount || 0) / 3 : Number(amount || 0);
  if (monthly >= 1000) return "platinum";
  if (monthly >= 300) return "gold";
  if (monthly >= 50) return "silver";
  return "bronze";
}

function subHealthScore(s: any): number {
  if (s.status === "cancelled") return 0;
  if (s.status === "paused") return 40;
  const d = (s.next_renewal ? Math.round((new Date(s.next_renewal).getTime() - Date.now()) / 86400000) : null);
  if (d == null) return 80;
  if (d < 0) return Math.max(5, 30 + d); // overdue drops fast
  if (d <= 7) return 55;
  if (d <= 30) return 75;
  return 95;
}

function toCsv(rows: Array<Record<string, any>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}


function Customer360() {
  const { accountNumber } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fetch360 = useServerFn(getCustomer360);
  const genInvoice = useServerFn(generateInvoiceForSubscription);

  const { data: view, isLoading } = useQuery({
    queryKey: ["customer-360", accountNumber],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch360({ data: { account_number: accountNumber } });
      if (!res) throw notFound();
      return res;
    },
  });

  const customer = view?.customer;

  const { data: contacts = [] } = useQuery({
    queryKey: ["customer-contacts", accountNumber],
    enabled: !!customer,
    queryFn: async () => (await supabase.from("customer_contacts").select("*").eq("customer_id", customer!.id).is("archived_at", null)).data ?? [],
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["customer-branches", accountNumber],
    enabled: !!customer,
    queryFn: async () => (await supabase.from("customer_branches").select("*").eq("customer_id", customer!.id).is("archived_at", null)).data ?? [],
  });
  const { data: notes = [] } = useQuery({
    queryKey: ["customer-notes", accountNumber],
    enabled: !!customer,
    queryFn: async () => (await supabase.from("customer_notes").select("*").eq("customer_id", customer!.id).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: communications = [] } = useQuery({
    queryKey: ["customer-comms", accountNumber],
    enabled: !!customer,
    queryFn: async () => (await supabase.from("communications").select("*").eq("customer_id", customer!.id).order("occurred_at", { ascending: false }).limit(50)).data ?? [],
  });

  const [noteBody, setNoteBody] = useState("");
  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customer_notes").insert({ customer_id: customer!.id, account_number: customer!.account_number, body: noteBody, author_id: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => { setNoteBody(""); qc.invalidateQueries({ queryKey: ["customer-notes", accountNumber] }); toast.success("Note added"); },
  });

  const [contactForm, setContactForm] = useState({ name: "", role: "", contact_type: "general", email: "", phone: "" });
  const addContact = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customer_contacts").insert({ customer_id: customer!.id, account_number: customer!.account_number, ...contactForm });
      if (error) throw error;
    },
    onSuccess: () => { setContactForm({ name: "", role: "", contact_type: "general", email: "", phone: "" }); qc.invalidateQueries({ queryKey: ["customer-contacts", accountNumber] }); toast.success("Contact added"); },
  });

  const invoiceFromSub = useMutation({
    mutationFn: async (subscription_id: string) => genInvoice({ data: { subscription_id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customer-360", accountNumber] }); toast.success("Invoice generated"); },
    onError: (e: any) => toast.error(e?.message || "Could not generate invoice"),
  });

  const manageSub = useServerFn(manageSubscription);
  const subAction = useMutation({
    mutationFn: async (input: Parameters<typeof manageSubscription>[0]["data"]) => manageSub({ data: input }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["customer-360", accountNumber] });
      toast.success(`Subscription ${vars.action} applied`);
    },
    onError: (e: any) => toast.error(e?.message || "Action failed"),
  });

  const [editSub, setEditSub] = useState<{ sub: any; mode: "upgrade" | "downgrade" } | null>(null);
  const [editForm, setEditForm] = useState({ plan_name: "", description: "", amount: 0, billing_cycle: "monthly" });

  const [svcFilters, setSvcFilters] = useState({
    q: "",
    status: "all" as "all" | "active" | "paused" | "cancelled",
    tier: "all" as "all" | "platinum" | "gold" | "silver" | "bronze",
    startFrom: "",
    startTo: "",
    renewFrom: "",
    renewTo: "",
    minHealth: 0,
    sortBy: "next_renewal" as "next_renewal" | "started_on" | "amount" | "plan_name" | "health",
    sortDir: "asc" as "asc" | "desc",
  });

  const health = useMemo(() => view ? computeHealth(view) : null, [view]);


  function subHealth(s: any): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
    if (s.status === "cancelled") return { label: "Cancelled", tone: "neutral" };
    if (s.status === "paused") return { label: "Suspended", tone: "warning" };
    const d = daysUntil(s.next_renewal);
    if (d == null) return { label: "Active", tone: "success" };
    if (d < 0) return { label: `Overdue ${Math.abs(d)}d`, tone: "danger" };
    if (d <= 7) return { label: `Renews ${d}d`, tone: "danger" };
    if (d <= 30) return { label: `Renews ${d}d`, tone: "warning" };
    return { label: `Renews ${d}d`, tone: "success" };
  }

  const renewals = useMemo(() => {
    if (!view) return [];
    const rows: any[] = [];
    (view.subscriptions || []).forEach((s: any) => {
      if (s.next_renewal) rows.push({ kind: "Subscription", label: s.plan_name, date: s.next_renewal, amount: s.amount, currency: s.currency, status: s.status });
    });
    (view.services || []).forEach((s: any) => {
      if (s.renewal_date) rows.push({ kind: "Service", label: s.service_name, date: s.renewal_date, amount: s.monthly_cost, currency: "USD", status: s.status });
    });
    (view.credentials || []).forEach((c: any) => {
      if (c.expires_at) rows.push({ kind: "Credential", label: c.name, date: c.expires_at, status: "active" });
    });
    return rows
      .map((r) => ({ ...r, daysLeft: daysUntil(r.date) }))
      .filter((r) => r.daysLeft !== null && r.daysLeft <= 120 && r.daysLeft >= -30)
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  }, [view]);

  const opportunities = useMemo(() => {
    if (!view) return [] as { title: string; hint: string }[];
    const ops: { title: string; hint: string }[] = [];
    const cats = new Set((view.packages || []).map((p: any) => p.catalog?.category).filter(Boolean));
    const services = view.services || [];
    if (!cats.has("cybersecurity") && !services.some((s: any) => s.service_type === "security")) {
      ops.push({ title: "Cross-sell: Cybersecurity", hint: "No security package on file — pitch SOC + Endpoint bundle." });
    }
    if (!cats.has("m365")) {
      ops.push({ title: "Cross-sell: Microsoft 365", hint: "No M365 license — quote Business Standard/Premium." });
    }
    if (!services.some((s: any) => s.service_type === "backup")) {
      ops.push({ title: "Add Backup & DR", hint: "Attach cloud backup for existing servers." });
    }
    if ((view.tickets || []).filter((t: any) => t.status !== "resolved").length > 3) {
      ops.push({ title: "Managed Services upsell", hint: "High ticket volume — propose managed support retainer." });
    }
    return ops.slice(0, 5);
  }, [view]);

  if (isLoading) return <PageContainer><p className="text-sm text-muted-foreground">Loading…</p></PageContainer>;
  if (!customer || !view) return null;

  const { services, subscriptions, invoices, payments, quotes, tickets, credentials, timeline, stats, packages = [], assets = [] } = view as any;
  const customerSince = customer.created_at ? new Date(customer.created_at) : null;
  const tier = ((customer as any).tier || (stats.mrr > 2000 ? "platinum" : stats.mrr > 500 ? "gold" : stats.mrr > 100 ? "silver" : "bronze")) as string;
  const tierTone = tier === "platinum" ? "solar" : tier === "gold" ? "warning" : tier === "silver" ? "info" : "neutral";
  const contractActive = subscriptions.some((s: any) => s.status === "active");

  const enrichedSubs = (subscriptions as any[]).map((s) => ({
    ...s,
    _tier: tierOf(Number(s.amount) || 0, s.billing_cycle),
    _score: subHealthScore(s),
  }));
  const inRange = (d: string | null | undefined, from: string, to: string) => {
    if (!from && !to) return true;
    if (!d) return false;
    const t = new Date(d).getTime();
    if (from && t < new Date(from).getTime()) return false;
    if (to && t > new Date(to).getTime() + 86399999) return false;
    return true;
  };
  const visibleSubs = enrichedSubs
    .filter((s) => {
      if (svcFilters.q) {
        const q = svcFilters.q.toLowerCase();
        if (!`${s.plan_name ?? ""} ${s.description ?? ""}`.toLowerCase().includes(q)) return false;
      }
      if (svcFilters.status !== "all" && s.status !== svcFilters.status) return false;
      if (svcFilters.tier !== "all" && s._tier !== svcFilters.tier) return false;
      if (!inRange(s.started_on, svcFilters.startFrom, svcFilters.startTo)) return false;
      if (!inRange(s.next_renewal, svcFilters.renewFrom, svcFilters.renewTo)) return false;
      if (s._score < svcFilters.minHealth) return false;
      return true;
    })
    .sort((a, b) => {
      const dir = svcFilters.sortDir === "asc" ? 1 : -1;
      const k = svcFilters.sortBy;
      if (k === "health") return (a._score - b._score) * dir;
      if (k === "amount") return ((Number(a.amount) || 0) - (Number(b.amount) || 0)) * dir;
      if (k === "plan_name") return String(a.plan_name ?? "").localeCompare(String(b.plan_name ?? "")) * dir;
      const av = a[k] ? new Date(a[k]).getTime() : Number.POSITIVE_INFINITY;
      const bv = b[k] ? new Date(b[k]).getTime() : Number.POSITIVE_INFINITY;
      return (av - bv) * dir;
    });

  const exportSubsCsv = () => {
    const rows = visibleSubs.map((s) => ({
      plan_name: s.plan_name ?? "",
      description: s.description ?? "",
      status: s.status ?? "",
      tier: s._tier,
      billing_cycle: s.billing_cycle ?? "",
      started_on: s.started_on ?? "",
      next_renewal: s.next_renewal ?? "",
      amount: Number(s.amount) || 0,
      currency: s.currency ?? "USD",
      health_score: s._score,
    }));
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${customer.account_number}-services-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  };


  return (
    <PageContainer>
      {/* Sticky hero header */}
      <div className="rounded-3xl p-8 text-navy-foreground relative overflow-hidden" style={{ background: "var(--gradient-navy)" }}>
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-30 blur-3xl" style={{ background: "var(--gradient-solar)" }} />
        <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[3px] text-solar font-semibold mb-2 font-mono">{customer.account_number}</p>
            <h1 className="font-display text-4xl font-bold truncate">{customer.company_name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-navy-foreground/80 mt-2">
              <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{customer.industry || "—"}</span>
              {customer.primary_email && <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{customer.primary_email}</span>}
              {customer.primary_phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{customer.primary_phone}</span>}
              {customerSince && <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />Since {customerSince.getFullYear()}</span>}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <StatusPill tone={customer.status === "active" ? "success" : "neutral"}>{customer.status}</StatusPill>
              <StatusPill tone={tierTone as any}>Tier · {tier}</StatusPill>
              <StatusPill tone={contractActive ? "success" : "warning"}>{contractActive ? "Contract active" : "No active contract"}</StatusPill>
              {health && <StatusPill tone={health.tone}><Heart className="h-3 w-3 mr-1 inline" />Health {health.score} · {health.label}</StatusPill>}
            </div>
          </div>

          {health && (
            <div className="shrink-0 flex flex-col items-center justify-center rounded-2xl bg-white/10 border border-white/20 px-6 py-4 min-w-[160px]">
              <p className="text-[10px] uppercase tracking-widest text-navy-foreground/70">Health score</p>
              <p className="font-display text-5xl font-bold text-solar mt-1 tabular-nums">{health.score}</p>
              <p className="text-xs text-navy-foreground/80 mt-1">{health.label}</p>
            </div>
          )}
        </div>

        {/* Quick actions bar */}
        <div className="relative mt-6 flex flex-wrap gap-2">
          <Button asChild size="sm" className="text-solar-foreground border-0" style={{ background: "var(--gradient-solar)" }}>
            <Link to="/payments"><CreditCard className="h-4 w-4 mr-1.5" />Record Payment</Link>
          </Button>
          <QuickBtn to="/billing" icon={Receipt}>Invoice</QuickBtn>
          <QuickBtn to="/quotes" icon={FileCheck}>Quote</QuickBtn>
          <QuickBtn to="/catalog" icon={Plus}>Add Service</QuickBtn>
          <QuickBtn to="/tickets" icon={LifeBuoy}>Ticket</QuickBtn>
          <QuickBtn to="/assets" icon={Laptop}>Asset</QuickBtn>
          <QuickBtn to="/credentials" icon={KeyRound}>Credential</QuickBtn>
          <QuickBtn to="/communications" icon={Mail}>Log Comm</QuickBtn>
          <QuickBtn to="/reports" icon={FileText}>Report</QuickBtn>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiTile icon={DollarSign} label="Outstanding" value={money(stats.openInvoiceTotal)} tone="warning" />
        <KpiTile icon={TrendingUp} label="MRR" value={money(stats.mrr)} tone="success" />
        <KpiTile icon={Activity} label="ARR (est.)" value={money(stats.mrr * 12)} tone="info" />
        <KpiTile icon={Server} label="Active services" value={stats.activeServices} />
        <KpiTile icon={LifeBuoy} label="Open tickets" value={stats.ticketCount} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="services-mgmt">Services Mgmt</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="quotes">Quotes</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="renewals">Renewals</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="comms">Communications</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="font-display flex items-center gap-2"><FileText className="h-4 w-4 text-solar" />Profile</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <Row k="Account #" v={<span className="font-mono text-solar font-semibold">{customer.account_number}</span>} />
                <Row k="Tier" v={<StatusPill tone={tierTone as any}>{tier}</StatusPill>} />
                <Row k="Industry" v={customer.industry || "—"} />
                <Row k="Website" v={customer.website || "—"} />
                <Row k="Billing address" v={customer.billing_address || "—"} />
                <Row k="Branches" v={branches.length} />
                <Row k="Contacts" v={contacts.length} />
                <Row k="Customer since" v={customerSince ? customerSince.toLocaleDateString() : "—"} />
                <Row k="Active services" v={stats.activeServices} />
                <Row k="Assets" v={assets.length} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="font-display flex items-center gap-2"><Sparkles className="h-4 w-4 text-solar" />AI Summary</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <p>
                  <span className="font-semibold">{customer.company_name}</span> has{" "}
                  <span className="text-solar font-semibold">{stats.activeServices}</span> active services generating{" "}
                  <span className="text-solar font-semibold">{money(stats.mrr)}</span> MRR.
                </p>
                <p>
                  Outstanding balance: <span className={stats.openInvoiceTotal > 0 ? "text-destructive font-semibold" : "font-semibold"}>{money(stats.openInvoiceTotal)}</span>.{" "}
                  {renewals.length > 0 && <>Next renewal: <span className="font-semibold">{renewals[0].label}</span> in {renewals[0].daysLeft} days.</>}
                </p>
                {opportunities[0] && (
                  <p className="pt-2 border-t border-border/60 text-muted-foreground">
                    <span className="font-semibold text-foreground">Recommended:</span> {opportunities[0].title} — {opportunities[0].hint}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="font-display flex items-center gap-2"><Activity className="h-4 w-4 text-solar" />Latest activity</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {timeline.slice(0, 8).map((e: any) => (
                  <div key={e.id} className="flex items-start justify-between p-2 rounded hover:bg-muted/40">
                    <div>
                      <p className="font-medium">{e.title || e.event_type}</p>
                      {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
                {timeline.length === 0 && <p className="text-muted-foreground">No activity yet.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="font-display flex items-center gap-2"><Target className="h-4 w-4 text-solar" />Opportunities</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {opportunities.length === 0 && <p className="text-muted-foreground">No opportunities detected — fully covered account.</p>}
                {opportunities.map((o, i) => (
                  <div key={i} className="p-2 rounded border border-border">
                    <p className="font-semibold">{o.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{o.hint}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-display flex items-center gap-2"><CalendarClock className="h-4 w-4 text-solar" />Upcoming renewals (120 days)</CardTitle>
                <span className="text-xs text-muted-foreground">{renewals.length} items</span>
              </CardHeader>
              <CardContent className="p-0 divide-y">
                {renewals.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No renewals due in the next 120 days.</p>}
                {renewals.slice(0, 8).map((r, i) => (
                  <div key={i} className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{r.label} <span className="text-xs text-muted-foreground font-normal">· {r.kind}</span></p>
                      <p className="text-xs text-muted-foreground">Due {new Date(r.date).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {r.amount != null && <span className="text-sm font-mono">{money(r.amount, r.currency || "USD")}</span>}
                      <StatusPill tone={r.daysLeft < 0 ? "danger" : r.daysLeft <= 7 ? "danger" : r.daysLeft <= 30 ? "warning" : "info"}>
                        {r.daysLeft < 0 ? `${Math.abs(r.daysLeft)}d overdue` : `${r.daysLeft}d`}
                      </StatusPill>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="services" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {services.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No services yet.</p>}
            {services.map((s: any) => (
              <div key={s.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{s.service_name}</p>
                  <p className="text-xs text-muted-foreground">{s.service_type} · {s.vendor || "—"} · {s.plan || "—"}{s.renewal_date ? ` · Renews ${s.renewal_date}` : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono">{money(s.monthly_cost)}/mo</span>
                  <StatusPill tone={s.status === "active" ? "success" : "neutral"}>{s.status}</StatusPill>
                </div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="services-mgmt" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
              <CardTitle className="font-display flex items-center gap-2"><Settings2 className="h-4 w-4 text-solar" />Services Management</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{visibleSubs.length} of {subscriptions.length}</span>
                <Button size="sm" variant="outline" onClick={exportSubsCsv} disabled={visibleSubs.length === 0}>
                  <FileText className="h-3.5 w-3.5 mr-1" />Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {subscriptions.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 px-4 py-3 border-b bg-muted/20">
                  <Input placeholder="Search plan…" value={svcFilters.q} onChange={(e) => setSvcFilters({ ...svcFilters, q: e.target.value })} className="h-8 col-span-2" />
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={svcFilters.status} onChange={(e) => setSvcFilters({ ...svcFilters, status: e.target.value as any })}>
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="paused">Suspended</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={svcFilters.tier} onChange={(e) => setSvcFilters({ ...svcFilters, tier: e.target.value as any })}>
                    <option value="all">All tiers</option>
                    <option value="platinum">Platinum</option>
                    <option value="gold">Gold</option>
                    <option value="silver">Silver</option>
                    <option value="bronze">Bronze</option>
                  </select>
                  <div className="flex items-center gap-1 col-span-2">
                    <span className="text-[10px] uppercase text-muted-foreground">Start</span>
                    <Input type="date" value={svcFilters.startFrom} onChange={(e) => setSvcFilters({ ...svcFilters, startFrom: e.target.value })} className="h-8 text-xs" />
                    <Input type="date" value={svcFilters.startTo} onChange={(e) => setSvcFilters({ ...svcFilters, startTo: e.target.value })} className="h-8 text-xs" />
                  </div>
                  <div className="flex items-center gap-1 col-span-2">
                    <span className="text-[10px] uppercase text-muted-foreground">Renew</span>
                    <Input type="date" value={svcFilters.renewFrom} onChange={(e) => setSvcFilters({ ...svcFilters, renewFrom: e.target.value })} className="h-8 text-xs" />
                    <Input type="date" value={svcFilters.renewTo} onChange={(e) => setSvcFilters({ ...svcFilters, renewTo: e.target.value })} className="h-8 text-xs" />
                  </div>
                  <div className="flex items-center gap-2 col-span-2">
                    <span className="text-[10px] uppercase text-muted-foreground whitespace-nowrap">Min health {svcFilters.minHealth}</span>
                    <input type="range" min={0} max={100} step={5} value={svcFilters.minHealth} onChange={(e) => setSvcFilters({ ...svcFilters, minHealth: Number(e.target.value) })} className="w-full" />
                  </div>
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={svcFilters.sortBy} onChange={(e) => setSvcFilters({ ...svcFilters, sortBy: e.target.value as any })}>
                    <option value="next_renewal">Sort: Renews</option>
                    <option value="started_on">Sort: Started</option>
                    <option value="amount">Sort: Amount</option>
                    <option value="health">Sort: Health</option>
                    <option value="plan_name">Sort: Name</option>
                  </select>
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={svcFilters.sortDir} onChange={(e) => setSvcFilters({ ...svcFilters, sortDir: e.target.value as any })}>
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSvcFilters({ q: "", status: "all", tier: "all", startFrom: "", startTo: "", renewFrom: "", renewTo: "", minHealth: 0, sortBy: "next_renewal", sortDir: "asc" })}>Reset</Button>
                </div>
              )}
              {subscriptions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No services yet. <Link to="/subscriptions" className="text-solar font-semibold">Add one →</Link>
                </p>
              )}
              {subscriptions.length > 0 && visibleSubs.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12">No services match the current filters.</p>
              )}
              {visibleSubs.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground border-b">
                      <tr>
                        <th className="text-left px-4 py-2">Service</th>
                        <th className="text-left px-4 py-2">Tier</th>
                        <th className="text-left px-4 py-2">Cycle</th>
                        <th className="text-left px-4 py-2">Started</th>
                        <th className="text-left px-4 py-2">Renews</th>
                        <th className="text-right px-4 py-2">Amount</th>
                        <th className="text-left px-4 py-2">Health</th>
                        <th className="text-left px-4 py-2">Status</th>
                        <th className="text-right px-4 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {visibleSubs.map((s: any) => {

                        const h = subHealth(s);
                        const active = s.status === "active";
                        const suspended = s.status === "paused";
                        const cancelled = s.status === "cancelled";
                        return (
                          <tr key={s.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3">
                              <p className="font-semibold">{s.plan_name}</p>
                              {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                            </td>
                            <td className="px-4 py-3"><StatusPill tone={s._tier === "platinum" ? "solar" : s._tier === "gold" ? "warning" : s._tier === "silver" ? "info" : "neutral"}>{s._tier}</StatusPill></td>
                            <td className="px-4 py-3 capitalize">{s.billing_cycle || "—"}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{s.started_on || "—"}</td>
                            <td className="px-4 py-3 text-xs">{s.next_renewal || "—"}</td>
                            <td className="px-4 py-3 text-right font-mono">{money(s.amount, s.currency)}</td>
                            <td className="px-4 py-3"><StatusPill tone={h.tone}>{h.label} · {s._score}</StatusPill></td>

                            <td className="px-4 py-3"><StatusPill tone={active ? "success" : suspended ? "warning" : cancelled ? "danger" : "neutral"}>{s.status}</StatusPill></td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="outline" onClick={() => invoiceFromSub.mutate(s.id)} disabled={invoiceFromSub.isPending || cancelled}>
                                  <Receipt className="h-3.5 w-3.5 mr-1" />Invoice
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => subAction.mutate({ subscription_id: s.id, action: "renew" })} disabled={subAction.isPending || cancelled}>
                                  <RefreshCw className="h-3.5 w-3.5 mr-1" />Renew
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => { setEditForm({ plan_name: s.plan_name, description: s.description || "", amount: Number(s.amount) || 0, billing_cycle: s.billing_cycle || "monthly" }); setEditSub({ sub: s, mode: "upgrade" }); }}>
                                      <ArrowUpCircle className="h-4 w-4 mr-2 text-success" />Upgrade
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setEditForm({ plan_name: s.plan_name, description: s.description || "", amount: Number(s.amount) || 0, billing_cycle: s.billing_cycle || "monthly" }); setEditSub({ sub: s, mode: "downgrade" }); }}>
                                      <ArrowDownCircle className="h-4 w-4 mr-2 text-warning" />Downgrade
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {suspended ? (
                                      <DropdownMenuItem onClick={() => subAction.mutate({ subscription_id: s.id, action: "resume" })}>
                                        <PlayCircle className="h-4 w-4 mr-2 text-success" />Resume
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem onClick={() => subAction.mutate({ subscription_id: s.id, action: "suspend" })} disabled={cancelled}>
                                        <PauseCircle className="h-4 w-4 mr-2 text-warning" />Suspend
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      onClick={() => { if (confirm(`Cancel subscription "${s.plan_name}"?`)) subAction.mutate({ subscription_id: s.id, action: "cancel" }); }}
                                      disabled={cancelled}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <XCircle className="h-4 w-4 mr-2" />Cancel
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={!!editSub} onOpenChange={(o) => !o && setEditSub(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="capitalize flex items-center gap-2">
                  {editSub?.mode === "upgrade" ? <ArrowUpCircle className="h-4 w-4 text-success" /> : <ArrowDownCircle className="h-4 w-4 text-warning" />}
                  {editSub?.mode} — {editSub?.sub?.plan_name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1"><Label>Plan name</Label><Input value={editForm.plan_name} onChange={(e) => setEditForm({ ...editForm, plan_name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Description</Label><Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Amount</Label><Input type="number" step="0.01" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: Number(e.target.value) })} /></div>
                  <div className="space-y-1"><Label>Billing cycle</Label>
                    <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={editForm.billing_cycle} onChange={(e) => setEditForm({ ...editForm, billing_cycle: e.target.value })}>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditSub(null)}>Cancel</Button>
                <Button
                  className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}
                  onClick={() => {
                    if (!editSub) return;
                    subAction.mutate({
                      subscription_id: editSub.sub.id,
                      action: editSub.mode,
                      plan_name: editForm.plan_name,
                      description: editForm.description,
                      amount: editForm.amount,
                      billing_cycle: editForm.billing_cycle,
                    });
                    setEditSub(null);
                  }}
                >Apply {editSub?.mode}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>



        <TabsContent value="packages" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {packages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">
                No packages assigned yet. Assign from the <Link to="/catalog" className="text-solar underline">catalog</Link> or during onboarding.
              </p>
            )}
            {packages.map((p: any) => {
              const cat = p.catalog || {};
              const line = Number(p.quantity || 1) * Number(p.unit_price || 0);
              return (
                <div key={p.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-solar bg-solar/10 px-2 py-0.5 rounded">{cat.code || "—"}</span>
                      <span className="font-semibold truncate">{cat.name || "Package"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">{cat.category || "—"} · {cat.billing_cycle || "monthly"} · qty {p.quantity}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-mono">{money(line, cat.currency || "USD")}</span>
                    <StatusPill tone={p.status === "active" ? "success" : "neutral"}>{p.status}</StatusPill>
                  </div>
                </div>
              );
            })}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {subscriptions.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No subscriptions.</p>}
            {subscriptions.map((s: any) => (
              <div key={s.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{s.plan_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.description || "—"} · {s.billing_cycle} · Renews {s.next_renewal || "—"}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-mono">{money(s.amount, s.currency)}</span>
                  <StatusPill tone={s.status === "active" ? "success" : "neutral"}>{s.status}</StatusPill>
                  <Button size="sm" variant="outline" onClick={() => invoiceFromSub.mutate(s.id)} disabled={invoiceFromSub.isPending}>
                    <Receipt className="h-3.5 w-3.5 mr-1" />Invoice
                  </Button>
                </div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {invoices.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No invoices yet.</p>}
            {invoices.map((i: any) => (
              <Link key={i.id} to="/invoices/$id" params={{ id: i.id }} className="p-4 flex items-center justify-between hover:bg-muted/30">
                <div>
                  <p className="font-mono text-sm font-semibold">{i.invoice_number}</p>
                  <p className="text-xs text-muted-foreground">Issued {i.issue_date} · Due {i.due_date || "—"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono">{money(i.total, i.currency)}</span>
                  <StatusPill tone={i.status === "paid" ? "success" : i.status === "overdue" ? "danger" : "info"}>{i.status}</StatusPill>
                </div>
              </Link>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {payments.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No payments recorded.</p>}
            {payments.map((p: any) => (
              <div key={p.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-semibold">{p.receipt_number || "—"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(p.paid_at).toLocaleString()} · {p.method} · {p.reference || "no ref"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono">{money(p.amount, p.currency)}</span>
                  <StatusPill tone={p.reconciliation_status === "matched" ? "success" : p.reconciliation_status === "partial" ? "info" : "neutral"}>
                    {p.reconciliation_status || p.status}
                  </StatusPill>
                </div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="quotes" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {quotes.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No quotes yet.</p>}
            {quotes.map((q: any) => (
              <div key={q.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-semibold">{q.quote_number}</p>
                  <p className="text-xs text-muted-foreground">{q.title || "—"} · {new Date(q.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono">{money(q.total, q.currency)}</span>
                  <StatusPill tone={q.status === "accepted" ? "success" : "neutral"}>{q.status}</StatusPill>
                </div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="assets" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {assets.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">
                No assets assigned. <Link to="/assets" className="text-solar font-semibold">Add asset →</Link>
              </p>
            )}
            {assets.map((a: any) => (
              <Link key={a.id} to="/assets/$id" params={{ id: a.id }} className="p-4 flex items-center justify-between hover:bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-info/15 text-info flex items-center justify-center"><Laptop className="h-4 w-4" /></div>
                  <div>
                    <p className="font-semibold">{a.name || a.asset_tag}</p>
                    <p className="text-xs text-muted-foreground">{a.asset_tag} · SN {a.serial_number || "—"}</p>
                  </div>
                </div>
                <StatusPill tone={a.status === "active" || a.status === "deployed" ? "success" : "neutral"}>{a.status}</StatusPill>
              </Link>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="tickets" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {tickets.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No tickets for this customer.</p>}
            {tickets.map((t: any) => (
              <Link key={t.id} to="/tickets/$id" params={{ id: t.id }} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                <div><p className="font-semibold"><span className="font-mono text-xs text-muted-foreground mr-2">{t.ticket_number}</span>{t.subject}</p><p className="text-xs text-muted-foreground mt-0.5">{new Date(t.created_at).toLocaleString()}</p></div>
                <div className="flex gap-2"><StatusPill tone={t.priority === "critical" ? "danger" : "info"}>{t.priority}</StatusPill><StatusPill tone="neutral">{t.status}</StatusPill></div>
              </Link>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="renewals" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {renewals.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No upcoming renewals in the next 120 days.</p>}
            {renewals.map((r, i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-solar/15 text-solar flex items-center justify-center"><CalendarClock className="h-4 w-4" /></div>
                  <div>
                    <p className="font-semibold">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.kind} · Due {new Date(r.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {r.amount != null && <span className="text-sm font-mono">{money(r.amount, r.currency || "USD")}</span>}
                  <StatusPill tone={r.daysLeft < 0 ? "danger" : r.daysLeft <= 7 ? "danger" : r.daysLeft <= 30 ? "warning" : "info"}>
                    {r.daysLeft < 0 ? `${Math.abs(r.daysLeft)}d overdue` : `${r.daysLeft}d left`}
                  </StatusPill>
                </div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="contacts" className="mt-4">
          <Card><CardContent className="p-6 space-y-4">
            <form onSubmit={(e) => { e.preventDefault(); if (!contactForm.name) return; addContact.mutate(); }} className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <Input placeholder="Name *" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} required />
              <Input placeholder="Role" value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} />
              <Input placeholder="Email" type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
              <Input placeholder="Phone" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
              <Button type="submit" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1" />Add</Button>
            </form>
            <div className="divide-y">
              {contacts.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No contacts yet.</p>}
              {contacts.map((c: any) => (
                <div key={c.id} className="py-3 flex items-center justify-between">
                  <div><p className="font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">{c.role || "—"} · {c.email || "—"} · {c.phone || "—"}</p></div>
                  <StatusPill tone="neutral">{c.contact_type}</StatusPill>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="credentials" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {credentials.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No credentials linked yet. <Link to="/credentials" className="text-solar font-semibold">Add one →</Link></p>}
            {credentials.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between p-4">
                <div><p className="font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">{c.credential_type}{c.username ? ` · ${c.username}` : ""}</p></div>
                <span className="text-xs text-muted-foreground">{c.expires_at ? `Expires ${new Date(c.expires_at).toLocaleDateString()}` : "No expiry"}</span>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="comms" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {communications.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">
                No communications logged yet. <Link to="/communications" className="text-solar font-semibold">Log one →</Link>
              </p>
            )}
            {communications.map((c: any) => (
              <div key={c.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusPill tone="info">{c.type || c.channel || "note"}</StatusPill>
                    <p className="font-semibold">{c.subject || c.title || "—"}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{c.occurred_at ? new Date(c.occurred_at).toLocaleString() : new Date(c.created_at).toLocaleString()}</span>
                </div>
                {c.body && <p className="text-sm text-muted-foreground mt-2">{c.body}</p>}
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {timeline.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No timeline events.</p>}
            {timeline.map((e: any) => (
              <div key={e.id} className="p-4">
                <div className="flex justify-between">
                  <p className="font-semibold">{e.title || e.event_type}</p>
                  <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                </div>
                {e.description && <p className="text-sm text-muted-foreground mt-1">{e.description}</p>}
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card><CardContent className="p-6 space-y-4">
            <form onSubmit={(e) => { e.preventDefault(); if (noteBody.trim()) addNote.mutate(); }} className="space-y-2">
              <Label>Add note</Label>
              <Textarea rows={3} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Quick note about this customer…" />
              <Button type="submit" disabled={addNote.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>Save note</Button>
            </form>
            <div className="space-y-3">
              {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
              {notes.map((n: any) => (
                <div key={n.id} className="p-3 rounded-md border border-border">
                  <p className="text-sm">{n.body}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function QuickBtn({ to, icon: Icon, children }: { to: string; icon: any; children: React.ReactNode }) {
  return (
    <Button asChild size="sm" variant="outline" className="bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground">
      <Link to={to as any}><Icon className="h-4 w-4 mr-1.5" />{children}</Link>
    </Button>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>;
}
function KpiTile({ icon: Icon, label, value, tone = "info" }: { icon: any; label: string; value: number | string; tone?: "info" | "success" | "warning" | "danger" }) {
  const toneMap: Record<string, string> = {
    info: "bg-info/15 text-info",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-[oklch(0.45_0.13_75)]",
    danger: "bg-destructive/15 text-destructive",
  };
  return (
    <Card><CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div><p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p><p className="font-display text-2xl font-bold mt-2 tabular-nums">{value}</p></div>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${toneMap[tone]}`}><Icon className="h-4 w-4" /></div>
      </div>
    </CardContent></Card>
  );
}
