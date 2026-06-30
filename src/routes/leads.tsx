import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/leads")({
  head: () => ({ meta: [{ title: "Leads — RoyEno CRM" }, { name: "description", content: "Track and qualify incoming solar leads." }] }),
  component: LeadsPage,
});

type Lead = {
  id: string; user_id: string; name: string; phone: string | null; email: string | null;
  city: string | null; source: string | null; system_type: string | null; stage: string;
  owner: string | null; notes: string | null; value: number; created_at: string;
};

const STAGES = ["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
const SOURCES = ["Website", "Referral", "Walk-in", "Facebook", "Google Ads", "Cold Call", "Other"];
const stageTone: Record<string, "info" | "warning" | "solar" | "success" | "danger" | "neutral"> = {
  New: "info", Qualified: "warning", Proposal: "solar", Negotiation: "warning", Won: "success", Lost: "danger",
};

function LeadsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Lead | null>(null);
  const [open, setOpen] = useState(false);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (form: Partial<Lead>) => {
      if (!user) throw new Error("Not signed in");
      const payload = { ...form, user_id: user.id, value: Number(form.value || 0) };
      if (form.id) {
        const { error } = await supabase.from("leads").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("leads").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setOpen(false); setEditing(null); toast.success("Lead saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("leads").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); toast.success("Lead removed"); },
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase.from("leads").update({ stage }).eq("id", id); if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    return !q || l.name.toLowerCase().includes(q) || l.phone?.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q);
  });

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Sales" title="Leads"
        description="Capture, qualify, and route every solar enquiry from first contact to closed deal."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button data-tour="add-lead" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                <Plus className="h-4 w-4 mr-1.5" />Add Lead
              </Button>
            </DialogTrigger>
            <LeadForm key={editing?.id ?? "new"} initial={editing} onSubmit={(d) => upsert.mutate(d)} busy={upsert.isPending} />
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {STAGES.map((s) => (
          <Card key={s}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">{s}</p>
            <p className="font-display text-2xl font-bold mt-1">{leads.filter((l) => l.stage === s).length}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card><CardContent className="p-0">
        <Tabs defaultValue="list">
          <div className="flex items-center justify-between p-4 border-b gap-3">
            <TabsList><TabsTrigger value="list">List</TabsTrigger><TabsTrigger value="kanban">Kanban</TabsTrigger></TabsList>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search leads…" className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <TabsContent value="list" className="m-0">
            {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
              : leads.length === 0 ? <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} />
              : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Lead</TableHead><TableHead>System</TableHead><TableHead>Stage</TableHead>
                  <TableHead>Source</TableHead><TableHead>Owner</TableHead>
                  <TableHead className="text-right">Value</TableHead><TableHead className="w-[100px]" />
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9"><AvatarFallback className="bg-navy/10 text-navy text-xs font-semibold">{l.name.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                          <div><p className="font-semibold text-sm">{l.name}</p><p className="text-xs text-muted-foreground">{l.city ?? "—"} · {l.phone ?? "—"}</p></div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{l.system_type ?? "—"}</TableCell>
                      <TableCell>
                        <Select value={l.stage} onValueChange={(v) => updateStage.mutate({ id: l.id, stage: v })}>
                          <SelectTrigger className="h-8 w-36"><StatusPill tone={stageTone[l.stage] ?? "info"}>{l.stage}</StatusPill></SelectTrigger>
                          <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{l.source ?? "—"}</TableCell>
                      <TableCell className="text-sm">{l.owner ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold text-solar">${Number(l.value).toLocaleString()}</TableCell>
                      <TableCell><div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(l); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete {l.name}?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate(l.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
          <TabsContent value="kanban" className="m-0 p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {STAGES.map((s) => (
                <div key={s} className="bg-muted/40 rounded-xl p-3 min-h-[300px]">
                  <div className="flex items-center justify-between mb-3"><span className="text-sm font-semibold">{s}</span><span className="text-xs text-muted-foreground">{leads.filter(l => l.stage === s).length}</span></div>
                  <div className="space-y-2">
                    {leads.filter(l => l.stage === s).map(l => (
                      <div key={l.id} className="bg-card rounded-lg p-3 border hover:border-solar/40 cursor-pointer" onClick={() => { setEditing(l); setOpen(true); }}>
                        <p className="font-semibold text-sm truncate">{l.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{l.system_type ?? "—"}</p>
                        <p className="text-sm font-bold text-solar mt-2">${Number(l.value).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent></Card>
    </PageContainer>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="p-12 text-center">
      <p className="text-sm text-muted-foreground mb-4">No leads yet — add your first one to get started.</p>
      <Button onClick={onAdd} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1.5" />Add Lead</Button>
    </div>
  );
}

function LeadForm({ initial, onSubmit, busy }: { initial: Lead | null; onSubmit: (d: Partial<Lead>) => void; busy: boolean }) {
  const [form, setForm] = useState<Partial<Lead>>(initial ?? { stage: "New", value: 0 });
  const set = <K extends keyof Lead>(k: K, v: any) => setForm(f => ({ ...f, [k]: v }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) return toast.error("Lead name required");
    onSubmit({ ...form, ...(initial ? { id: initial.id } : {}) });
  };
  return (
    <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{initial ? "Edit Lead" : "Add New Lead"}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2"><Label>Name *</Label><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} required /></div>
          <div className="space-y-2"><Label>Phone</Label><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></div>
          <div className="space-y-2"><Label>City</Label><Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} /></div>
          <div className="space-y-2"><Label>System Type</Label><Input value={form.system_type ?? ""} onChange={(e) => set("system_type", e.target.value)} placeholder="e.g. 8kW Hybrid" /></div>
          <div className="space-y-2"><Label>Stage</Label>
            <Select value={form.stage ?? "New"} onValueChange={(v) => set("stage", v)}><SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-2"><Label>Source</Label>
            <Select value={form.source ?? ""} onValueChange={(v) => set("source", v)}><SelectTrigger><SelectValue placeholder="Select…"/></SelectTrigger>
              <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-2"><Label>Owner</Label><Input value={form.owner ?? ""} onChange={(e) => set("owner", e.target.value)} placeholder="Assigned to…" /></div>
          <div className="space-y-2"><Label>Estimated Value (USD)</Label><Input type="number" min="0" value={form.value ?? 0} onChange={(e) => set("value", Number(e.target.value))} /></div>
          <div className="space-y-2 col-span-2"><Label>Notes</Label><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <DialogFooter><Button type="submit" disabled={busy} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{busy ? "Saving…" : initial ? "Save changes" : "Add lead"}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
