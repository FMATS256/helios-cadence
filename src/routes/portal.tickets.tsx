import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortal } from "@/hooks/use-portal";
import { StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, LifeBuoy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/tickets")({
  head: () => ({ meta: [{ title: "My Tickets — IMT Portal" }] }),
  component: PortalTickets,
});

function PortalTickets() {
  const { customer } = usePortal();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", priority: "normal", category: "general" });

  const { data: tickets = [] } = useQuery({
    queryKey: ["portal-tickets", customer?.id],
    enabled: !!customer?.id,
    queryFn: async () => (await supabase.from("tickets").select("*").eq("customer_id", customer!.id).order("created_at", { ascending: false })).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!customer?.id || !form.subject) throw new Error("Subject required");
      const { error } = await supabase.from("tickets").insert({ customer_id: customer.id, ...form, status: "open" } as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["portal-tickets"] }); setOpen(false); setForm({ subject: "", description: "", priority: "normal", category: "general" }); toast.success("Ticket submitted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">My tickets</h1>
          <p className="text-sm text-muted-foreground mt-1">Open a new request or track existing ones.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1.5" />New ticket</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Submit a support request</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
              <div className="space-y-2"><Label>Subject *</Label><Input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["low", "normal", "high", "critical"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Details</Label><Textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <DialogFooter><Button type="submit" disabled={create.isPending}>Submit</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        {tickets.length === 0 ? (
          <div className="p-12 text-center"><LifeBuoy className="h-8 w-8 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">No tickets yet.</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Subject</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Opened</TableHead></TableRow></TableHeader>
            <TableBody>
              {(tickets as any[]).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.ticket_number}</TableCell>
                  <TableCell className="font-medium">{t.subject}</TableCell>
                  <TableCell><StatusPill tone={t.priority === "critical" ? "danger" : t.priority === "high" ? "warning" : "neutral"}>{t.priority}</StatusPill></TableCell>
                  <TableCell><StatusPill tone={t.status === "closed" || t.status === "resolved" ? "success" : "info"}>{t.status}</StatusPill></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}
