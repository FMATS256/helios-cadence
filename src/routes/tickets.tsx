import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { StatChipRow } from "@/components/enterprise";
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
import { createTicket, getSupportQueue } from "@/lib/support.functions";
import { listAssignableStaff } from "@/lib/client-actions.functions";

export const Route = createFileRoute("/tickets")({
  head: () => ({
    meta: [
      { title: "Support Desk — IMT Operations" },
      { name: "description", content: "Technician queues, SLA tracking and customer notifications for every IMT support ticket." },
      { property: "og:title", content: "Support Desk — IMT Operations" },
      { property: "og:description", content: "Technician queues, SLA tracking and customer notifications for every IMT support ticket." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TicketsPage,
});

const PRIORITIES = ["low", "normal", "high", "critical"] as const;
const LANES = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "waiting_customer", label: "Waiting Customer" },
  { key: "resolved", label: "Resolved" },
] as const;

function TicketsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"all" | "mine" | "unassigned">("all");
  const [lane, setLane] = useState<string>("all");
  const [form, setForm] = useState({ customer_id: "", subject: "", description: "", priority: "normal", category: "", assigned_to: "" });

  const queueFn = useServerFn(getSupportQueue);
  const createFn = useServerFn(createTicket);
  const staffFn = useServerFn(listAssignableStaff);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-min"],
    queryFn: async () => (await supabase.from("customers").select("id,account_number,company_name").is("archived_at", null).order("company_name")).data ?? [],
  });

  const { data: staff = [] } = useQuery({ queryKey: ["assignable-staff"], queryFn: () => staffFn({}) as any });

  const { data: queue, isLoading } = useQuery({
    queryKey: ["support-queue", scope],
    queryFn: () => queueFn({ data: { scope } }),
  });

  const tickets: any[] = queue?.tickets ?? [];
  const stats = queue?.stats;

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          customer_id: form.customer_id,
          subject: form.subject,
          description: form.description,
          priority: form.priority,
          category: form.category,
          assigned_to: form.assigned_to || null,
        },
      }),
    onSuccess: (t: any) => {
      qc.invalidateQueries({ queryKey: ["support-queue"] });
      qc.invalidateQueries({ queryKey: ["customer360"] });
      setOpen(false);
      setForm({ customer_id: "", subject: "", description: "", priority: "normal", category: "", assigned_to: "" });
      toast.success(`Ticket ${t?.ticket_number ?? ""} created — customer notified by email`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(
    () =>
      tickets.filter((t) => {
        if (lane !== "all" && t.lane !== lane) return false;
        if (!search) return true;
        const v = search.toLowerCase();
        return (
          (t.subject || "").toLowerCase().includes(v) ||
          (t.ticket_number || "").toLowerCase().includes(v) ||
          (t.account_number || "").toLowerCase().includes(v) ||
          (t.customer_name || "").toLowerCase().includes(v) ||
          (t.assignee_name || "").toLowerCase().includes(v) ||
          (t.category || "").toLowerCase().includes(v)
        );
      }),
    [tickets, lane, search],
  );

  return (
    <PageContainer>
      <PageHeader eyebrow="Operations" title="Support Desk" description="Tickets are linked to a customer, prioritized, tracked against an SLA timer, and every change emails the customer."
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
                <div className="space-y-2"><Label>Assign to</Label>
                  <Select value={form.assigned_to || "unassigned"} onValueChange={(v) => setForm({ ...form, assigned_to: v === "unassigned" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {(staff as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.role}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Description</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <DialogFooter><Button type="submit" disabled={create.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{create.isPending ? "Creating…" : "Create ticket"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        } />

      {stats && (
        <StatChipRow
          cols={6}
          chips={[
            { label: "Open", value: stats.open, color: "#0ea5e9" },
            { label: "In Progress", value: stats.in_progress, color: "#6366f1" },
            { label: "Waiting Customer", value: stats.waiting_customer, color: "#f59e0b" },
            { label: "Overdue SLA", value: stats.overdue, color: "#dc2626" },
            { label: "Unassigned", value: stats.unassigned, color: "#64748b" },
            { label: "Resolved", value: stats.resolved, color: "#16a34a" },
          ]}
        />
      )}

      <Card><CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search ticket #, subject, M-number…" className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={scope} onValueChange={(v) => setScope(v as any)}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tickets</SelectItem>
                <SelectItem value="mine">My queue</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{filtered.length} of {tickets.length}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 px-4 py-3 border-b">
          {LANES.map((l) => (
            <Button key={l.key} size="sm" variant={lane === l.key ? "default" : "outline"} onClick={() => setLane(l.key)}>{l.label}</Button>
          ))}
        </div>
        {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          : filtered.length === 0 ? <div className="p-12 text-center text-sm text-muted-foreground">No tickets in this queue.</div>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-[100px]">Ticket #</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Assignee</TableHead>
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
                    <TableCell className="text-xs">{t.assignee_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell><StatusPill tone={t.priority === "critical" ? "danger" : t.priority === "high" ? "warning" : "info"}>{t.priority}</StatusPill></TableCell>
                    <TableCell><StatusPill tone={t.status === "resolved" || t.status === "closed" ? "success" : "neutral"}>{t.status}</StatusPill></TableCell>
                    <TableCell className="text-xs">
                      {t.sla_due_at ? (
                        <span className={t.sla_breached ? "text-destructive font-semibold" : "text-muted-foreground"}>
                          {new Date(t.sla_due_at).toLocaleString()}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent></Card>
    </PageContainer>
  );
}
