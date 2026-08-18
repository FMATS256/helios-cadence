import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getNasOverview } from "@/lib/infra.functions";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, DetailCard, StatusBadge, EmptyState,
  RefreshButton, money, shortDate, type ColumnDef,
} from "@/components/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HardDrive, MapPin, Plus, Search, Server, TriangleAlert, WalletCards } from "lucide-react";
import { toast } from "sonner";


const EMPTY = {
  id: "", name: "", vendor: "", model: "", serial_number: "", customer_id: "",
  capacity_tb: "", raid_level: "", location: "", management_url: "",
  monthly_cost: "", renewal_date: "", status: "active", notes: "",
};

export function ManagedNasPage() {
  const { user, loading } = useAuth();
  const overviewFn = useServerFn(getNasOverview);
  const authReady = !loading && !!user;
  const overview = useQuery({ queryKey: ["nas-overview"], queryFn: () => overviewFn(), enabled: authReady });

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);

  const units = overview.data?.units ?? [];
  const customers = overview.data?.customers ?? [];
  const stats = overview.data?.stats;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return units;
    return units.filter((u: any) =>
      [u.name, u.vendor, u.model, u.serial_number, u.location, u.customer_name, u.account_number]
        .some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [units, search]);

  const renewals = units.filter((u: any) => u.renewal_state === "due" || u.renewal_state === "expired");

  const cols: ColumnDef<any>[] = [
    {
      header: "Unit",
      cell: (u) => (
        <div>
          <div className="font-semibold">{u.name}</div>
          <div className="text-xs text-muted-foreground">{[u.vendor, u.model].filter(Boolean).join(" ") || "—"}</div>
        </div>
      ),
    },
    {
      header: "Customer",
      cell: (u) => u.customer_account ? (
        <div>
          <div className="text-sm">{u.customer_name ?? "—"}</div>
          <Link to="/customers/$accountNumber" params={{ accountNumber: u.customer_account }} className="font-mono text-xs text-solar hover:underline">{u.customer_account}</Link>
        </div>
      ) : <span className="text-xs text-muted-foreground">Unassigned</span>,
    },
    {
      header: "Capacity",
      cell: (u) => (
        <div>
          <div className="font-mono text-sm">{u.capacity_tb ?? "—"} TB</div>
          <div className="text-xs text-muted-foreground">{u.raid_level || "RAID n/a"}</div>
        </div>
      ),
    },
    { header: "Serial", cell: (u) => <span className="font-mono text-xs">{u.serial_number || "—"}</span> },
    { header: "Site", cell: (u) => <span className="text-sm">{u.location || "—"}</span> },
    { header: "Cost / mo", align: "right", cell: (u) => <span className="font-mono text-sm">{money(u.monthly_cost)}</span> },
    {
      header: "Renewal",
      cell: (u) => (
        <div>
          <div className="text-sm">{shortDate(u.renewal_date)}</div>
          {u.days_to_renewal != null && (
            <div className="text-xs text-muted-foreground">{u.days_to_renewal < 0 ? `${Math.abs(u.days_to_renewal)}d overdue` : `in ${u.days_to_renewal}d`}</div>
          )}
        </div>
      ),
    },
    { header: "Status", cell: (u) => <StatusBadge tone={u.status === "active" ? "success" : u.status === "suspended" ? "danger" : "neutral"}>{u.status ?? "unknown"}</StatusBadge> },
    {
      header: "Actions", align: "right",
      cell: (u) => (
        <div className="flex items-center justify-end gap-1">
          {u.management_url && <Button size="sm" variant="ghost" asChild><a href={u.management_url} target="_blank" rel="noreferrer">Console</a></Button>}
          <Button size="sm" variant="outline" onClick={() => setEditing(u)}>Manage</Button>
        </div>
      ),
    },
  ];

  if (loading) return <PageShell><div className="p-6 text-sm text-muted-foreground">Loading…</div></PageShell>;
  if (!user) {
    return (
      <PageShell>
        <SectionHeader eyebrow="Services" title="Managed NAS" description="Sign in to manage NAS deployments." />
        <Card><CardContent className="p-6 text-sm">Please <Link to="/auth" className="font-medium text-solar underline">sign in</Link> to continue.</CardContent></Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Services"
        title="Managed NAS"
        description="On-premise and co-located NAS units managed for customers — capacity, RAID configuration, sites and renewals."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onClick={() => overview.refetch()} loading={overview.isFetching} />
            <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }} onClick={() => setEditing({ ...EMPTY })}>
              <Plus className="mr-1.5 h-4 w-4" /> Add NAS
            </Button>
          </div>
        }
      />

      <StatChipRow
        cols={5}
        chips={[
          { label: "Deployments", value: stats?.total ?? 0, color: "#4f46e5", hint: stats ? `${stats.active} active · ${stats.suspended} suspended` : undefined },
          { label: "Managed capacity", value: `${stats?.capacityTb ?? 0} TB`, color: "#10b981" },
          { label: "Sites", value: stats?.sites ?? 0, color: "#0ea5e9" },
          { label: "Renewals due", value: stats?.dueSoon ?? 0, color: "#f43f5e", hint: stats?.expired ? `${stats.expired} expired` : "next 30 days" },
          { label: "NAS MRR", value: money(stats?.mrr ?? 0), color: "#f59e0b", text: "#3b2606" },
        ]}
      />


      <Tabs defaultValue="units">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="units">Deployments ({units.length})</TabsTrigger>
          <TabsTrigger value="renewals">Renewals ({renewals.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="units" className="mt-4">
          <DetailCard
            title="NAS deployments"
            padded={false}
            action={
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search unit, serial, site, customer…" className="h-9 pl-9" />
              </div>
            }
          >
            <DataGrid
              rows={filtered}
              columns={cols}
              loading={overview.isLoading}
              empty={<EmptyState title="No NAS deployments" description="Register the first managed NAS unit to track capacity and renewals." icon={Server} />}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="renewals" className="mt-4">
          <DetailCard title="Expiring and expired contracts">
            {renewals.length === 0 ? (
              <EmptyState title="Nothing due" description="No NAS contract renews in the next 30 days." icon={HardDrive} />
            ) : (
              <div className="space-y-2">
                {renewals.map((u: any) => (
                  <div key={u.id} className={`flex items-center gap-3 rounded-lg border p-3 ${u.renewal_state === "expired" ? "border-destructive/30 bg-destructive/5" : "border-warning/40 bg-warning/5"}`}>
                    <TriangleAlert className={`h-5 w-5 ${u.renewal_state === "expired" ? "text-destructive" : "text-warning"}`} />
                    <div className="flex-1">
                      <div className="font-semibold">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.customer_name ?? "Unassigned"} · renews {shortDate(u.renewal_date)}</div>
                    </div>
                    <StatusBadge tone={u.renewal_state === "expired" ? "danger" : "warning"}>{u.renewal_state}</StatusBadge>
                    <Button size="sm" variant="outline" onClick={() => setEditing(u)}>Renew</Button>
                  </div>
                ))}
              </div>
            )}
          </DetailCard>
        </TabsContent>
      </Tabs>

      {editing && (
        <NasDialog
          record={editing}
          customers={customers}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); overview.refetch(); }}
        />
      )}
    </PageShell>
  );
}

