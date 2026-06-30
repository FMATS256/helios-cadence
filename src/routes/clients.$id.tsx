import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageContainer, StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Phone, Mail, MapPin, ChevronLeft, Plus, Trash2, Star, Zap, Activity, Calendar } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/clients/$id")({
  head: () => ({
    meta: [
      { title: "Client — RoyEno CRM" },
      { name: "description", content: "Manage client phone numbers, systems bought, and activity history." },
    ],
  }),
  component: ClientDetail,
});

const SYSTEM_TYPES = ["Residential", "Commercial", "Industrial", "Hybrid", "Backup", "Solar Pump"];
const SYSTEM_STATUSES = ["Quoted", "Sold", "Installing", "Active", "Maintenance", "Decommissioned"];
const ACTIVITY_TYPES = ["Call", "Email", "Visit", "Quote", "Payment", "Maintenance", "Note"];
const PHONE_LABELS = ["Mobile", "WhatsApp", "Office", "Home", "Other"];

function ClientDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: client, isLoading, error } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: phones = [] } = useQuery({
    queryKey: ["client_phones", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_phones").select("*")
        .eq("client_id", id).order("is_primary", { ascending: false }).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: systems = [] } = useQuery({
    queryKey: ["client_systems", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_systems").select("*")
        .eq("client_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["client_activities", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_activities").select("*")
        .eq("client_id", id).order("occurred_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <PageContainer><p className="text-muted-foreground">Loading client…</p></PageContainer>;
  if (error) return <PageContainer><p className="text-destructive">{error.message}</p></PageContainer>;
  if (!client) return (
    <PageContainer>
      <p>Client not found.</p>
      <Button asChild variant="outline" className="mt-4"><Link to="/clients">Back to clients</Link></Button>
    </PageContainer>
  );

  const initials = client.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
  const totalSystemsValue = systems.reduce((s, x) => s + Number(x.value || 0), 0);

  return (
    <PageContainer>
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/clients"><ChevronLeft className="h-4 w-4 mr-1" />All clients</Link>
      </Button>

      <div className="rounded-3xl p-6 text-navy-foreground relative overflow-hidden" style={{ background: "var(--gradient-navy)" }}>
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <Avatar className="h-20 w-20 border-4 border-solar/30">
            <AvatarFallback className="bg-solar text-solar-foreground font-display text-2xl font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[3px] text-solar font-semibold">Client</p>
            <h1 className="font-display text-3xl font-bold mt-1">{client.name}</h1>
            {client.contact_person && <p className="text-navy-foreground/70 mt-1">{client.contact_person}</p>}
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-navy-foreground/80">
              {client.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{client.email}</span>}
              {client.city && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{client.city}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusPill tone="solar">{client.status}</StatusPill>
            <p className="font-display text-2xl font-bold text-solar">${Number(client.value || 0).toLocaleString()}</p>
            <p className="text-xs text-navy-foreground/60">{systems.length} system{systems.length === 1 ? "" : "s"} · ${totalSystemsValue.toLocaleString()} installed</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="phones">
        <TabsList>
          <TabsTrigger value="phones"><Phone className="h-3.5 w-3.5 mr-1.5" />Phone Numbers ({phones.length})</TabsTrigger>
          <TabsTrigger value="systems"><Zap className="h-3.5 w-3.5 mr-1.5" />Systems ({systems.length})</TabsTrigger>
          <TabsTrigger value="activity"><Activity className="h-3.5 w-3.5 mr-1.5" />Activity ({activities.length})</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
        </TabsList>

        <TabsContent value="phones" className="mt-4">
          <PhonesPanel clientId={id} userId={user?.id} phones={phones} qc={qc} />
        </TabsContent>

        <TabsContent value="systems" className="mt-4">
          <SystemsPanel clientId={id} userId={user?.id} systems={systems} qc={qc} />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <ActivityPanel clientId={id} userId={user?.id} activities={activities} qc={qc} />
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="font-display">Site information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-6">
              <Field label="Address" value={client.address} />
              <Field label="GPS" value={client.gps} />
              <Field label="System type" value={client.system_type} />
              <Field label="System size" value={client.system_size} />
              <Field label="Inverter" value={client.inverter} />
              <Field label="Battery" value={client.battery} />
              <Field label="Panels" value={client.panels} />
              <Field label="Warranty" value={client.warranty} />
              <Field label="Next action" value={client.next_action} />
              <Field label="Installation date" value={client.installation_date} />
              {client.notes && <div className="col-span-2"><Field label="Notes" value={client.notes} /></div>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="font-medium mt-1">{value || "—"}</p>
    </div>
  );
}

/* ─── Phones ──────────────────────────────────────────── */
function PhonesPanel({ clientId, userId, phones, qc }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: "Mobile", number: "", is_primary: false });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.number.trim()) throw new Error("Phone number required");
      if (!userId) throw new Error("Not signed in");
      if (form.is_primary) {
        await supabase.from("client_phones").update({ is_primary: false }).eq("client_id", clientId);
      }
      const { error } = await supabase.from("client_phones").insert({ ...form, client_id: clientId, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_phones", clientId] });
      setOpen(false); setForm({ label: "Mobile", number: "", is_primary: false });
      toast.success("Phone added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (pid: string) => {
      const { error } = await supabase.from("client_phones").delete().eq("id", pid);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["client_phones", clientId] }); toast.success("Phone removed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPrimary = useMutation({
    mutationFn: async (pid: string) => {
      await supabase.from("client_phones").update({ is_primary: false }).eq("client_id", clientId);
      const { error } = await supabase.from("client_phones").update({ is_primary: true }).eq("id", pid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_phones", clientId] }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-display">Phone numbers</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              <Plus className="h-4 w-4 mr-1" />Add phone
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add phone number</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Label</Label>
                <Select value={form.label} onValueChange={(v) => setForm((f) => ({ ...f, label: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PHONE_LABELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Number</Label>
                <Input value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} placeholder="+263 ..." />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))} />
                Set as primary
              </label>
            </div>
            <DialogFooter>
              <Button onClick={() => add.mutate()} disabled={add.isPending}>{add.isPending ? "Adding…" : "Add"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2">
        {phones.length === 0 && <p className="text-sm text-muted-foreground">No phone numbers yet.</p>}
        {phones.map((p: any) => (
          <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-solar/15 text-solar flex items-center justify-center"><Phone className="h-4 w-4" /></div>
              <div>
                <a href={`tel:${p.number}`} className="font-semibold hover:text-solar">{p.number}</a>
                <p className="text-xs text-muted-foreground">{p.label}{p.is_primary && " · Primary"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!p.is_primary && (
                <Button variant="ghost" size="sm" onClick={() => setPrimary.mutate(p.id)}>
                  <Star className="h-3.5 w-3.5 mr-1" />Make primary
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove.mutate(p.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ─── Systems ─────────────────────────────────────────── */
function SystemsPanel({ clientId, userId, systems, qc }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: "", system_type: "", system_size: "", inverter: "", battery: "", panels: "", value: 0, installed_date: "", warranty: "", status: "Sold", notes: "" });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("System name required");
      if (!userId) throw new Error("Not signed in");
      const payload = {
        ...form,
        value: Number(form.value || 0),
        installed_date: form.installed_date || null,
        client_id: clientId,
        user_id: userId,
      };
      const { error } = await supabase.from("client_systems").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_systems", clientId] });
      setOpen(false);
      setForm({ name: "", system_type: "", system_size: "", inverter: "", battery: "", panels: "", value: 0, installed_date: "", warranty: "", status: "Sold", notes: "" });
      toast.success("System added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (sid: string) => {
      const { error } = await supabase.from("client_systems").delete().eq("id", sid);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["client_systems", clientId] }); toast.success("System removed"); },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-display">Systems bought</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              <Plus className="h-4 w-4 mr-1" />Add system
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add system</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Main house 8kW Hybrid" /></div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.system_type} onValueChange={(v) => setForm({ ...form, system_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{SYSTEM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Size</Label><Input value={form.system_size} onChange={(e) => setForm({ ...form, system_size: e.target.value })} placeholder="8kW" /></div>
              <div className="space-y-2"><Label>Inverter</Label><Input value={form.inverter} onChange={(e) => setForm({ ...form, inverter: e.target.value })} /></div>
              <div className="space-y-2"><Label>Battery</Label><Input value={form.battery} onChange={(e) => setForm({ ...form, battery: e.target.value })} /></div>
              <div className="space-y-2 col-span-2"><Label>Panels</Label><Input value={form.panels} onChange={(e) => setForm({ ...form, panels: e.target.value })} /></div>
              <div className="space-y-2"><Label>Value (USD)</Label><Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label>Installed date</Label><Input type="date" value={form.installed_date} onChange={(e) => setForm({ ...form, installed_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>Warranty</Label><Input value={form.warranty} onChange={(e) => setForm({ ...form, warranty: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SYSTEM_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Add system"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-3">
        {systems.length === 0 && <p className="text-sm text-muted-foreground">No systems recorded yet.</p>}
        {systems.map((s: any) => (
          <div key={s.id} className="p-4 rounded-lg border bg-card">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{s.name}</p>
                  <StatusPill tone={s.status === "Active" ? "success" : s.status === "Maintenance" ? "warning" : "info"}>{s.status}</StatusPill>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {[s.system_size, s.system_type].filter(Boolean).join(" · ")}
                  {s.installed_date && ` · Installed ${s.installed_date}`}
                </p>
                <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                  {s.inverter && <div><span className="text-muted-foreground">Inverter: </span>{s.inverter}</div>}
                  {s.battery && <div><span className="text-muted-foreground">Battery: </span>{s.battery}</div>}
                  {s.panels && <div><span className="text-muted-foreground">Panels: </span>{s.panels}</div>}
                  {s.warranty && <div><span className="text-muted-foreground">Warranty: </span>{s.warranty}</div>}
                </div>
                {s.notes && <p className="text-xs text-muted-foreground mt-2">{s.notes}</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <p className="font-display font-bold text-solar">${Number(s.value).toLocaleString()}</p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Remove system?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate(s.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ─── Activity ────────────────────────────────────────── */
function ActivityPanel({ clientId, userId, activities, qc }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ activity_type: "Call", title: "", notes: "", occurred_at: new Date().toISOString().slice(0, 16) });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title required");
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase.from("client_activities").insert({
        ...form,
        occurred_at: new Date(form.occurred_at).toISOString(),
        client_id: clientId,
        user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_activities", clientId] });
      setOpen(false);
      setForm({ activity_type: "Call", title: "", notes: "", occurred_at: new Date().toISOString().slice(0, 16) });
      toast.success("Activity logged");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (aid: string) => {
      const { error } = await supabase.from("client_activities").delete().eq("id", aid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_activities", clientId] }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-display">Activity timeline</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              <Plus className="h-4 w-4 mr-1" />Log activity
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Log activity</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.activity_type} onValueChange={(v) => setForm({ ...form, activity_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACTIVITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Follow-up call about quote" /></div>
              <div className="space-y-2"><Label>When</Label><Input type="datetime-local" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} /></div>
              <div className="space-y-2"><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => add.mutate()} disabled={add.isPending}>{add.isPending ? "Saving…" : "Log"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet — log calls, visits, payments and notes here.</p>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border">
            {activities.map((a: any) => (
              <div key={a.id} className="relative">
                <div className="absolute -left-[18px] top-1 h-3 w-3 rounded-full bg-solar ring-4 ring-background" />
                <div className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-card">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <StatusPill tone="info">{a.activity_type}</StatusPill>
                      <p className="font-semibold text-sm">{a.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />{new Date(a.occurred_at).toLocaleString()}
                    </p>
                    {a.notes && <p className="text-sm mt-2 text-foreground/80">{a.notes}</p>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove.mutate(a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
