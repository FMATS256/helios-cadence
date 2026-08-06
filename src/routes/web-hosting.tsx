import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  PageShell, SectionHeader, KpiRow, DataGrid, DetailCard, StatusBadge, EmptyState,
  RefreshButton, money, shortDate, toneForStatus, type ColumnDef,
} from "@/components/enterprise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  ExternalLink, Globe, Plus, Server, MoreHorizontal, CalendarClock, DollarSign, PauseCircle, Search,
  RefreshCw, ServerCog, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { getHostingOverview } from "@/lib/infra.functions";
import {
  provisionHostingAccount, hostingLifecycleAction, hostingSsoLink, syncHosting,
  listWhmServers, saveWhmServer, testWhmServer,
} from "@/lib/hosting.functions";

export const Route = createFileRoute("/web-hosting")({
  head: () => ({
    meta: [
      { title: "Web Hosting — IMT Operations" },
      { name: "description", content: "cPanel accounts, hosted domains, renewals and hosting revenue across every IMT customer." },
    ],
  }),
  component: WebHostingPage,
});

const EMPTY = {
  customer_id: "", domain: "", provider: "", control_panel: "cpanel", control_panel_url: "",
  username: "", plan: "", disk_quota_gb: "", bandwidth_gb: "", monthly_cost: "", renewal_date: "", notes: "",
};

