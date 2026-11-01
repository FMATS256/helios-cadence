import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUSES = ["open", "in_progress", "pending", "resolved", "closed"];
const TECH_ROLES = ["technical_support", "noc", "cyber_security", "cloud_engineer", "operations_manager"];

export function TicketWorkbench() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState("active");
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");

  const { data: tickets = [] } = useQuery({
    queryKey: ["noc-workbench", filter],
    queryFn: async () => {
      let r = supabase.from("tickets").select("id,ticket_number,subject,status,priority,assigned_to,created_at,sla_due_at,customers(company_name)").is("archived_at", null).order("created_at", { ascending: false }).limit(300);
      if (filter === "active") r = r.not("status", "in", "(resolved,closed)");
      return (await r).data ?? [];
    },
  });
  const { data: engineers = [] } = useQuery({
    queryKey: ["noc-engineers"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id,role").in("role", TECH_ROLES as any);
      const ids = [...new Set((roles ?? []).map((r: any) => r.user_id))];
      if (!ids.length) return [];
      return (await supabase.from("profiles").select("id,full_name,email").in("id", ids)).data ?? [];
    },
  });
  const { data: notes = [] } = useQuery({
    queryKey: ["noc-ticket-notes", sel],
    enabled: !!sel,
    queryFn: async () => (await supabase.from("ticket_messages").select("id,body,created_at,author_id,is_internal").eq("ticket_id", sel!).order("created_at", { ascending: false })).data ?? [],
  });

  const refresh = () => ["noc-workbench", "noc-telemetry", "noc-overview"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const update = useMutation({
    mutationFn: async (p: { id: string; patch: any }) => {
      const patch = { ...p.patch };
      if (patch.status) patch.resolved_at = ["resolved", "closed"].includes(patch.status) ? new Date().toISOString() : null;
      const { error } = await supabase.from("tickets").update(patch).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Ticket updated"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });
  const addNote = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("ticket_messages").insert({ ticket_id: sel!, body: note.trim(), author_id: u.user?.id, is_internal: true });
      if (error) throw error;
    },
    onSuccess: () => { setNote(""); qc.invalidateQueries({ queryKey: ["noc-ticket-notes", sel] }); toast.success("Note added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const name = (id?: string | null) => { const e: any = engineers.find((x: any) => x.id === id); return e?.full_name || e?.email || "—"; };
  const rows = tickets.filter((t: any) => !q || `${t.ticket_number} ${t.subject} ${t.customers?.company_name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const cur: any = tickets.find((t: any) => t.id === sel);
  const counts = STATUSES.map((s) => [s, tickets.filter((t: any) => t.status === s).length] as const);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {counts.map(([s, n]) => <Badge key={s} variant="outline">{s.replace("_", " ")}: {n}</Badge>)}
        <Badge variant="outline">unassigned: {tickets.filter((t: any) => !t.assigned_to).length}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search tickets…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="all">All</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card><CardContent className="p-0 divide-y max-h-[640px] overflow-y-auto">
          {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">No tickets.</p>}
          {rows.map((t: any) => (
            <button key={t.id} onClick={() => setSel(t.id)} className={`w-full text-left p-3 hover:bg-muted/50 ${sel === t.id ? "bg-muted" : ""}`}>
              <div className="flex justify-between gap-2 text-sm"><span className="font-medium">{t.ticket_number} · {t.subject}</span><Badge variant={t.priority === "critical" || t.priority === "high" ? "destructive" : "secondary"}>{t.priority}</Badge></div>
              <div className="text-xs text-muted-foreground mt-1">{t.customers?.company_name ?? "—"} · {t.status} · {name(t.assigned_to)}</div>
            </button>
          ))}
        </CardContent></Card>
        <Card><CardContent className="p-4 space-y-3">
          {!cur ? <p className="text-sm text-muted-foreground">Select a ticket to work on it.</p> : (<>
            <div><div className="font-semibold">{cur.ticket_number}</div><div className="text-sm">{cur.subject}</div></div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={cur.status} onValueChange={(v) => update.mutate({ id: cur.id, patch: { status: v } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={cur.priority} onValueChange={(v) => update.mutate({ id: cur.id, patch: { priority: v } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["low", "medium", "high", "critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Select value={cur.assigned_to ?? "none"} onValueChange={(v) => update.mutate({ id: cur.id, patch: { assigned_to: v === "none" ? null : v } })}>
              <SelectTrigger><SelectValue placeholder="Assign engineer" /></SelectTrigger>
              <SelectContent><SelectItem value="none">Unassigned</SelectItem>{engineers.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>)}</SelectContent>
            </Select>
            <Textarea placeholder="Internal engineer note…" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            <Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Add note</Button>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {notes.map((n: any) => (
                <div key={n.id} className="border p-2 text-sm"><div className="text-xs text-muted-foreground">{name(n.author_id)} · {new Date(n.created_at).toLocaleString()}{n.is_internal ? " · internal" : ""}</div><div className="whitespace-pre-wrap">{n.body}</div></div>
              ))}
            </div>
          </>)}
        </CardContent></Card>
      </div>
    </div>
  );
}