function NasDialog({
  record, customers, onClose, onDone,
}: { record: any; customers: any[]; onClose: () => void; onDone: () => void }) {
  const isNew = !record.id;
  const [f, setF] = useState({
    name: record.name ?? "",
    vendor: record.vendor ?? "",
    model: record.model ?? "",
    serial_number: record.serial_number ?? "",
    customer_id: record.customer_id ?? "",
    capacity_tb: record.capacity_tb ?? "",
    raid_level: record.raid_level ?? "",
    location: record.location ?? "",
    management_url: record.management_url ?? "",
    monthly_cost: record.monthly_cost ?? "",
    renewal_date: record.renewal_date ?? "",
    status: record.status ?? "active",
    notes: record.notes ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!f.name.trim()) throw new Error("Unit name is required");
      const payload: any = {
        name: f.name.trim(),
        vendor: f.vendor || null,
        model: f.model || null,
        serial_number: f.serial_number || null,
        customer_id: f.customer_id || null,
        capacity_tb: f.capacity_tb === "" ? null : Number(f.capacity_tb),
        raid_level: f.raid_level || null,
        location: f.location || null,
        management_url: f.management_url || null,
        monthly_cost: f.monthly_cost === "" ? 0 : Number(f.monthly_cost),
        renewal_date: f.renewal_date || null,
        status: f.status,
        notes: f.notes || null,
      };
      const res = isNew
        ? await supabase.from("managed_nas_accounts").insert(payload)
        : await supabase.from("managed_nas_accounts").update(payload).eq("id", record.id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => { toast.success(isNew ? "NAS deployment created" : "NAS deployment updated"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("managed_nas_accounts")
        .update({ archived_at: new Date().toISOString(), status: "cancelled" }).eq("id", record.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("NAS deployment archived"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{isNew ? "New NAS deployment" : `Manage · ${record.name}`}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2"><Label>Unit name *</Label><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Client HQ NAS" /></div>
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={f.customer_id} onValueChange={(v) => setF({ ...f, customer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["active", "pending", "suspended", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Vendor</Label><Input value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} placeholder="Synology / QNAP / TrueNAS" /></div>
            <div className="space-y-2"><Label>Model</Label><Input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></div>
            <div className="space-y-2"><Label>Serial number</Label><Input value={f.serial_number} onChange={(e) => setF({ ...f, serial_number: e.target.value })} /></div>
            <div className="space-y-2"><Label>Capacity (TB)</Label><Input type="number" step="0.01" value={f.capacity_tb} onChange={(e) => setF({ ...f, capacity_tb: e.target.value })} /></div>
            <div className="space-y-2"><Label>RAID level</Label><Input value={f.raid_level} onChange={(e) => setF({ ...f, raid_level: e.target.value })} placeholder="RAID 5 / SHR / Z1" /></div>
            <div className="space-y-2"><Label>Site / location</Label><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
            <div className="space-y-2"><Label>Monthly cost (USD)</Label><Input type="number" step="0.01" value={f.monthly_cost} onChange={(e) => setF({ ...f, monthly_cost: e.target.value })} /></div>
            <div className="space-y-2"><Label>Renewal date</Label><Input type="date" value={f.renewal_date ?? ""} onChange={(e) => setF({ ...f, renewal_date: e.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Management URL</Label><Input value={f.management_url} onChange={(e) => setF({ ...f, management_url: e.target.value })} placeholder="https://nas.customer.co.zw" /></div>
            <div className="space-y-2 md:col-span-2"><Label>Notes</Label><Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          </div>
          <DialogFooter className="gap-2">
            {!isNew && (
              <Button type="button" variant="outline" disabled={archive.isPending} onClick={() => archive.mutate()}>
                {archive.isPending ? "Archiving…" : "Archive unit"}
              </Button>
            )}
            <Button type="submit" disabled={save.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              {save.isPending ? "Saving…" : isNew ? "Create deployment" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
