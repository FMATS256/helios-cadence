import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getStorageOverview } from "@/lib/infra.functions";
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
import { Cloud, Database, HardDrive, Plus, Search, TriangleAlert, WalletCards } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/cloud-storage")({
  head: () => ({
    meta: [
      { title: "Cloud Storage — IMT Operations" },
      { name: "description", content: "Manage customer cloud storage accounts, capacity, usage, renewals and monthly cost." },
      { property: "og:title", content: "Cloud Storage — IMT Operations" },
      { property: "og:description", content: "Customer cloud storage accounts, capacity, usage and renewals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CloudStoragePage,
});

const EMPTY = {
  id: "", name: "", provider: "", customer_id: "", access_url: "",
  storage_tb: "", used_tb: "", monthly_cost: "", renewal_date: "", status: "active", notes: "",
};

function CloudStoragePage() {
  const { user, loading } = useAuth();
  const overviewFn = useServerFn(getStorageOverview);
  const authReady = !loading && !!user;
  const overview = useQuery({ queryKey: ["storage-overview"], queryFn: () => overviewFn(), enabled: authReady });

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);

  const accounts = overview.data?.accounts ?? [];
  const customers = overview.data?.customers ?? [];
  const stats = overview.data?.stats;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a: any) =>
      [a.name, a.provider, a.account_number, a.customer_name, a.access_url]
        .some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [accounts, search]);

  const nearFull = accounts.filter((a: any) => (a.usage_pct ?? 0) >= 85);

  const cols: ColumnDef<any>[] = [
    {
      header: "Account",
      cell: (a) => (
        <div>
          <div className="font-semibold">{a.name}</div>
          <div className="text-xs text-muted-foreground">{a.provider || "In-house"}</div>
        </div>
      ),
    },
    {
      header: "Customer",
      cell: (a) => a.customer_account ? (
        <div>
          <div className="text-sm">{a.customer_name ?? "—"}</div>
          <Link to="/customers/$accountNumber" params={{ accountNumber: a.customer_account }} className="font-mono text-xs text-solar hover:underline">{a.customer_account}</Link>
        </div>
      ) : <span className="text-xs text-muted-foreground">Unassigned</span>,
    },
    {
      header: "Capacity",
      cell: (a) => (
        <div className="min-w-32">
          <div className="font-mono text-xs">{Number(a.used_tb ?? 0)} / {a.storage_tb ?? "—"} TB</div>
          {a.usage_pct != null && (
            <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
              <div
                className={`h-1.5 rounded-full ${a.usage_pct >= 85 ? "bg-destructive" : a.usage_pct >= 60 ? "bg-warning" : "bg-success"}`}
                style={{ width: `${Math.min(100, a.usage_pct)}%` }}
              />
            </div>
          )}
        </div>
      ),
    },
    { header: "Cost / mo", align: "right", cell: (a) => <span className="font-mono text-sm">{money(a.monthly_cost)}</span> },
    {
      header: "Renewal",
      cell: (a) => (
        <div>
          <div className="text-sm">{shortDate(a.renewal_date)}</div>
          {a.days_to_renewal != null && (
            <div className="text-xs text-muted-foreground">{a.days_to_renewal < 0 ? `${Math.abs(a.days_to_renewal)}d overdue` : `in ${a.days_to_renewal}d`}</div>
          )}
        </div>
      ),
    },
    { header: "Status", cell: (a) => <StatusBadge tone={a.status === "active" ? "success" : a.status === "suspended" ? "danger" : "neutral"}>{a.status ?? "unknown"}</StatusBadge> },
    {
      header: "Actions", align: "right",
      cell: (a) => (
        <div className="flex items-center justify-end gap-1">
          {a.access_url && <Button size="sm" variant="ghost" asChild><a href={a.access_url} target="_blank" rel="noreferrer">Open</a></Button>}
          <Button size="sm" variant="outline" onClick={() => setEditing(a)}>Manage</Button>
        </div>
      ),
    },
  ];

  if (loading) return <PageShell><div className="p-6 text-sm text-muted-foreground">Loading…</div></PageShell>;
  if (!user) {
    return (
      <PageShell>
        <SectionHeader eyebrow="Services" title="Cloud Storage" description="Sign in to manage customer storage accounts." />
        <Card><CardContent className="p-6 text-sm">Please <Link to="/auth" className="font-medium text-solar underline">sign in</Link> to continue.</CardContent></Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Services"
        title="Cloud Storage"
        description="Customer storage accounts, allocated versus consumed capacity, renewals and recurring revenue."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onClick={() => overview.refetch()} loading={overview.isFetching} />
            <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }} onClick={() => setEditing({ ...EMPTY })}>
              <Plus className="mr-1.5 h-4 w-4" /> New storage account
            </Button>
          </div>
        }
      />

      <StatChipRow
        cols={5}
        chips={[
          { label: "Accounts", value: stats?.total ?? 0, color: "#4f46e5", hint: stats ? `${stats.active} active · ${stats.suspended} suspended` : undefined },
          { label: "Used storage", value: `${stats?.usedTb ?? 0} TB`, color: "#10b981", hint: stats ? `of ${stats.allocatedTb} TB` : undefined },
          { label: "Allocated", value: `${stats?.allocatedTb ?? 0} TB`, color: "#0ea5e9" },
          { label: "Near capacity", value: stats?.nearFull ?? 0, color: "#f43f5e", hint: "85%+ consumed" },
          { label: "Storage MRR", value: money(stats?.mrr ?? 0), color: "#f59e0b", text: "#3b2606", hint: stats ? `${stats.dueSoon} renewals due` : undefined },
        ]}
      />


      <Tabs defaultValue="accounts">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="accounts">Accounts ({accounts.length})</TabsTrigger>
          <TabsTrigger value="alerts">Low storage alerts ({nearFull.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4">
          <DetailCard
            title="Storage accounts"
            padded={false}
            action={
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search account, provider, customer…" className="h-9 pl-9" />
              </div>
            }
          >
            <DataGrid
              rows={filtered}
              columns={cols}
              loading={overview.isLoading}
              empty={<EmptyState title="No storage accounts" description="Create the first customer storage account to track capacity and renewals." icon={Cloud} />}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <DetailCard title="Accounts above 85% capacity">
            {nearFull.length === 0 ? (
              <EmptyState title="All accounts healthy" description="No storage account is above 85% of its allocation." icon={HardDrive} />
            ) : (
              <div className="space-y-2">
                {nearFull.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <TriangleAlert className="h-5 w-5 text-destructive" />
                    <div className="flex-1">
                      <div className="font-semibold">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.customer_name ?? "Unassigned"} · {a.used_tb} / {a.storage_tb} TB</div>
                    </div>
                    <StatusBadge tone="danger">{a.usage_pct}% used</StatusBadge>
                    <Button size="sm" variant="outline" onClick={() => setEditing(a)}>Increase plan</Button>
                  </div>
                ))}
              </div>
            )}
          </DetailCard>
        </TabsContent>
      </Tabs>

      {editing && (
        <StorageDialog
          record={editing}
          customers={customers}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); overview.refetch(); }}
        />
      )}
    </PageShell>
  );
}

