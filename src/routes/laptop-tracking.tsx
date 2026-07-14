import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { trackxCall } from "@/lib/trackx.functions";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageContainer, StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Copy, KeyRound, Laptop2, MoreHorizontal, Plus, RefreshCw, Trash2, CreditCard, Ban, PlayCircle, ShieldOff, TimerReset } from "lucide-react";

export const Route = createFileRoute("/laptop-tracking")({
  head: () => ({ meta: [{ title: "Laptop Tracking — IMT Trackx" }] }),
  component: LaptopTrackingPage,
});

// Note: The file lives under top-level. Since the app already gates via _authenticated
// via SidebarInset wrapper pattern, we keep the AppShell wrapper below.

function fmtMoney(n: number, ccy = "USD") {
  if (typeof n !== "number") return "—";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy }).format(n); }
  catch { return `${ccy} ${n}`; }
}
function fmtDate(s?: string | null) { return s ? new Date(s).toLocaleDateString() : "—"; }

function useTrackx() {
  const fn = useServerFn(trackxCall);
  return async (action: string, params: Record<string, any> = {}) => fn({ data: { action, params } });
}

function LaptopTrackingPage() {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader
          eyebrow="IMT Trackx"
          title="Laptop Tracking"
          description="Manage client accounts, licenses, devices and billing for the IMT laptop tracking service."
        />
        <StatsBar />
        <Tabs defaultValue="accounts" className="w-full">
          <TabsList className="w-full flex flex-wrap h-auto justify-start gap-1">
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="licenses">Licenses</TabsTrigger>
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>
          <TabsContent value="accounts" className="mt-6"><AccountsTab /></TabsContent>
          <TabsContent value="licenses" className="mt-6"><LicensesTab /></TabsContent>
          <TabsContent value="devices" className="mt-6"><DevicesTab /></TabsContent>
          <TabsContent value="billing" className="mt-6"><BillingTab /></TabsContent>
        </Tabs>
      </PageContainer>
    </AppShell>
  );
}

/* ---------- Stats ---------- */
function StatsBar() {
  const call = useTrackx();
  const { user } = useAuth();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["trackx", "stats"],
    queryFn: () => call("stats"),
    staleTime: 30_000,
    enabled: !!user,
  });
  const s = data || {};
  const items = [
    { label: "Accounts", value: s.total_accounts ?? s.accounts ?? "—" },
    { label: "Active Licenses", value: s.active_licenses ?? s.licenses_active ?? "—" },
    { label: "Devices", value: s.total_devices ?? s.devices ?? "—" },
    { label: "Revenue", value: typeof s.total_revenue === "number" ? fmtMoney(s.total_revenue, s.currency || "USD") : (s.revenue ?? "—") },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((i) => (
        <Card key={i.label}>
          <CardContent className="p-4">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{i.label}</div>
            <div className="font-display text-2xl font-bold mt-1">{isLoading ? "…" : String(i.value)}</div>
          </CardContent>
        </Card>
      ))}
      <div className="col-span-2 md:col-span-4 -mt-1">
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh stats
        </Button>
      </div>
    </div>
  );
}

