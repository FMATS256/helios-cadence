import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Search, MapPin, Pencil, Trash2, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/clients")({
  head: () => ({
    meta: [
      { title: "Clients — RoyEno CRM" },
      { name: "description", content: "Manage your client database with phone numbers, systems, and installation details." },
    ],
  }),
  component: ClientsPage,
});

type ClientRow = {
  id: string;
  user_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  gps: string | null;
  system_type: string | null;
  system_size: string | null;
  inverter: string | null;
  battery: string | null;
  panels: string | null;
  status: string;
  warranty: string | null;
  next_action: string | null;
  notes: string | null;
  value: number;
  installation_date: string | null;
  created_at: string;
  updated_at: string;
};

const STATUSES = ["Lead", "Proposal", "Installation", "Active", "Maintenance"] as const;
const SYSTEM_TYPES = ["Residential", "Commercial", "Industrial", "Hybrid", "Backup", "Solar Pump"];

const statusTone: Record<string, "success" | "info" | "solar" | "warning"> = {
  Active: "success", Installation: "info", Proposal: "solar", Maintenance: "warning", Lead: "info",
};

function ClientsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [open, setOpen] = useState(false);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as ClientRow[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (form: Partial<ClientRow>) => {
      if (!user) throw new Error("Not signed in");
      const payload = { ...form, user_id: user.id };
      if (form.id) {
        const { error } = await supabase.from("clients").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
      setEditing(null);
      toast.success("Client saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return !q ||
      c.name.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q) ||
      c.system_type?.toLowerCase().includes(q);
  });

  const totalValue = clients.reduce((sum, c) => sum + Number(c.value || 0), 0);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Sales"
        title="Clients"
        description={`${clients.length} client${clients.length === 1 ? "" : "s"} · $${totalValue.toLocaleString()} pipeline value`}
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                <Plus className="h-4 w-4 mr-1.5" />Add Client
              </Button>
            </DialogTrigger>
            <ClientFormDialog
              key={editing?.id ?? "new"}
              initial={editing}
              onSubmit={(data) => upsert.mutate(data)}
              busy={upsert.isPending}
            />
          </Dialog>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, system…"
                className="pl-10 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Loading…" : `${filtered.length} of ${clients.length} shown`}
            </p>
          </div>

          {!isLoading && clients.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                No clients yet — add your first one to get started.
              </p>
              <Button onClick={() => { setEditing(null); setOpen(true); }} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                <Plus className="h-4 w-4 mr-1.5" />Add Client
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>System</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate({ to: "/clients/$id", params: { id: c.id } })}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-navy/10 text-navy text-xs font-semibold">
                            {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-sm">{c.name}</p>
                          {c.contact_person && (
                            <p className="text-xs text-muted-foreground">{c.contact_person}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs space-y-0.5">
                        {c.phone && (
                          <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-solar">
                            <Phone className="h-3 w-3" />{c.phone}
                          </a>
                        )}
                        {c.email && (
                          <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-muted-foreground hover:text-solar">
                            <Mail className="h-3 w-3" />{c.email}
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.city && (
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3 w-3 text-muted-foreground" />{c.city}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {(c.system_size || c.system_type) && (
                        <span className="text-sm font-medium">
                          {c.system_size} {c.system_type}
                        </span>
                      )}
                      {c.inverter && (
                        <p className="text-xs text-muted-foreground mt-0.5">{c.inverter}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={statusTone[c.status] ?? "info"}>{c.status}</StatusPill>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-solar">
                      ${Number(c.value).toLocaleString()}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => { setEditing(c); setOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {c.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove this client and all their details.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove.mutate(c.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function ClientFormDialog({
  initial, onSubmit, busy,
}: {
  initial: ClientRow | null;
  onSubmit: (data: Partial<ClientRow>) => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<Partial<ClientRow>>(
    initial ?? { status: "Lead", value: 0 }
  );
  const set = <K extends keyof ClientRow>(k: K, v: ClientRow[K] | string | number | null) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) return toast.error("Client name is required");
    onSubmit({
      ...form,
      value: Number(form.value || 0),
      ...(initial ? { id: initial.id } : {}),
    });
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initial ? "Edit Client" : "Add New Client"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2">
            <Label>Client / Company Name *</Label>
            <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Contact Person</Label>
            <Input value={form.contact_person ?? ""} onChange={(e) => set("contact_person", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+263 ..." />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Address</Label>
            <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </div>

          <div className="col-span-2 pt-2 border-t">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">System Details</p>
          </div>

          <div className="space-y-2">
            <Label>System Type</Label>
            <Select value={form.system_type ?? ""} onValueChange={(v) => set("system_type", v)}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {SYSTEM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>System Size</Label>
            <Input value={form.system_size ?? ""} onChange={(e) => set("system_size", e.target.value)} placeholder="e.g. 8kW" />
          </div>
          <div className="space-y-2">
            <Label>Inverter</Label>
            <Input value={form.inverter ?? ""} onChange={(e) => set("inverter", e.target.value)} placeholder="e.g. Deye SUN-8K" />
          </div>
          <div className="space-y-2">
            <Label>Battery</Label>
            <Input value={form.battery ?? ""} onChange={(e) => set("battery", e.target.value)} placeholder="e.g. Pylontech US5000 x3" />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Panels</Label>
            <Input value={form.panels ?? ""} onChange={(e) => set("panels", e.target.value)} placeholder="e.g. 16 x JA Solar 450W" />
          </div>

          <div className="col-span-2 pt-2 border-t">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Status & Value</p>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status ?? "Lead"} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Deal Value (USD)</Label>
            <Input type="number" min="0" step="100"
              value={form.value ?? 0}
              onChange={(e) => set("value", Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Installation Date</Label>
            <Input type="date" value={form.installation_date ?? ""} onChange={(e) => set("installation_date", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Warranty</Label>
            <Input value={form.warranty ?? ""} onChange={(e) => set("warranty", e.target.value)} placeholder="e.g. 10 yr / 5 yr" />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Next Action</Label>
            <Input value={form.next_action ?? ""} onChange={(e) => set("next_action", e.target.value)} placeholder="e.g. Site visit – 24 May" />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="submit" disabled={busy} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
            {busy ? "Saving…" : initial ? "Save changes" : "Add client"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
