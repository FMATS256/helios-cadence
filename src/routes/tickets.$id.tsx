import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { assignTicket, postTicketMessage, updateTicket } from "@/lib/support.functions";
import { ComposeEmailDialog } from "@/components/compose-email-dialog";
import { listAssignableStaff } from "@/lib/client-actions.functions";

export const Route = createFileRoute("/tickets/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Ticket ${params.id.slice(0, 8)} — IMT Operations` },
      { name: "description", content: "Ticket conversation, SLA state, assignment and customer notifications." },
      { property: "og:title", content: "Support ticket — IMT Operations" },
      { property: "og:description", content: "Ticket conversation, SLA state, assignment and customer notifications." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TicketDetail,
});

function TicketDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);

  const postFn = useServerFn(postTicketMessage);
  const updateFn = useServerFn(updateTicket);
  const assignFn = useServerFn(assignTicket);
  const staffFn = useServerFn(listAssignableStaff);

  const { data: ticket } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => (await supabase.from("tickets").select("*").eq("id", id).maybeSingle()).data,
  });
  const { data: messages = [] } = useQuery({
    queryKey: ["ticket-messages", id],
    queryFn: async () => (await supabase.from("ticket_messages").select("*").eq("ticket_id", id).order("created_at")).data ?? [],
  });
  const { data: staff = [] } = useQuery({ queryKey: ["assignable-staff"], queryFn: () => staffFn({}) as any });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["ticket-messages", id] });
    qc.invalidateQueries({ queryKey: ["support-queue"] });
    qc.invalidateQueries({ queryKey: ["customer360"] });
  };

  const reply = useMutation({
    mutationFn: () => postFn({ data: { ticket_id: id, body, is_internal: internal } }),
    onSuccess: () => { setBody(""); refresh(); toast.success(internal ? "Internal note added" : "Reply posted and emailed to the customer"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (patch: { status?: string; priority?: string }) => updateFn({ data: { ticket_id: id, ...patch } }),
    onSuccess: () => { refresh(); toast.success("Ticket updated — customer notified"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: (assigned_to: string | null) => assignFn({ data: { ticket_id: id, assigned_to } }),
    onSuccess: () => { refresh(); toast.success("Assignment updated — technician notified"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!ticket) return <PageContainer><p className="text-sm text-muted-foreground">Loading…</p></PageContainer>;

  const breached = ticket.sla_due_at && !["resolved", "closed"].includes(ticket.status) && new Date(ticket.sla_due_at).getTime() < Date.now();

  return (
    <PageContainer>
      <PageHeader eyebrow={`Customer ${ticket.account_number}`} title={ticket.subject}
        description={<span className="font-mono">{ticket.ticket_number}</span> as any}
        actions={
          <div className="flex items-center gap-3">
            <ComposeEmailDialog accountNumber={ticket.account_number} />
            <Link to="/customers/$accountNumber" params={{ accountNumber: ticket.account_number }} className="text-sm text-solar font-semibold hover:underline">View customer →</Link>
          </div>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="font-display">Conversation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {ticket.description && (
              <div className="p-4 rounded-lg bg-muted/40">
                <p className="text-xs text-muted-foreground mb-1">Original request</p>
                <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
              </div>
            )}
            {messages.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No replies yet.</p>}
            {messages.map((m: any) => (
              <div key={m.id} className={`p-4 rounded-lg border ${m.is_internal ? "bg-warning/10 border-warning/30" : "bg-background border-border"}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold">{m.is_internal ? "Internal note" : "Reply"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p>
                </div>
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
            <form onSubmit={(e) => { e.preventDefault(); reply.mutate(); }} className="space-y-3 pt-4 border-t">
              <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type a reply (emailed to the customer) or an internal note…" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Switch checked={internal} onCheckedChange={setInternal} id="internal" /><Label htmlFor="internal">Internal note</Label></div>
                <Button type="submit" disabled={reply.isPending || !body.trim()} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{reply.isPending ? "Posting…" : "Post"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-display">Properties</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-1"><Label>Status</Label>
              <Select value={ticket.status} onValueChange={(v) => update.mutate({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["open","in_progress","waiting_customer","resolved","closed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Priority</Label>
              <Select value={ticket.priority} onValueChange={(v) => update.mutate({ priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["low","normal","high","critical"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Assigned to</Label>
              <Select value={ticket.assigned_to ?? "unassigned"} onValueChange={(v) => assign.mutate(v === "unassigned" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {(staff as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(ticket.created_at).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">SLA due</span><span className={breached ? "text-destructive font-semibold" : ""}>{ticket.sla_due_at ? new Date(ticket.sla_due_at).toLocaleString() : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span>{ticket.category || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><Link to="/customers/$accountNumber" params={{ accountNumber: ticket.account_number }} className="font-mono text-solar font-semibold hover:underline">{ticket.account_number}</Link></div>
            <div className="flex gap-2">
              <StatusPill tone={ticket.status === "resolved" || ticket.status === "closed" ? "success" : "warning"}>{ticket.status}</StatusPill>
              {breached && <StatusPill tone="danger">SLA breached</StatusPill>}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
