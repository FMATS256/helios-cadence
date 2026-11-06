// NOC Client Resources — every client server, hosting account and domain in
// one searchable list. Rows open a detail dialog with real, audited actions
// (power, provision, suspend, sync, SSO) and staff can register new servers
// and hosting accounts from working forms.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { DetailCard, DataGrid, StatusBadge, StatChipRow, shortDate } from "@/components/enterprise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Server as ServerIcon, Globe, Plus, Power, PowerOff, RotateCw, RefreshCw, Activity,
  Pause, Play, KeyRound, Trash2, ExternalLink, Loader2, Settings2, CloudUpload,
} from "lucide-react";
import { getClientResources, registerServer, createHostingAccount } from "@/lib/noc.functions";
import { powerProviderServer, refreshProviderServer } from "@/lib/providers.functions";
import { sampleServerMetrics } from "@/lib/servers.functions";
import { provisionHostingAccount, hostingLifecycleAction, syncHosting, hostingSsoLink } from "@/lib/hosting.functions";

type Resource =
  | { kind: "server"; id: string; title: string; sub: string; customer: string; status: string; raw: any }
  | { kind: "hosting"; id: string; title: string; sub: string; customer: string; status: string; raw: any };

export function ClientResourcesSection() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "server" | "hosting">("all");
  const [selected, setSelected] = useState<Resource | null>(null);
  const [serverFormOpen, setServerFormOpen] = useState(false);
  const [hostingFormOpen, setHostingFormOpen] = useState(false);

  const resourcesFn = useServerFn(getClientResources);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["noc-client-resources"],
    queryFn: async () => (await resourcesFn()) as any,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["noc-client-resources"] });

  const resources: Resource[] = useMemo(() => {
    const servers: Resource[] = (data?.servers ?? []).map((s: any) => ({
      kind: "server",
      id: s.id,
      title: s.name,
      sub: s.public_ips?.[0] ?? s.provider ?? "",
      customer: s.customers?.company_name ?? "Unassigned",
      status: s.power_state ?? s.status ?? "unknown",
      raw: s,
    }));
    const hosting: Resource[] = (data?.hosting ?? []).map((h: any) => ({
      kind: "hosting",
      id: h.id,
      title: h.domain,
      sub: h.plan ?? "Hosting",
      customer: h.customers?.company_name ?? "Unassigned",
      status: h.status ?? "unknown",
      raw: h,
    }));
    return [...servers, ...hosting];
  }, [data]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return resources.filter((r) =>
      (filter === "all" || r.kind === filter) &&
      (!needle || `${r.title} ${r.sub} ${r.customer}`.toLowerCase().includes(needle)),
    );
  }, [resources, q, filter]);

  const chips = useMemo(() => {
    const servers = resources.filter((r) => r.kind === "server");
    const hosting = resources.filter((r) => r.kind === "hosting");
    return [
      { label: "Servers", value: String(servers.length), color: "#0f766e" },
      { label: "Servers On", value: String(servers.filter((r) => r.status === "on").length), color: "#15803d" },
      { label: "Hosting Accounts", value: String(hosting.length), color: "#1d4ed8" },
      { label: "Hosting Active", value: String(hosting.filter((r) => r.status === "active").length), color: "#0d9488" },
      { label: "Suspended", value: String(resources.filter((r) => r.status === "suspended").length), color: "#b45309" },
      { label: "Pending Setup", value: String(resources.filter((r) => r.status === "pending").length), color: "#7e22ce" },
    ];
  }, [resources]);

  return (
    <div className="space-y-4">
      <StatChipRow chips={chips} cols={6} />

      {/* Clear provisioning actions — the two things NOC does most */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setServerFormOpen(true)}
          className="flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 p-4 text-left transition hover:border-teal-400 hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-950/40 dark:hover:bg-teal-950/70"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-teal-600 text-white">
            <ServerIcon className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-teal-900 dark:text-teal-100">Provision a server</span>
            <span className="block text-xs text-teal-700 dark:text-teal-300">Register a VPS or dedicated server for a client, then power and manage it.</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setHostingFormOpen(true)}
          className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-left transition hover:border-blue-400 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:hover:bg-blue-950/70"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
            <Globe className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-blue-900 dark:text-blue-100">Provision web hosting</span>
            <span className="block text-xs text-blue-700 dark:text-blue-300">Create a hosting account for a client domain, then deploy it on WHM/cPanel.</span>
          </span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search client, server, domain or IP…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All resources</SelectItem>
            <SelectItem value="server">Servers</SelectItem>
            <SelectItem value="hosting">Web hosting</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setServerFormOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />Register server
          </Button>
          <Button onClick={() => setHostingFormOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />New hosting account
          </Button>
          <Button variant="ghost" size="icon" title="Refresh" onClick={refresh} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <DetailCard title="Client resources" padded={false}>
        <DataGrid
          rows={list}
          loading={isLoading}
          empty="No client servers or hosting accounts yet — register one above."
          onRowClick={(r: Resource) => setSelected(r)}
          columns={[
            {
              header: "Type",
              cell: (r: Resource) =>
                r.kind === "server"
                  ? <span className="inline-flex items-center gap-1.5 text-xs font-medium"><ServerIcon className="h-3.5 w-3.5 text-teal-700" />Server</span>
                  : <span className="inline-flex items-center gap-1.5 text-xs font-medium"><Globe className="h-3.5 w-3.5 text-blue-700" />Hosting</span>,
            },
            { header: "Name / Domain", cell: (r: Resource) => <span className="font-medium">{r.title}</span> },
            { header: "Detail", cell: (r: Resource) => <span className="text-xs text-muted-foreground font-mono">{r.sub || "—"}</span> },
            { header: "Client", cell: (r: Resource) => r.customer },
            {
              header: "Status",
              cell: (r: Resource) => (
                <StatusBadge tone={r.status === "on" || r.status === "active" ? "success" : r.status === "suspended" || r.status === "off" ? "danger" : "neutral"}>
                  {r.status}
                </StatusBadge>
              ),
            },
            { header: "Added", cell: (r: Resource) => shortDate(r.raw.created_at) },
          ]}
        />
      </DetailCard>

      <ServerFormDialog open={serverFormOpen} onClose={() => setServerFormOpen(false)} customers={data?.customers ?? []} onSaved={refresh} />
      <HostingFormDialog open={hostingFormOpen} onClose={() => setHostingFormOpen(false)} customers={data?.customers ?? []} onSaved={refresh} />

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected?.kind === "server" && (
            <ServerDetail server={selected.raw} onChanged={refresh} onClose={() => setSelected(null)} />
          )}
          {selected?.kind === "hosting" && (
            <HostingDetail account={selected.raw} onChanged={refresh} onClose={() => setSelected(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Server detail + power actions
 * ------------------------------------------------------------------ */
function ServerDetail({ server, onChanged, onClose }: { server: any; onChanged: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const fnSample = useServerFn(sampleServerMetrics);
  const fnPower = useServerFn(powerProviderServer);
  const fnRefresh = useServerFn(refreshProviderServer);

  async function act(kind: "on" | "off" | "reboot" | "check" | "sync") {
    if ((kind === "off" || kind === "reboot") && !confirm(`Confirm ${kind === "off" ? "power off" : "reboot"} of ${server.name}?`)) return;
    setBusy(kind);
    try {
      if (kind === "check") await fnSample({ data: { server_id: server.id } });
      else if (kind === "sync") await fnRefresh({ data: { server_id: server.id } });
      else await fnPower({ data: { server_id: server.id, action: kind } });
      toast.success("Done");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ServerIcon className="h-4 w-4" /> {server.name}
        </DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Field label="Client" value={server.customers?.company_name ?? "Unassigned"} />
        <Field label="Account" value={server.customers?.account_number ?? server.account_number ?? "—"} />
        <Field label="Provider" value={server.provider} />
        <Field label="IP address" value={server.public_ips?.[0] ?? "—"} mono />
        <Field label="Status" value={`${server.status ?? "—"} · power ${server.power_state ?? "unknown"}`} />
        <Field label="Location" value={server.datacenter ?? "—"} />
        <Field label="Image / OS" value={server.image ?? "—"} />
        <Field label="Spec" value={server.cpu_cores ? `${server.cpu_cores} vCPU · ${Math.round((server.ram_mb ?? 0) / 1024)} GB RAM` : "—"} />
        <Field label="Monthly cost" value={server.monthly_cost_usd ? `$${server.monthly_cost_usd}` : "—"} />
        <Field label="Selling price" value={server.selling_price_usd ? `$${server.selling_price_usd}` : "—"} />
      </div>
      {server.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{server.notes}</p>}
      <div className="flex flex-wrap gap-2 pt-2">
        <ActionBtn busy={busy === "check"} onClick={() => act("check")} icon={<Activity className="h-3.5 w-3.5" />} label="Health check" />
        <ActionBtn busy={busy === "sync"} onClick={() => act("sync")} icon={<RefreshCw className="h-3.5 w-3.5" />} label="Sync from provider" />
        <ActionBtn busy={busy === "on"} onClick={() => act("on")} icon={<Power className="h-3.5 w-3.5" />} label="Power on" />
        <ActionBtn busy={busy === "reboot"} onClick={() => act("reboot")} icon={<RotateCw className="h-3.5 w-3.5" />} label="Restart" />
        <ActionBtn busy={busy === "off"} onClick={() => act("off")} icon={<PowerOff className="h-3.5 w-3.5" />} label="Power off" danger />
        <Link to="/cloud-ops/$id" params={{ id: server.id }} onClick={onClose}>
          <Button size="sm" variant="outline"><Settings2 className="h-3.5 w-3.5 mr-1.5" />Full management</Button>
        </Link>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Hosting detail + lifecycle actions
 * ------------------------------------------------------------------ */
function HostingDetail({ account, onChanged, onClose }: { account: any; onChanged: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const fnProvision = useServerFn(provisionHostingAccount);
  const fnLifecycle = useServerFn(hostingLifecycleAction);
  const fnSync = useServerFn(syncHosting);
  const fnSso = useServerFn(hostingSsoLink);

  async function run(kind: string, fn: () => Promise<any>, success: (r: any) => string) {
    setBusy(kind);
    try {
      const r = await fn();
      toast.success(success(r));
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const lifecycle = (action: "suspend" | "unsuspend" | "terminate" | "reset_password") => {
    if (action === "terminate" && !confirm(`Terminate hosting for ${account.domain}? This cancels the account.`)) return;
    if (action === "suspend" && !confirm(`Suspend ${account.domain}? The website will go offline.`)) return;
    return run(action, () => fnLifecycle({ data: { id: account.id, action } }), (r) =>
      action === "reset_password" && r?.password ? `Password reset — stored in the Vault` : "Done",
    );
  };

  const isWhm = account.provisioning_status === "whm";
  const usedMb = Number(account.disk_used_mb ?? 0);
  const quotaMb = Number(account.disk_quota_gb ?? 0) * 1024;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4" /> {account.domain}
        </DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Field label="Client" value={account.customers?.company_name ?? "Unassigned"} />
        <Field label="Account" value={account.customers?.account_number ?? account.account_number ?? "—"} />
        <Field label="Status" value={`${account.status ?? "—"} · ${account.provisioning_status ?? "pending"}`} />
        <Field label="Plan" value={account.plan ?? "—"} />
        <Field label="cPanel user" value={account.username ?? "Not provisioned"} mono />
        <Field label="Server IP" value={account.ip_address ?? "—"} mono />
        <Field label="Disk" value={quotaMb ? `${Math.round(usedMb)} MB / ${account.disk_quota_gb} GB` : "—"} />
        <Field label="SSL" value={account.ssl_status ?? "—"} />
        <Field label="Renewal" value={account.renewal_date ?? "—"} />
        <Field label="Price" value={account.monthly_cost ? `${account.currency ?? "USD"} ${account.monthly_cost}/mo` : "—"} />
      </div>
      {account.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{account.notes}</p>}
      <div className="flex flex-wrap gap-2 pt-2">
        {!isWhm && (
          <ActionBtn
            busy={busy === "provision"}
            onClick={() => run("provision", () => fnProvision({ data: { id: account.id } }), (r) => `Provisioned on WHM as ${r?.username}`)}
            icon={<CloudUpload className="h-3.5 w-3.5" />}
            label="Provision on WHM"
          />
        )}
        {isWhm && (
          <ActionBtn
            busy={busy === "sso"}
            onClick={() => run("sso", async () => { const r: any = await fnSso({ data: { id: account.id } }); window.open(r.url, "_blank", "noopener"); return r; }, () => "cPanel session opened")}
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            label="Open cPanel"
          />
        )}
        {account.status !== "suspended" && account.status !== "cancelled" && (
          <ActionBtn busy={busy === "suspend"} onClick={() => lifecycle("suspend")} icon={<Pause className="h-3.5 w-3.5" />} label="Suspend" danger />
        )}
        {account.status === "suspended" && (
          <ActionBtn busy={busy === "unsuspend"} onClick={() => lifecycle("unsuspend")} icon={<Play className="h-3.5 w-3.5" />} label="Unsuspend" />
        )}
        {isWhm && (
          <>
            <ActionBtn busy={busy === "sync"} onClick={() => run("sync", () => fnSync({ data: { id: account.id } }), () => "Usage synced from WHM")} icon={<RefreshCw className="h-3.5 w-3.5" />} label="Sync usage" />
            <ActionBtn busy={busy === "reset_password"} onClick={() => lifecycle("reset_password")} icon={<KeyRound className="h-3.5 w-3.5" />} label="Reset password" />
          </>
        )}
        {account.status !== "cancelled" && (
          <ActionBtn busy={busy === "terminate"} onClick={() => lifecycle("terminate")} icon={<Trash2 className="h-3.5 w-3.5" />} label="Terminate" danger />
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Create forms
 * ------------------------------------------------------------------ */
function ServerFormDialog({ open, onClose, customers, onSaved }: { open: boolean; onClose: () => void; customers: any[]; onSaved: () => void }) {
  const fn = useServerFn(registerServer);
  const [form, setForm] = useState({ name: "", provider: "vultr", customer_id: "", ip_address: "", image: "", datacenter: "", cpu_cores: "", ram_mb: "", monthly_cost_usd: "", selling_price_usd: "", notes: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      fn({
        data: {
          name: form.name,
          provider: form.provider,
          customer_id: form.customer_id || null,
          ip_address: form.ip_address || undefined,
          image: form.image || undefined,
          datacenter: form.datacenter || undefined,
          cpu_cores: form.cpu_cores ? Number(form.cpu_cores) : undefined,
          ram_mb: form.ram_mb ? Number(form.ram_mb) : undefined,
          monthly_cost_usd: form.monthly_cost_usd ? Number(form.monthly_cost_usd) : undefined,
          selling_price_usd: form.selling_price_usd ? Number(form.selling_price_usd) : undefined,
          notes: form.notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Server registered — use Full management to provision it with the provider");
      setForm({ name: "", provider: "vultr", customer_id: "", ip_address: "", image: "", datacenter: "", cpu_cores: "", ram_mb: "", monthly_cost_usd: "", selling_price_usd: "", notes: "" });
      onClose();
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message || "Failed to register server"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Register a server</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Server name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. acme-app-01" />
          </div>
          <div className="space-y-1.5">
            <Label>Provider *</Label>
            <Select value={form.provider} onValueChange={(v) => set("provider", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["vultr", "interserver", "kamatera", "on-prem", "other"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Select value={form.customer_id} onValueChange={(v) => set("customer_id", v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.company_name} ({c.account_number})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>IP address</Label>
            <Input value={form.ip_address} onChange={(e) => set("ip_address", e.target.value)} placeholder="41.79.x.x" />
          </div>
          <div className="space-y-1.5">
            <Label>Datacenter / region</Label>
            <Input value={form.datacenter} onChange={(e) => set("datacenter", e.target.value)} placeholder="e.g. Johannesburg" />
          </div>
          <div className="space-y-1.5">
            <Label>Image / OS</Label>
            <Input value={form.image} onChange={(e) => set("image", e.target.value)} placeholder="e.g. Ubuntu 24.04" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>vCPU</Label>
              <Input value={form.cpu_cores} onChange={(e) => set("cpu_cores", e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <Label>RAM (MB)</Label>
              <Input value={form.ram_mb} onChange={(e) => set("ram_mb", e.target.value)} inputMode="numeric" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Cost $/mo</Label>
            <Input value={form.monthly_cost_usd} onChange={(e) => set("monthly_cost_usd", e.target.value)} inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label>Selling $/mo</Label>
            <Input value={form.selling_price_usd} onChange={(e) => set("selling_price_usd", e.target.value)} inputMode="decimal" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Purpose, installed software…" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}Register server
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HostingFormDialog({ open, onClose, customers, onSaved }: { open: boolean; onClose: () => void; customers: any[]; onSaved: () => void }) {
  const fn = useServerFn(createHostingAccount);
  const [form, setForm] = useState({ customer_id: "", domain: "", plan: "", monthly_cost: "", currency: "USD", renewal_date: "", disk_quota_gb: "", notes: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      fn({
        data: {
          customer_id: form.customer_id,
          domain: form.domain,
          plan: form.plan || undefined,
          monthly_cost: form.monthly_cost ? Number(form.monthly_cost) : undefined,
          currency: form.currency,
          renewal_date: form.renewal_date || undefined,
          disk_quota_gb: form.disk_quota_gb ? Number(form.disk_quota_gb) : undefined,
          notes: form.notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Hosting account created — open it to provision on WHM");
      setForm({ customer_id: "", domain: "", plan: "", monthly_cost: "", currency: "USD", renewal_date: "", disk_quota_gb: "", notes: "" });
      onClose();
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create hosting account"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New web hosting account</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Client *</Label>
            <Select value={form.customer_id} onValueChange={(v) => set("customer_id", v)}>
              <SelectTrigger><SelectValue placeholder="Choose a client…" /></SelectTrigger>
              <SelectContent>
                {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.company_name} ({c.account_number})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Domain *</Label>
            <Input value={form.domain} onChange={(e) => set("domain", e.target.value)} placeholder="client.co.zw" />
          </div>
          <div className="space-y-1.5">
            <Label>Plan / package</Label>
            <Input value={form.plan} onChange={(e) => set("plan", e.target.value)} placeholder="e.g. Business 10GB" />
          </div>
          <div className="space-y-1.5">
            <Label>Disk quota (GB)</Label>
            <Input value={form.disk_quota_gb} onChange={(e) => set("disk_quota_gb", e.target.value)} inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label>Price /mo</Label>
            <Input value={form.monthly_cost} onChange={(e) => set("monthly_cost", e.target.value)} inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["USD", "ZWG"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Renewal date</Label>
            <Input type="date" value={form.renewal_date} onChange={(e) => set("renewal_date", e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Nameservers, migration notes…" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.customer_id || !form.domain.trim()}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}Create account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-xs" : "font-medium"}>{value}</div>
    </div>
  );
}

function ActionBtn({ busy, onClick, icon, label, danger }: { busy: boolean; onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean }) {
  return (
    <Button size="sm" variant={danger ? "destructive" : "outline"} onClick={onClick} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <span className="mr-1.5">{icon}</span>}
      {label}
    </Button>
  );
}
