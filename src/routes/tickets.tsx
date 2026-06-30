import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";

export const Route = createFileRoute("/tickets")({
  head: () => ({ meta: [{ title: "Support Desk — IMT Operations" }] }),
  component: TicketsPage,
});

const PRIORITIES = ["low", "normal", "high", "critical"] as const;
const STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;

function TicketsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ customer_id: "", subject: "", description: "", priority: "normal", category: "" });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-min"],
    queryFn: async () => (await supabase.from("customers").select("id,account_number,company_name").is("archived_at", null).order("company_name")).data ?? [],
  });

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["tickets"],
    queryFn: async () => (await supabase.from("tickets").select("*").is("archived_at", null).order("created_at", { ascending: false })).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.customer_id || !form.subject.trim()) throw new Error("Customer and subject required");
      const sla = new Date(); sla.setHours(sla.getHours() + (form.priority === "critical" ? 4 : form.priority === "high" ? 8 : 24));
      const { error } = await supabase.from("tickets").insert({
        customer_id: form.customer_id, subject: form.subject, description: form.description,
        priority: form.priority, category: form.category || null, sla_due_at: sla.toISOString(), created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tickets"] }); setOpen(false); setForm({ customer_id: "", subject: "", description: "", priority: "normal", category: "" }); toast.success("Ticket created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = tickets.filter((t: any) => {
    if (!search) return true;
    const v = search.toLowerCase();
    return t.subject.toLowerCase().includes(v) || t.ticket_number.toLowerCase().includes(v) || t.account_number.toLowerCase().includes(v) || (t.category || "").toLowerCase().includes(v);
  });

  return (
    <PageContainer>
      <PageHeader eyebrow="Operations" title="Support Desk" description="Tickets are linked to a customer, prioritized, and tracked against an SLA timer."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1.5" />New ticket</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Create ticket</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
                <div className="space-y-2"><Label>Customer *</Label>
                  <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select customer…" /></SelectTrigger>
                    <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Subject *</Label><Input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Cloud, Network, Email" /></div>
                </div>
                <div className="space-y-2"><Label>Description</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <DialogFooter><Button type="submit" disabled={create.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{create.isPending ? "Creating…" : "Create ticket"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        } />

      <Card><CardContent className="p-0">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search ticket #, subject, M-number…" className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">{filtered.length} of {tickets.length}</p>
        </div>
        {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          : tickets.length === 0 ? <div className="p-12 text-center text-sm text-muted-foreground">No tickets yet.</div>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-[100px]">Ticket #</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SLA</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell><Link to="/tickets/$id" params={{ id: t.id }} className="font-mono text-solar font-semibold hover:underline">{t.ticket_number}</Link></TableCell>
                    <TableCell className="font-semibold max-w-xs truncate"><Link to="/tickets/$id" params={{ id: t.id }} className="hover:underline">{t.subject}</Link></TableCell>
                    <TableCell><Link to="/customers/$accountNumber" params={{ accountNumber: t.account_number }} className="font-mono text-xs hover:underline">{t.account_number}</Link></TableCell>
                    <TableCell><StatusPill tone={t.priority === "critical" ? "danger" : t.priority === "high" ? "warning" : "info"}>{t.priority}</StatusPill></TableCell>
                    <TableCell><StatusPill tone="neutral">{t.status}</StatusPill></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.sla_due_at ? new Date(t.sla_due_at).toLocaleString() : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent></Card>
    </PageContainer>
  );
}