function StorageDialog({
  record, customers, onClose, onDone,
}: { record: any; customers: any[]; onClose: () => void; onDone: () => void }) {
  const isNew = !record.id;
  const [f, setF] = useState({
    name: record.name ?? "",
    provider: record.provider ?? "",
    customer_id: record.customer_id ?? "",
    access_url: record.access_url ?? "",
    storage_tb: record.storage_tb ?? "",
    used_tb: record.used_tb ?? "",
    monthly_cost: record.monthly_cost ?? "",
    renewal_date: record.renewal_date ?? "",
    status: record.status ?? "active",
    notes: record.notes ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!f.name.trim()) throw new Error("Account name is required");
      const payload: any = {
        name: f.name.trim(),
        provider: f.provider || null,
        customer_id: f.customer_id || null,
        access_url: f.access_url || null,
        storage_tb: f.storage_tb === "" ? null : Number(f.storage_tb),
        used_tb: f.used_tb === "" ? null : Number(f.used_tb),
        monthly_cost: f.monthly_cost === "" ? 0 : Number(f.monthly_cost),
        renewal_date: f.renewal_date || null,
        status: f.status,
        notes: f.notes || null,
      };
      const res = isNew
        ? await supabase.from("cloud_storage_accounts").insert(payload)
        : await supabase.from("cloud_storage_accounts").update(payload).eq("id", record.id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => { toast.success(isNew ? "Storage account created" : "Storage account updated"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const lifecycleFn = useServerFn(storageLifecycleAction);
  const [pending, setPending] = useState<string | null>(null);
  const lifecycle = useMutation({
    mutationFn: async (input: { action: any; reason?: string; storage_tb?: number; used_tb?: number }) => {
      setPending(input.action);
      return await lifecycleFn({ data: { id: record.id, ...input } });
    },
    onSuccess: () => { toast.success("Storage account updated"); setPending(null); onDone(); },
    onError: (e: Error) => { setPending(null); toast.error(e.message); },
  });

  function runLifecycle(action: string) {
    if (action === "resize") {
      const tb = Number(f.storage_tb);
      if (!(tb > 0)) return toast.error("Enter the new capacity (TB) above first");
      return lifecycle.mutate({ action, storage_tb: tb });
    }
    if (action === "record_usage") {
      const used = Number(f.used_tb);
      if (!Number.isFinite(used)) return toast.error("Enter the consumed capacity (TB) above first");
      return lifecycle.mutate({ action, used_tb: used });
    }
    if (action === "terminate" && !window.confirm(`Terminate ${record.name}? This cancels and archives the account.`)) return;
    if (action === "suspend") {
      const reason = window.prompt("Suspension reason", "Billing suspension") ?? undefined;
      if (reason === undefined) return;
      return lifecycle.mutate({ action, reason });
    }
    lifecycle.mutate({ action });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{isNew ? "New storage account" : `Manage · ${record.name}`}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2"><Label>Account name *</Label><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="acme-backups" /></div>
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={f.customer_id} onValueChange={(v) => setF({ ...f, customer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Provider</Label><Input value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} placeholder="Wasabi / Backblaze B2 / IMT" /></div>
            <div className="space-y-2"><Label>Allocated (TB)</Label><Input type="number" step="0.01" value={f.storage_tb} onChange={(e) => setF({ ...f, storage_tb: e.target.value })} /></div>
            <div className="space-y-2"><Label>Used (TB)</Label><Input type="number" step="0.01" value={f.used_tb} onChange={(e) => setF({ ...f, used_tb: e.target.value })} /></div>
            <div className="space-y-2"><Label>Monthly cost (USD)</Label><Input type="number" step="0.01" value={f.monthly_cost} onChange={(e) => setF({ ...f, monthly_cost: e.target.value })} /></div>
            <div className="space-y-2"><Label>Renewal date</Label><Input type="date" value={f.renewal_date ?? ""} onChange={(e) => setF({ ...f, renewal_date: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["active", "pending", "suspended", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Access URL</Label><Input value={f.access_url} onChange={(e) => setF({ ...f, access_url: e.target.value })} placeholder="https://…" /></div>
            <div className="space-y-2 md:col-span-2"><Label>Notes</Label><Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          </div>
          <DialogFooter className="gap-2">
            {!isNew && (
              <Button type="button" variant="outline" disabled={archive.isPending} onClick={() => archive.mutate()}>
                {archive.isPending ? "Archiving…" : "Archive account"}
              </Button>
            )}
            <Button type="submit" disabled={save.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              {save.isPending ? "Saving…" : isNew ? "Create account" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
