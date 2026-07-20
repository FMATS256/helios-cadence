import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
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
import { KeyRound, LifeBuoy, FileText, CreditCard, Receipt, Server, DollarSign, TrendingUp, Plus, FileCheck } from "lucide-react";
import { getCustomer360, generateInvoiceForSubscription } from "@/lib/ops.functions";

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

  if (isLoading) return <PageContainer><p className="text-sm text-muted-foreground">Loading…</p></PageContainer>;
  if (!customer || !view) return null;

  const { services, subscriptions, invoices, payments, quotes, tickets, credentials, timeline, stats, packages = [] } = view as any;

  return (
    <PageContainer>
      {/* Sticky hero header */}
      <div className="rounded-3xl p-8 text-navy-foreground relative overflow-hidden" style={{ background: "var(--gradient-navy)" }}>
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-30 blur-3xl" style={{ background: "var(--gradient-solar)" }} />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[3px] text-solar font-semibold mb-2 font-mono">{customer.account_number}</p>
            <h1 className="font-display text-4xl font-bold">{customer.company_name}</h1>
            <p className="text-navy-foreground/70 mt-2">{customer.industry || "—"} · {customer.primary_email || "no email"} · {customer.primary_phone || "no phone"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={customer.status === "active" ? "success" : "neutral"}>{customer.status}</StatusPill>
          </div>
        </div>

        {/* Quick actions bar */}
        <div className="relative mt-6 flex flex-wrap gap-2">
          <Button asChild size="sm" className="text-solar-foreground border-0" style={{ background: "var(--gradient-solar)" }}>
            <Link to="/payments"><CreditCard className="h-4 w-4 mr-1.5" />Record Payment</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground">
            <Link to="/billing"><Receipt className="h-4 w-4 mr-1.5" />Generate Invoice</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground">
            <Link to="/quotes"><FileCheck className="h-4 w-4 mr-1.5" />New Quote</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground">
            <Link to="/tickets"><LifeBuoy className="h-4 w-4 mr-1.5" />New Ticket</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground">
            <Link to="/credentials"><KeyRound className="h-4 w-4 mr-1.5" />+ Credential</Link>
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile icon={DollarSign} label="Outstanding" value={money(stats.openInvoiceTotal)} tone="warning" />
        <KpiTile icon={TrendingUp} label="MRR" value={money(stats.mrr)} tone="success" />
        <KpiTile icon={Server} label="Active services" value={stats.activeServices} />
        <KpiTile icon={LifeBuoy} label="Open tickets" value={stats.ticketCount} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="quotes">Quotes</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card><CardHeader><CardTitle className="font-display flex items-center gap-2"><FileText className="h-4 w-4 text-solar" />Profile</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row k="Account #" v={<span className="font-mono text-solar font-semibold">{customer.account_number}</span>} />
                <Row k="Company" v={customer.company_name} />
                <Row k="Industry" v={customer.industry || "—"} />
                <Row k="Website" v={customer.website || "—"} />
                <Row k="Billing address" v={customer.billing_address || "—"} />
                <Row k="Branches" v={branches.length} />
                <Row k="Contacts" v={contacts.length} />
                <Row k="Created" v={new Date(customer.created_at).toLocaleString()} />
              </CardContent>
            </Card>
            <Card><CardHeader><CardTitle className="font-display">Latest activity</CardTitle></CardHeader>
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
          </div>
        </TabsContent>

        <TabsContent value="services" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {services.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No services yet.</p>}
            {services.map((s: any) => (
              <div key={s.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{s.service_name}</p>
                  <p className="text-xs text-muted-foreground">{s.service_type} · {s.vendor || "—"} · {s.plan || "—"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono">{money(s.monthly_cost)}/mo</span>
                  <StatusPill tone={s.status === "active" ? "success" : "neutral"}>{s.status}</StatusPill>
                </div>
              </div>
            ))}
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