/* ---------- Accounts ---------- */
function AccountsTab() {
  const qc = useQueryClient();
  const call = useTrackx();
  const [creating, setCreating] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["trackx", "accounts"],
    queryFn: () => call("list_accounts", { per_page: 200 }),
  });
  const rows: any[] = data?.accounts || data?.users || data?.data || [];

  const del = useMutation({
    mutationFn: (user_id: string) => call("delete_account", { user_id }),
    onSuccess: () => { toast.success("Account deleted"); qc.invalidateQueries({ queryKey: ["trackx"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const reset = useMutation({
    mutationFn: (email: string) => call("send_password_reset", { email }),
    onSuccess: (res: any) => {
      const link = res?.action_link || res?.link;
      if (link) { navigator.clipboard.writeText(link).catch(() => {}); toast.success("Reset link copied to clipboard"); }
      else toast.success("Reset link sent");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Client Accounts</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1.5" />New Account</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead className="hidden md:table-cell">Name</TableHead>
              <TableHead className="hidden lg:table-cell">Plan</TableHead>
              <TableHead className="hidden lg:table-cell">Devices</TableHead>
              <TableHead className="hidden md:table-cell">Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No accounts yet</TableCell></TableRow>}
            {rows.map((a) => (
              <TableRow key={a.id || a.user_id || a.email}>
                <TableCell className="font-medium">{a.email}</TableCell>
                <TableCell className="hidden md:table-cell">{a.name || a.full_name || "—"}</TableCell>
                <TableCell className="hidden lg:table-cell capitalize">{a.plan_name || a.plan || "—"}</TableCell>
                <TableCell className="hidden lg:table-cell">{a.device_count ?? a.max_devices ?? "—"}</TableCell>
                <TableCell className="hidden md:table-cell">{fmtDate(a.created_at)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => reset.mutate(a.email)}>
                        <KeyRound className="h-4 w-4 mr-2" /> Send reset link
                      </DropdownMenuItem>
                      <UpdatePasswordMenuItem userId={a.id || a.user_id} />
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => {
                        if (confirm(`Delete ${a.email}? This is permanent.`)) del.mutate(a.id || a.user_id);
                      }}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete account
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <CreateAccountDialog open={creating} onOpenChange={setCreating} />
    </Card>
  );
}

function UpdatePasswordMenuItem({ userId }: { userId?: string }) {
  const call = useTrackx();
  return (
    <DropdownMenuItem
      onClick={async () => {
        if (!userId) return;
        const pw = prompt("Set new password (min 8 chars):");
        if (!pw || pw.length < 8) return;
        try { await call("update_password", { user_id: userId, password: pw }); toast.success("Password updated"); }
        catch (e: any) { toast.error(e.message); }
      }}
    >
      <ShieldOff className="h-4 w-4 mr-2" /> Set password…
    </DropdownMenuItem>
  );
}

function CreateAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const call = useTrackx();
  const [form, setForm] = useState({
    email: "", password: "", name: "", phone: "", company: "",
    plan_name: "business", billing_cycle: "annual", device_count: 5,
    generate_license: true, duration_months: 12,
  });
  const create = useMutation({
    mutationFn: async () => {
      const acc = await call("create_account", {
        email: form.email, password: form.password, name: form.name,
        phone: form.phone, company: form.company,
        plan_name: form.plan_name, billing_cycle: form.billing_cycle,
        device_count: Number(form.device_count),
      });
      const user_id = acc.user_id || acc.id;
      let lic: any = null;
      if (form.generate_license && user_id) {
        lic = await call("generate_license", {
          user_id, email: form.email,
          max_devices: Number(form.device_count),
          plan_name: form.plan_name, billing_cycle: form.billing_cycle,
          duration_months: Number(form.duration_months),
        });
      }
      return { acc, lic };
    },
    onSuccess: ({ lic }) => {
      qc.invalidateQueries({ queryKey: ["trackx"] });
      onOpenChange(false);
      if (lic?.license_key) {
        navigator.clipboard.writeText(lic.license_key).catch(() => {});
        toast.success(`Account created — license key copied: ${lic.license_key}`);
      } else toast.success("Account created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Onboard new client</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Email *"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Temporary password *"><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Temp#1234!" /></Field>
          <Field label="Full name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Company" className="sm:col-span-2"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
          <Field label="Plan">
            <Select value={form.plan_name} onValueChange={(v) => setForm({ ...form, plan_name: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Billing cycle">
            <Select value={form.billing_cycle} onValueChange={(v) => setForm({ ...form, billing_cycle: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Devices"><Input type="number" min={1} value={form.device_count} onChange={(e) => setForm({ ...form, device_count: Number(e.target.value) })} /></Field>
          <Field label="License duration (months)"><Input type="number" min={1} value={form.duration_months} onChange={(e) => setForm({ ...form, duration_months: Number(e.target.value) })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.email || !form.password}>
            {create.isPending ? "Creating…" : "Create + generate license"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className}`}><Label className="text-xs">{label}</Label>{children}</div>;
}

/* ---------- Licenses ---------- */
function LicensesTab() {
  const qc = useQueryClient();
  const call = useTrackx();
  const [status, setStatus] = useState<string>("");
  const [emailFilter, setEmailFilter] = useState("");
  const [gen, setGen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["trackx", "licenses", status, emailFilter],
    queryFn: () => call("list_licenses", { ...(status ? { status } : {}), ...(emailFilter ? { email: emailFilter } : {}) }),
  });
  const rows: any[] = data?.licenses || data?.data || [];

  const act = (action: string) => useMutation({
    mutationFn: (license_key: string) => call(action, { license_key }),
    onSuccess: () => { toast.success(`${action.replace("_", " ")} ✓`); qc.invalidateQueries({ queryKey: ["trackx", "licenses"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const suspend = act("suspend_license");
  const reactivate = act("reactivate_license");
  const revoke = act("revoke_license");
  const cancel = act("cancel_license");

  const extend = useMutation({
    mutationFn: ({ license_key, months }: { license_key: string; months: number }) => call("extend_license", { license_key, months }),
    onSuccess: () => { toast.success("License extended"); qc.invalidateQueries({ queryKey: ["trackx", "licenses"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
        <CardTitle className="text-base">Licenses</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Filter by email" value={emailFilter} onChange={(e) => setEmailFilter(e.target.value)} className="h-9 w-full sm:w-56" />
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
          <Button size="sm" onClick={() => setGen(true)}><Plus className="h-4 w-4 mr-1.5" />Generate</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>License key</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead className="hidden lg:table-cell">Plan</TableHead>
              <TableHead>Devices</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Expires</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No licenses</TableCell></TableRow>}
            {rows.map((l) => (
              <TableRow key={l.id || l.license_key}>
                <TableCell className="font-mono text-xs">
                  <button className="hover:text-solar inline-flex items-center gap-1" onClick={() => {
                    navigator.clipboard.writeText(l.license_key).catch(() => {});
                    toast.success("Key copied");
                  }}>
                    {l.license_key} <Copy className="h-3 w-3 opacity-60" />
                  </button>
                </TableCell>
                <TableCell className="hidden md:table-cell">{l.email || "—"}</TableCell>
                <TableCell className="hidden lg:table-cell capitalize">{l.plan_name || "—"}</TableCell>
                <TableCell>{(l.devices_used ?? "?")}/{l.max_devices ?? "?"}</TableCell>
                <TableCell><StatusPill tone={l.status === "active" ? "success" : l.status === "suspended" ? "warning" : "danger"}>{l.status || "—"}</StatusPill></TableCell>
                <TableCell className="hidden md:table-cell">{fmtDate(l.expires_at)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        const m = Number(prompt("Extend by how many months?", "12") || 0);
                        if (m > 0) extend.mutate({ license_key: l.license_key, months: m });
                      }}><TimerReset className="h-4 w-4 mr-2" />Extend…</DropdownMenuItem>
                      {l.status === "active"
                        ? <DropdownMenuItem onClick={() => suspend.mutate(l.license_key)}><Ban className="h-4 w-4 mr-2" />Suspend</DropdownMenuItem>
                        : <DropdownMenuItem onClick={() => reactivate.mutate(l.license_key)}><PlayCircle className="h-4 w-4 mr-2" />Reactivate</DropdownMenuItem>}
                      <DropdownMenuItem onClick={() => cancel.mutate(l.license_key)}>Cancel</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => {
                        if (confirm("Revoke this license?")) revoke.mutate(l.license_key);
                      }}><Trash2 className="h-4 w-4 mr-2" />Revoke</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <GenerateLicenseDialog open={gen} onOpenChange={setGen} />
    </Card>
  );
}

function GenerateLicenseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const call = useTrackx();
  const [f, setF] = useState({ email: "", max_devices: 5, plan_name: "business", billing_cycle: "annual", duration_months: 12 });
  const m = useMutation({
    mutationFn: () => call("generate_license", { ...f, max_devices: Number(f.max_devices), duration_months: Number(f.duration_months) }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["trackx", "licenses"] });
      onOpenChange(false);
      if (res?.license_key) { navigator.clipboard.writeText(res.license_key).catch(() => {}); toast.success(`License copied: ${res.license_key}`); }
      else toast.success("License generated");
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Generate license</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Client email *" className="sm:col-span-2"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Max devices"><Input type="number" min={1} value={f.max_devices} onChange={(e) => setF({ ...f, max_devices: Number(e.target.value) })} /></Field>
          <Field label="Duration (months)"><Input type="number" min={1} value={f.duration_months} onChange={(e) => setF({ ...f, duration_months: Number(e.target.value) })} /></Field>
          <Field label="Plan">
            <Select value={f.plan_name} onValueChange={(v) => setF({ ...f, plan_name: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Billing cycle">
            <Select value={f.billing_cycle} onValueChange={(v) => setF({ ...f, billing_cycle: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !f.email}>{m.isPending ? "Generating…" : "Generate"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Devices ---------- */
function DevicesTab() {
  const qc = useQueryClient();
  const call = useTrackx();
  const [userId, setUserId] = useState("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["trackx", "devices", userId],
    queryFn: () => call("list_devices", userId ? { user_id: userId } : {}),
  });
  const rows: any[] = data?.devices || data?.data || [];
  const del = useMutation({
    mutationFn: (device_id: string) => call("delete_device", { device_id }),
    onSuccess: () => { toast.success("Device removed"); qc.invalidateQueries({ queryKey: ["trackx", "devices"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2"><Laptop2 className="h-4 w-4" />Devices</CardTitle>
        <div className="flex gap-2 flex-wrap">
          <Input placeholder="Filter by user_id (optional)" value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 w-full sm:w-72" />
          <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead className="hidden md:table-cell">Hostname</TableHead>
              <TableHead className="hidden lg:table-cell">OS</TableHead>
              <TableHead className="hidden md:table-cell">Last seen</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No devices</TableCell></TableRow>}
            {rows.map((d) => (
              <TableRow key={d.id || d.device_id}>
                <TableCell className="font-mono text-xs">{d.device_id || d.id}</TableCell>
                <TableCell className="hidden md:table-cell">{d.hostname || d.name || "—"}</TableCell>
                <TableCell className="hidden lg:table-cell">{d.os || d.platform || "—"}</TableCell>
                <TableCell className="hidden md:table-cell">{fmtDate(d.last_seen || d.updated_at)}</TableCell>
                <TableCell><StatusPill tone={d.status === "online" ? "success" : "neutral"}>{d.status || "—"}</StatusPill></TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                    if (confirm("Remove this device?")) del.mutate(d.id || d.device_id);
                  }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------- Billing ---------- */
function BillingTab() {
  const qc = useQueryClient();
  const call = useTrackx();
  const [userId, setUserId] = useState("");
  const [rec, setRec] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["trackx", "payments", userId],
    queryFn: () => call("list_payments", userId ? { user_id: userId } : {}),
  });
  const rows: any[] = data?.payments || data?.data || [];
  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" />Payments</CardTitle>
        <div className="flex gap-2 flex-wrap">
          <Input placeholder="Filter by user_id" value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 w-full sm:w-72" />
          <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
          <Button size="sm" onClick={() => setRec(true)}><Plus className="h-4 w-4 mr-1.5" />Record payment</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead className="hidden md:table-cell">User</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="hidden md:table-cell">Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No payments</TableCell></TableRow>}
            {rows.map((p) => (
              <TableRow key={p.id || p.invoice_number}>
                <TableCell className="font-mono text-xs">{p.invoice_number || p.id}</TableCell>
                <TableCell className="hidden md:table-cell">{p.user_email || p.user_id || "—"}</TableCell>
                <TableCell>{fmtMoney(Number(p.amount), p.currency || "USD")}</TableCell>
                <TableCell className="hidden md:table-cell">{p.description || "—"}</TableCell>
                <TableCell><StatusPill tone={p.status === "paid" ? "success" : p.status === "failed" ? "danger" : "warning"}>{p.status || "—"}</StatusPill></TableCell>
                <TableCell className="hidden lg:table-cell">{fmtDate(p.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <RecordPaymentDialog open={rec} onOpenChange={setRec} />
    </Card>
  );
}

function RecordPaymentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const call = useTrackx();
  const [f, setF] = useState({ user_id: "", amount: 0, currency: "USD", description: "", invoice_number: "", status: "paid", license_id: "" });
  const m = useMutation({
    mutationFn: () => call("record_payment", { ...f, amount: Number(f.amount) }),
    onSuccess: () => { toast.success("Payment recorded"); qc.invalidateQueries({ queryKey: ["trackx", "payments"] }); onOpenChange(false); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="User ID *" className="sm:col-span-2"><Input value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })} /></Field>
          <Field label="Amount *"><Input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
          <Field label="Currency"><Input value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
          <Field label="Invoice #"><Input value={f.invoice_number} onChange={(e) => setF({ ...f, invoice_number: e.target.value })} /></Field>
          <Field label="Status">
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Description" className="sm:col-span-2"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="License ID (optional)" className="sm:col-span-2"><Input value={f.license_id} onChange={(e) => setF({ ...f, license_id: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !f.user_id || !f.amount}>{m.isPending ? "Recording…" : "Record"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
