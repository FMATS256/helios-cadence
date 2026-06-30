import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Clock, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/tasks")({
  head: () => ({ meta: [{ title: "Tasks — RoyEno CRM" }, { name: "description", content: "Manage tasks and follow-ups." }] }),
  component: TasksPage,
});

type Task = {
  id: string; user_id: string; title: string; due_date: string | null;
  priority: string; owner: string | null; related_to: string | null;
  done: boolean; notes: string | null; created_at: string;
};

const PRIORITIES = ["Low", "Normal", "High"];

function TasksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").order("done").order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as Task[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (form: Partial<Task>) => {
      if (!user) throw new Error("Not signed in");
      const payload = { ...form, user_id: user.id };
      if (form.id) { const { error } = await supabase.from("tasks").update(payload).eq("id", form.id); if (error) throw error; }
      else { const { error } = await supabase.from("tasks").insert(payload as any); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); setOpen(false); setEditing(null); toast.success("Task saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from("tasks").update({ done }).eq("id", id); if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("tasks").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Task removed"); },
  });

  const list = (filter: (t: Task) => boolean) => {
    const filtered = tasks.filter(filter);
    if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
    if (filtered.length === 0) return <div className="p-8 text-center text-sm text-muted-foreground">No tasks here.</div>;
    return filtered.map((t) => (
      <div key={t.id} className="flex items-center gap-4 p-4 border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
        <Checkbox checked={t.done} onCheckedChange={(v) => toggle.mutate({ id: t.id, done: !!v })} className="data-[state=checked]:bg-success data-[state=checked]:border-success" />
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-sm ${t.done ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            {t.due_date && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t.due_date}</span>}
            {t.owner && <span>· {t.owner}</span>}
            {t.related_to && <span className="font-mono">· {t.related_to}</span>}
          </p>
        </div>
        <StatusPill tone={t.priority === "High" ? "danger" : t.priority === "Low" ? "neutral" : "info"}>{t.priority}</StatusPill>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(t); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Delete task?</AlertDialogTitle></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate(t.id)}>Delete</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    ));
  };

  return (
    <PageContainer>
      <PageHeader eyebrow="Workspace" title="Tasks & Activities" description="Stay on top of follow-ups, site visits, proposals, and internal deadlines."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild><Button data-tour="add-task" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1.5" />New Task</Button></DialogTrigger>
            <TaskForm key={editing?.id ?? "new"} initial={editing} onSubmit={(d) => upsert.mutate(d)} busy={upsert.isPending} />
          </Dialog>
        } />
      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="all">All ({tasks.length})</TabsTrigger>
          <TabsTrigger value="open">Open ({tasks.filter(t => !t.done).length})</TabsTrigger>
          <TabsTrigger value="done">Done ({tasks.filter(t => t.done).length})</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4"><Card><CardContent className="p-0">{list(() => true)}</CardContent></Card></TabsContent>
        <TabsContent value="open" className="mt-4"><Card><CardContent className="p-0">{list((t) => !t.done)}</CardContent></Card></TabsContent>
        <TabsContent value="done" className="mt-4"><Card><CardContent className="p-0">{list((t) => t.done)}</CardContent></Card></TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function TaskForm({ initial, onSubmit, busy }: { initial: Task | null; onSubmit: (d: Partial<Task>) => void; busy: boolean }) {
  const [form, setForm] = useState<Partial<Task>>(initial ?? { priority: "Normal", done: false });
  const set = <K extends keyof Task>(k: K, v: any) => setForm(f => ({ ...f, [k]: v }));
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!form.title?.trim()) return toast.error("Title required"); onSubmit({ ...form, ...(initial ? { id: initial.id } : {}) }); };
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{initial ? "Edit Task" : "New Task"}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2"><Label>Title *</Label><Input value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={form.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} /></div>
          <div className="space-y-2"><Label>Priority</Label>
            <Select value={form.priority ?? "Normal"} onValueChange={(v) => set("priority", v)}><SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-2"><Label>Owner</Label><Input value={form.owner ?? ""} onChange={(e) => set("owner", e.target.value)} /></div>
          <div className="space-y-2"><Label>Related To</Label><Input value={form.related_to ?? ""} onChange={(e) => set("related_to", e.target.value)} placeholder="e.g. Acme Ltd" /></div>
        </div>
        <div className="space-y-2"><Label>Notes</Label><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
        <DialogFooter><Button type="submit" disabled={busy} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{busy ? "Saving…" : initial ? "Save" : "Create task"}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
