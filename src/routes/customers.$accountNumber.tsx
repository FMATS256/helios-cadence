import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { KeyRound, LifeBuoy, FileText, Users as UsersIcon, MapPin } from "lucide-react";

export const Route = createFileRoute("/customers/$accountNumber")({
  head: ({ params }) => ({ meta: [{ title: `${params.accountNumber} — Customer 360` }] }),
  component: Customer360,
  notFoundComponent: () => (
    <PageContainer><PageHeader title="Customer not found" description="That M-number doesn't exist." /></PageContainer>
  ),
});

function Customer360() {
  const { accountNumber } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", accountNumber],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("account_number", accountNumber).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

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
  const { data: tickets = [] } = useQuery({
    queryKey: ["customer-tickets", accountNumber],
    enabled: !!customer,
    queryFn: async () => (await supabase.from("tickets").select("*").eq("customer_id", customer!.id).is("archived_at", null).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: credentials = [] } = useQuery({
    queryKey: ["customer-credentials", accountNumber],
    enabled: !!customer,
    queryFn: async () => (await supabase.from("credentials").select("id,name,credential_type,username,expires_at,created_at").eq("customer_id", customer!.id).is("archived_at", null)).data ?? [],
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

  if (isLoading) return <PageContainer><p className="text-sm text-muted-foreground">Loading…</p></PageContainer>;
  if (!customer) return null;

  return (
    <PageContainer>
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
            <Button asChild variant="outline" className="bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground"><Link to="/tickets">+ Ticket</Link></Button>
            <Button asChild className="text-solar-foreground border-0" style={{ background: "var(--gradient-solar)" }}><Link to="/credentials">+ Credential</Link></Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile icon={UsersIcon} label="Contacts" value={contacts.length} />
        <KpiTile icon={LifeBuoy} label="Tickets" value={tickets.length} />
        <KpiTile icon={KeyRound} label="Credentials" value={credentials.length} />
        <KpiTile icon={MapPin} label="Branches" value={branches.length} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
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
                <Row k="Created" v={new Date(customer.created_at).toLocaleString()} />
              </CardContent>
            </Card>
            <Card><CardHeader><CardTitle className="font-display">Recent activity</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {tickets.slice(0, 5).map((t: any) => (
                  <Link key={t.id} to="/tickets/$id" params={{ id: t.id }} className="flex items-center justify-between p-2 rounded hover:bg-muted/40">
                    <span className="truncate"><span className="font-mono text-xs mr-2">{t.ticket_number}</span>{t.subject}</span>
                    <StatusPill tone="neutral">{t.status}</StatusPill>
                  </Link>
                ))}
                {tickets.length === 0 && <p className="text-muted-foreground">No tickets yet.</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="mt-4">
          <Card><CardContent className="p-6 space-y-4">
            <form onSubmit={(e) => { e.preventDefault(); if (!contactForm.name) return; addContact.mutate(); }} className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <Input placeholder="Name *" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} required />
              <Input placeholder="Role" value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} />
              <Input placeholder="Email" type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
              <Input placeholder="Phone" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
              <Button type="submit" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>Add contact</Button>
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
function KpiTile({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <Card><CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div><p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p><p className="font-display text-3xl font-bold mt-2">{value}</p></div>
        <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-solar/15 text-solar"><Icon className="h-4 w-4" /></div>
      </div>
    </CardContent></Card>
  );
}