function WebHostingPage() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getHostingOverview);
  const [search, setSearch] = useState("");
  const [pkgTarget, setPkgTarget] = useState<any | null>(null);

  const overview = useQuery({ queryKey: ["hosting-overview"], queryFn: () => overviewFn() });
  const accounts = overview.data?.accounts ?? [];
  const customers = overview.data?.customers ?? [];
  const stats = overview.data?.stats;
  const refresh = () => qc.invalidateQueries({ queryKey: ["hosting-overview"] });

  const lifecycleFn = useServerFn(hostingLifecycleAction);
  const provisionFn = useServerFn(provisionHostingAccount);
  const ssoFn = useServerFn(hostingSsoLink);
  const syncFn = useServerFn(syncHosting);

  const lifecycle = useMutation({
    mutationFn: (v: { id: string; action: "suspend" | "unsuspend" | "terminate" | "change_package" | "reset_password"; reason?: string; plan?: string }) =>
      lifecycleFn({ data: v }),
    onSuccess: (res: any, v) => {
      toast.success(
        v.action === "reset_password" && res?.password
          ? `Password rotated — saved to the credential vault`
          : `Hosting ${v.action.replace("_", " ")} completed`,
        { description: res?.provider },
      );
      setPkgTarget(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const provision = useMutation({
    mutationFn: (id: string) => provisionFn({ data: { id } }),
    onSuccess: (r: any) => { toast.success(`Provisioned on WHM as ${r.username}`); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sso = useMutation({
    mutationFn: (id: string) => ssoFn({ data: { id } }),
    onSuccess: (r: any) => { window.open(r.url, "_blank", "noopener"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sync = useMutation({
    mutationFn: (id?: string) => syncFn({ data: id ? { id } : {} }),
    onSuccess: (r: any) => { toast.success(`Synced ${r.synced} account(s)${r.failed ? `, ${r.failed} failed` : ""}`); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("web_hosting_accounts").update({ status } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(`Account ${v.status}`); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a: any) =>
      [a.domain, a.username, a.provider, a.plan, a.account_number, a.customer_name]
        .some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [accounts, search]);


  const cols: ColumnDef<any>[] = [
    {
      header: "Domain",
      cell: (r) => (
        <div>
          <div className="font-mono font-semibold">{r.domain}</div>
          {r.account_number && (
            <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline">
              {r.customer_name ?? r.account_number}
            </Link>
          )}
        </div>
      ),
    },
    {
      header: "Plan",
      cell: (r) => (
        <div>
          <div className="font-semibold">{r.plan || "—"}</div>
          <div className="text-xs text-muted-foreground">{r.provider || "—"}</div>
        </div>
      ),
    },
    { header: "cPanel user", cell: (r) => <span className="font-mono text-xs">{r.username || "—"}</span> },
    {
      header: "Usage",
      cell: (r) => {
        const usedGb = r.disk_used_mb != null ? Number(r.disk_used_mb) / 1024 : null;
        const quota = r.disk_quota_gb ? Number(r.disk_quota_gb) : null;
        const pct = usedGb != null && quota ? Math.round((usedGb / quota) * 100) : null;
        return (
          <div className="text-xs text-muted-foreground">
            <div>
              {usedGb != null ? `${usedGb.toFixed(1)} GB` : "—"}
              {quota ? ` / ${quota} GB` : ""}
              {pct != null && <span className={pct >= 90 ? " text-destructive" : pct >= 75 ? " text-warning" : ""}> · {pct}%</span>}
            </div>
            <div>
              {r.email_accounts != null ? `${r.email_accounts} mail` : ""}
              {r.databases_count != null ? ` · ${r.databases_count} db` : ""}
              {r.php_version ? ` · PHP ${String(r.php_version).replace(/^ea-php/, "")}` : ""}
            </div>
          </div>
        );
      },
    },
    {
      header: "WHM",
      cell: (r) => (
        <div className="text-xs">
          <StatusBadge tone={r.provisioning_status === "whm" ? (r.sync_status === "failed" ? "danger" : "success") : "neutral"}>
            {r.provisioning_status === "whm" ? (r.sync_status === "failed" ? "sync failed" : "provisioned") : "manual"}
          </StatusBadge>
          <div className="mt-1 text-muted-foreground">
            {r.last_sync_at ? `synced ${shortDate(r.last_sync_at)}` : "never synced"}
          </div>
        </div>
      ),
    },

    { header: "Cost/mo", align: "right", cell: (r) => <span className="font-mono">{money(r.monthly_cost)}</span> },
    {
      header: "Renewal",
      cell: (r) => r.renewal_date ? (
        <div>
          <div className="text-sm">{shortDate(r.renewal_date)}</div>
          <div className={`text-xs ${r.renewal_state === "expired" ? "text-destructive" : r.renewal_state === "due" ? "text-warning" : "text-muted-foreground"}`}>
            {r.days_to_renewal < 0 ? `${Math.abs(r.days_to_renewal)}d overdue` : `in ${r.days_to_renewal}d`}
          </div>
        </div>
      ) : "—",
    },
    { header: "Status", cell: (r) => <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge> },
    {
      header: "", align: "right",
      cell: (r) => {
        const onWhm = r.provisioning_status === "whm" && !!r.username;
        const busy = lifecycle.isPending || provision.isPending || sso.isPending || sync.isPending;
        return (
          <div className="flex items-center justify-end gap-1">
            {onWhm ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => sso.mutate(r.id)}>
                <ExternalLink className="h-3 w-3 mr-1" />cPanel
              </Button>
            ) : r.control_panel_url ? (
              <Button size="sm" variant="outline" asChild>
                <a href={r.control_panel_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3 mr-1" />cPanel</a>
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!onWhm && r.status !== "cancelled" && (
                  <DropdownMenuItem onClick={() => provision.mutate(r.id)}>Provision on WHM</DropdownMenuItem>
                )}
                {onWhm && <DropdownMenuItem onClick={() => sync.mutate(r.id)}>Sync usage from cPanel</DropdownMenuItem>}
                {onWhm && (
                  <DropdownMenuItem onClick={() => lifecycle.mutate({ id: r.id, action: "reset_password" })}>
                    Reset cPanel password
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setPkgTarget(r)}>Change package</DropdownMenuItem>
                <DropdownMenuSeparator />
                {r.status !== "suspended" && r.status !== "cancelled" && (
                  <DropdownMenuItem onClick={() => {
                    const reason = window.prompt("Suspension reason", "Billing suspension");
                    if (reason !== null) lifecycle.mutate({ id: r.id, action: "suspend", reason });
                  }}>Suspend account</DropdownMenuItem>
                )}
                {r.status === "suspended" && (
                  <DropdownMenuItem onClick={() => lifecycle.mutate({ id: r.id, action: "unsuspend" })}>Unsuspend account</DropdownMenuItem>
                )}
                {r.status !== "cancelled" && (
                  <DropdownMenuItem className="text-destructive" onClick={() => {
                    if (window.confirm(`Terminate hosting for ${r.domain}? This removes the cPanel account on WHM.`))
                      lifecycle.mutate({ id: r.id, action: "terminate" });
                  }}>Terminate account</DropdownMenuItem>
                )}
                {r.account_number && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }}>Open Customer 360</Link>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Services"
        title="Web Hosting"
        description="cPanel accounts, hosted websites and renewal tracking across every customer."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onClick={() => overview.refetch()} loading={overview.isFetching} />
            <Button variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(undefined)}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${sync.isPending ? "animate-spin" : ""}`} />
              {sync.isPending ? "Syncing…" : "Sync WHM"}
            </Button>
            <WhmServersDialog />
            <NewHostingDialog customers={customers} onDone={refresh} />
          </div>
        }
      />


      <KpiRow
        cols={5}
        items={[
          { label: "Hosting accounts", value: stats?.total ?? 0, icon: Globe, tone: "info" },
          { label: "Active", value: stats?.active ?? 0, icon: Server, tone: "success" },
          { label: "Suspended", value: stats?.suspended ?? 0, icon: PauseCircle, tone: "warning" },
          { label: "Renewals ≤ 30d", value: stats?.dueSoon ?? 0, icon: CalendarClock, tone: stats?.expired ? "danger" : "solar", hint: stats?.expired ? `${stats.expired} expired` : undefined },
          { label: "Hosting MRR", value: money(stats?.mrr ?? 0), icon: DollarSign, tone: "solar" },
        ]}
      />

      <DetailCard
        title="Hosting accounts"
        padded={false}
        action={
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search domain, user…" className="pl-9 h-9" />
          </div>
        }
      >
        <DataGrid
          rows={filtered}
          columns={cols}
          loading={overview.isLoading}
          empty={<EmptyState title="No hosting accounts yet" description="Add a cPanel account to start tracking hosting revenue and renewals." icon={Globe} />}
        />
      </DetailCard>
    </PageShell>
  );
}

function NewHostingDialog({ customers, onDone }: { customers: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.domain) throw new Error("Domain required");
      const cust = customers.find((c) => c.id === form.customer_id);
      const { error } = await supabase.from("web_hosting_accounts").insert({
        ...form,
        customer_id: form.customer_id || null,
        account_number: cust?.account_number ?? null,
        monthly_cost: Number(form.monthly_cost) || 0,
        disk_quota_gb: form.disk_quota_gb ? Number(form.disk_quota_gb) : null,
        bandwidth_gb: form.bandwidth_gb ? Number(form.bandwidth_gb) : null,
        renewal_date: form.renewal_date || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { setOpen(false); setForm(EMPTY); onDone(); toast.success("Hosting account created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
          <Plus className="h-4 w-4 mr-1.5" />Add hosting
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New hosting account</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4 rounded-xl border bg-muted/20 p-4">
            <div className="col-span-2 space-y-2">
              <Label>Customer</Label>
              <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Link to a customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2"><Label>Domain *</Label><Input required value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value.toLowerCase() })} placeholder="client.co.zw" /></div>
            <div className="space-y-2"><Label>Provider</Label><Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="Zim Domains / cPanel Inc" /></div>
            <div className="space-y-2"><Label>Plan</Label><Input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} placeholder="Business / Starter" /></div>
            <div className="space-y-2"><Label>cPanel URL</Label><Input value={form.control_panel_url} onChange={(e) => setForm({ ...form, control_panel_url: e.target.value })} placeholder="https://cpanel.example.com:2083" /></div>
            <div className="space-y-2"><Label>Username</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
            <div className="space-y-2"><Label>Disk (GB)</Label><Input type="number" value={form.disk_quota_gb} onChange={(e) => setForm({ ...form, disk_quota_gb: e.target.value })} /></div>
            <div className="space-y-2"><Label>Bandwidth (GB)</Label><Input type="number" value={form.bandwidth_gb} onChange={(e) => setForm({ ...form, bandwidth_gb: e.target.value })} /></div>
            <div className="space-y-2"><Label>Monthly cost (USD)</Label><Input type="number" step="0.01" value={form.monthly_cost} onChange={(e) => setForm({ ...form, monthly_cost: e.target.value })} /></div>
            <div className="space-y-2"><Label>Renewal date</Label><Input type="date" value={form.renewal_date} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} /></div>
            <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              {create.isPending ? "Saving…" : "Save hosting account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
