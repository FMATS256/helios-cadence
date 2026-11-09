import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  PageShell, SectionHeader, KpiRow, DataGrid, DetailCard, StatusBadge, EmptyState,
  RefreshButton, money, shortDate, toneForStatus, type ColumnDef,
} from "@/components/enterprise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  listWhmServers, saveWhmServer, testWhmServer, listHostingPackages,
} from "@/lib/hosting.functions";
import { HostingMigrationWorkbench } from "@/components/hosting-migration-workbench";
import { ExistingHostingPackageDialog, HostingProvisioningWizard } from "@/components/hosting-provisioning-wizard";
import type { HostingPackageServer } from "@/lib/hosting-packages";

export const Route = createFileRoute("/web-hosting")({
  head: () => ({
    meta: [
      { title: "Web Hosting — IMT Operations" },
      { name: "description", content: "Provision cPanel hosting from live WHM packages and manage domains, renewals and hosting revenue." },
      { property: "og:title", content: "Web Hosting — IMT Operations" },
      { property: "og:description", content: "Guided WHM provisioning, cPanel accounts, domains and renewals for IMT customers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WebHostingPage,
});

function WebHostingPage() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getHostingOverview);
  const [search, setSearch] = useState("");
  const [pkgTarget, setPkgTarget] = useState<any | null>(null);
  const [provisionTarget, setProvisionTarget] = useState<any | null>(null);

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
    mutationFn: (v: { id: string; plan: string; whm_server_id: string }) => provisionFn({ data: v }),
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
                  <DropdownMenuItem onClick={() => setProvisionTarget(r)}>Choose package & provision</DropdownMenuItem>
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

      <HostingMigrationWorkbench customers={customers} onChanged={refresh} />

      {provisionTarget && (
        <ExistingHostingPackageDialog
          account={provisionTarget}
          open={!!provisionTarget}
          onOpenChange={(open) => { if (!open) setProvisionTarget(null); }}
          onDone={refresh}
        />
      )}

      <ChangePackageDialog
        target={pkgTarget}
        onClose={() => setPkgTarget(null)}
        pending={lifecycle.isPending}
        onSubmit={(plan) => pkgTarget && lifecycle.mutate({ id: pkgTarget.id, action: "change_package", plan })}
      />
    </PageShell>
  );

}

function NewHostingDialog({ customers, onDone }: { customers: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" />Provision hosting
      </Button>
      <HostingProvisioningWizard open={open} onOpenChange={setOpen} customers={customers} onDone={onDone} />
    </>
  );
}

function ChangePackageDialog({
  target, onClose, onSubmit, pending,
}: { target: any | null; onClose: () => void; onSubmit: (plan: string) => void; pending: boolean }) {
  const [plan, setPlan] = useState("");
  const listFn = useServerFn(listHostingPackages);
  const options = useQuery({
    queryKey: ["hosting-provisioning-packages"],
    queryFn: async () => (await listFn()) as HostingPackageServer[],
    enabled: !!target,
    retry: false,
  });
  const servers = options.data ?? [];
  const server = servers.find((item) => item.id === target?.whm_server_id)
    ?? servers.find((item) => item.isDefault)
    ?? servers[0];
  const packages = server?.packages ?? [];
  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setPlan(""); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Change hosting package</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{target?.domain}</span> is currently on{" "}
            <span className="font-semibold">{target?.plan || "no package"}</span>.
            {target?.provisioning_status === "whm" && " The new package will be pushed to WHM."}
          </p>
          <div className="space-y-1.5">
            <Label>New package</Label>
            <Select value={plan} onValueChange={setPlan} disabled={options.isLoading || !!server?.error}>
              <SelectTrigger><SelectValue placeholder={options.isLoading ? "Loading WHM packages…" : "Choose an available package"} /></SelectTrigger>
              <SelectContent>
                {packages.map((item) => <SelectItem key={item.name} value={item.name}>{item.name}{item.diskMb != null ? ` · ${(item.diskMb / 1024).toFixed(item.diskMb % 1024 === 0 ? 0 : 2)} GB` : " · Unlimited disk"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {server?.error && <p className="text-sm text-destructive">{server.error}</p>}
          {!options.isLoading && !server?.error && packages.length === 0 && <p className="text-sm text-muted-foreground">No packages are available from this WHM server. Refresh the server connection and try again.</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!plan.trim() || plan === target?.plan || pending} onClick={() => onSubmit(plan.trim())}>
            {pending ? "Applying…" : "Change package"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WhmServersDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const listFn = useServerFn(listWhmServers);
  const saveFn = useServerFn(saveWhmServer);
  const testFn = useServerFn(testWhmServer);
  const { data: servers = [], isLoading } = useQuery({
    queryKey: ["whm-servers"], queryFn: () => listFn(), enabled: open,
  });

  const [form, setForm] = useState({
    name: "", hostname: "", port: "2087", api_user: "root",
    token_secret_name: "WHM_API_TOKEN", default_package: "", is_default: false,
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => saveFn({ data: {
      name: form.name, hostname: form.hostname, port: Number(form.port) || 2087,
      api_user: form.api_user, token_secret_name: form.token_secret_name,
      default_package: form.default_package || null, is_default: form.is_default,
    } }),
    onSuccess: () => {
      toast.success("WHM server saved");
      setForm({ name: "", hostname: "", port: "2087", api_user: "root", token_secret_name: "WHM_API_TOKEN", default_package: "", is_default: false });
      qc.invalidateQueries({ queryKey: ["whm-servers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: (id: string) => testFn({ data: { id } }),
    onSuccess: (r: any) => {
      r.ok ? toast.success(`WHM reachable${r.version ? ` — v${r.version}` : ""}`) : toast.error(r.error ?? "Connection failed");
      qc.invalidateQueries({ queryKey: ["whm-servers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><ServerCog className="h-4 w-4 mr-1.5" />WHM servers</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>WHM servers</DialogTitle></DialogHeader>

        <div className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading servers…</p>
          ) : servers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No WHM servers registered yet. Add one below to enable automated provisioning.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {servers.map((s: any) => (
                <li key={s.id} className="p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{s.name}</span>
                      {s.is_default && <StatusBadge tone="solar">default</StatusBadge>}
                      <StatusBadge tone={s.verified_at ? "success" : s.last_error ? "danger" : "neutral"}>
                        {s.verified_at ? "verified" : s.last_error ? "error" : "untested"}
                      </StatusBadge>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground truncate">
                      {s.api_user}@{s.hostname}:{s.port} · secret {s.token_secret_name}
                    </p>
                    {s.last_error && <p className="text-xs text-destructive mt-1 line-clamp-2">{s.last_error}</p>}
                  </div>
                  <Button size="sm" variant="outline" disabled={test.isPending} onClick={() => test.mutate(s.id)}>
                    <ShieldCheck className="h-3.5 w-3.5 mr-1" />Test
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-semibold">Add a server</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Primary WHM" /></div>
              <div className="space-y-1.5"><Label>Hostname</Label><Input value={form.hostname} onChange={(e) => set("hostname", e.target.value)} placeholder="whm.example.com" /></div>
              <div className="space-y-1.5"><Label>Port</Label><Input value={form.port} onChange={(e) => set("port", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>API user</Label><Input value={form.api_user} onChange={(e) => set("api_user", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Token secret name</Label><Input value={form.token_secret_name} onChange={(e) => set("token_secret_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Default package</Label><Input value={form.default_package} onChange={(e) => set("default_package", e.target.value)} placeholder="optional" /></div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_default} onCheckedChange={(v) => set("is_default", v)} id="whm-default" />
              <Label htmlFor="whm-default" className="text-sm font-normal">Use as default provisioning target</Label>
            </div>
            <Button size="sm" disabled={save.isPending || !form.name || !form.hostname} onClick={() => save.mutate()}>
              <Plus className="h-4 w-4 mr-1.5" />{save.isPending ? "Saving…" : "Add server"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
