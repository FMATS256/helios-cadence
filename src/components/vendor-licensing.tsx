import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getVendorConnections, syncVendorQueue } from "@/lib/sophos.functions";
import { VENDORS, vendorById, daysUntil, renewalState, type VendorId } from "@/lib/vendors";
import { StatusBadge, EmptyState, type StatusTone } from "@/components/enterprise";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, KeyRound, RefreshCw, Check, X, PlugZap, CalendarClock, PackageCheck, Plus } from "lucide-react";

const TONE: Record<string, StatusTone> = {
  awaiting_approval: "warning", approved: "info", awaiting_api: "solar", active: "success",
  fulfilled: "success", rejected: "danger", failed: "danger", expired: "danger", cancelled: "neutral", suspended: "neutral",
};
const RENEW_TONE = { expired: "danger", due: "warning", soon: "solar", ok: "success", unknown: "neutral" } as const;
const label = (s: string) => s.replace(/_/g, " ");
const ORDER_TYPES = [["new", "New licence"], ["renewal", "Renewal"], ["upgrade", "Upgrade"], ["add_seats", "Add seats"], ["reduce_seats", "Reduce seats"], ["cancel", "Cancel"]] as const;

type Customer = { id: string; name: string; account_number: string };
const blankOrder = { customer_id: "", license_id: "", product: "", quantity: "1", term_months: "12", order_type: "new", existing_serial: "", expiry_date: "", unit_price: "", notes: "" };

export function VendorLicensing({ vendor: fixed }: { vendor?: VendorId }) {
  const { user, loading } = useAuth();
  const ready = !loading && !!user;
  const qc = useQueryClient();
  const [vendorId, setVendorId] = useState<VendorId>(fixed ?? "sophos");
  const v = vendorById(fixed ?? vendorId);
  const connFn = useServerFn(getVendorConnections);
  const syncFn = useServerFn(syncVendorQueue);
  const [tab, setTab] = useState("renewals");

  const conn = useQuery({ queryKey: ["vendor-conn"], queryFn: () => connFn(), enabled: ready });
  const customers = useQuery({
    queryKey: ["vendor-customers"], enabled: ready,
    queryFn: async () => ((await supabase.from("customers").select("id, name:company_name, account_number").order("company_name")).data ?? []) as Customer[],
  });
  const tenants = useQuery({
    queryKey: ["vendor-tenants", v.id], enabled: ready,
    queryFn: async () => (await supabase.from("vendor_tenants").select("*, customers(company_name, account_number)").eq("vendor", v.id).order("created_at", { ascending: false })).data ?? [],
  });
  const licenses = useQuery({
    queryKey: ["vendor-licenses", v.id], enabled: ready,
    queryFn: async () => (await supabase.from("vendor_licenses").select("*, customers(company_name, account_number)").eq("vendor", v.id).order("expiry_date", { ascending: true, nullsFirst: false })).data ?? [],
  });
  const orders = useQuery({
    queryKey: ["vendor-orders", v.id], enabled: ready,
    queryFn: async () => (await supabase.from("vendor_license_orders").select("*, customers(company_name, account_number)").eq("vendor", v.id).order("created_at", { ascending: false })).data ?? [],
  });
  const refresh = () => Promise.all(["vendor-tenants", "vendor-licenses", "vendor-orders"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  // --- forms
  const [t, setT] = useState({ customer_id: "", tenant_name: "", tenant_domain: "", data_region: "", admin_email: "" });
  const [o, setO] = useState({ ...blankOrder, product: v.products[0] });
  const [rec, setRec] = useState<null | { customer_id: string; product: string; seats: string; license_key: string; expiry_date: string; billing_cycle: string }>(null);
  const [fulfil, setFulfil] = useState<null | { id: string; key: string; expiry: string }>(null);

  const addTenant = useMutation({
    mutationFn: async () => {
      if (!t.customer_id || !t.tenant_name.trim()) throw new Error("Choose a client and tenant name");
      const { error } = await supabase.from("vendor_tenants").insert({
        vendor: v.id, customer_id: t.customer_id, tenant_name: t.tenant_name.trim(),
        tenant_domain: t.tenant_domain || null, data_region: t.data_region || null, admin_email: t.admin_email || null,
      });
      if (error) throw new Error(error.code === "23505" ? `This client already has a ${v.name} tenant` : error.message);
    },
    onSuccess: () => { toast.success(`${v.tenantLabel} queued`); setT({ customer_id: "", tenant_name: "", tenant_domain: "", data_region: "", admin_email: "" }); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addOrder = useMutation({
    mutationFn: async () => {
      if (!o.customer_id || !user) throw new Error("Choose a client");
      const qty = Number(o.quantity);
      if (!Number.isInteger(qty) || qty < 1) throw new Error("Quantity must be a whole number");
      if (o.order_type !== "new" && !o.license_id && !o.existing_serial) throw new Error("Pick the existing licence or enter its serial");
      const tenant = tenants.data?.find((x) => x.customer_id === o.customer_id);
      const { error } = await supabase.from("vendor_license_orders").insert({
        vendor: v.id, customer_id: o.customer_id, tenant_id: tenant?.id ?? null, license_id: o.license_id || null,
        product: o.product, quantity: qty, term_months: Number(o.term_months), order_type: o.order_type,
        existing_serial: o.existing_serial || null, expiry_date: o.expiry_date || null,
        unit_price: o.unit_price ? Number(o.unit_price) : null, notes: o.notes || null, requested_by: user.id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Request sent for Finance approval"); setO({ ...blankOrder, product: v.products[0] }); setTab("orders"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (p: { id: string; status: string; key?: string; expiry?: string }) => {
      const { error } = await supabase.from("vendor_license_orders").update({
        status: p.status, ...(p.key !== undefined ? { fulfilled_license_key: p.key || null } : {}),
        ...(p.expiry !== undefined ? { fulfilled_expiry: p.expiry || null } : {}),
      }).eq("id", p.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Order updated"); setFulfil(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordLicense = useMutation({
    mutationFn: async () => {
      if (!rec?.customer_id) throw new Error("Choose a client");
      const tenant = tenants.data?.find((x) => x.customer_id === rec.customer_id);
      const { error } = await supabase.from("vendor_licenses").insert({
        vendor: v.id, customer_id: rec.customer_id, tenant_id: tenant?.id ?? null, product: rec.product,
        seats: Math.max(1, Number(rec.seats) || 1), license_key: rec.license_key || null,
        expiry_date: rec.expiry_date || null, billing_cycle: rec.billing_cycle,
      });
      if (error) throw new Error(error.message.includes("row-level") ? "Only Finance or administrators can record existing licences" : error.message);
    },
    onSuccess: () => { toast.success("Licence recorded"); setRec(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAutoRenew = useMutation({
    mutationFn: async (p: { id: string; value: boolean }) => {
      const { error } = await supabase.from("vendor_licenses").update({ auto_renew: p.value }).eq("id", p.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });

  const sync = useMutation({ mutationFn: () => syncFn({ data: { vendor: v.id } }), onSuccess: (r) => toast[r.ok ? "success" : "info"](r.message) });

  const startChange = (lic: { id: string; customer_id: string; product: string; seats: number; license_key: string | null; expiry_date: string | null }, type: string) => {
    setO({ ...blankOrder, customer_id: lic.customer_id, license_id: lic.id, product: lic.product, quantity: type === "renewal" || type === "upgrade" ? String(lic.seats) : "1", order_type: type, existing_serial: lic.license_key ?? "", expiry_date: lic.expiry_date ?? "" });
    setTab("request");
  };

  const lic = licenses.data ?? [];
  const withDays = useMemo(() => lic.map((l) => ({ ...l, days: daysUntil(l.expiry_date) })), [lic]);
  const renewals = withDays.filter((l) => l.status === "active" && l.days !== null && l.days <= 60);
  const pending = orders.data?.filter((x) => x.status === "awaiting_approval").length ?? 0;
  const seats = lic.filter((l) => l.status === "active").reduce((s, l) => s + l.seats, 0);
  const customerLicenses = lic.filter((l) => l.customer_id === o.customer_id && l.status !== "cancelled");
  const connected = conn.data?.[v.id];

  return (
    <div className="space-y-4">
      {!fixed && (
        <div className="flex flex-wrap gap-2">
          {VENDORS.map((x) => (
            <Button key={x.id} size="sm" variant={x.id === vendorId ? "default" : "outline"} onClick={() => { setVendorId(x.id); setO({ ...blankOrder, product: x.products[0] }); }}>
              {x.name}
            </Button>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <PlugZap className="h-5 w-5 text-primary" />
          <div className="flex-1 min-w-[200px]">
            <div className="font-semibold">{v.name} connection</div>
            <div className="text-sm text-muted-foreground">{connected ? "Credentials found." : `Waiting for: ${v.credentialHint}`}</div>
          </div>
          <StatusBadge tone={connected ? "success" : "warning"}>{connected ? "Connected" : "Not connected"}</StatusBadge>
          <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}><RefreshCw className="h-4 w-4 mr-1" />Push queue</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Active licences" value={lic.filter((l) => l.status === "active").length} />
        <Stat label="Seats under management" value={seats} />
        <Stat label="Renewals due (60 days)" value={renewals.length} />
        <Stat label="Awaiting approval" value={pending} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="renewals">Renewals</TabsTrigger>
          <TabsTrigger value="licenses">Licences</TabsTrigger>
          <TabsTrigger value="request">New / change</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
        </TabsList>

        <TabsContent value="renewals" className="space-y-3">
          {renewals.length ? renewals.map((l) => (
            <LicenseRow key={l.id} l={l} onAction={startChange} onAuto={(val) => toggleAutoRenew.mutate({ id: l.id, value: val })} />
          )) : <EmptyState title="No renewals due in the next 60 days" description="Licences close to expiry show here." icon={CalendarClock} />}
        </TabsContent>

        <TabsContent value="licenses" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setRec({ customer_id: "", product: v.products[0], seats: "1", license_key: "", expiry_date: "", billing_cycle: "annual" })}>
              <Plus className="h-4 w-4 mr-1" />Record existing licence
            </Button>
          </div>
          {withDays.length ? withDays.map((l) => (
            <LicenseRow key={l.id} l={l} onAction={startChange} onAuto={(val) => toggleAutoRenew.mutate({ id: l.id, value: val })} />
          )) : <EmptyState title={`No ${v.name} licences yet`} description="Fulfilled orders and recorded licences appear here." icon={KeyRound} />}
        </TabsContent>

        <TabsContent value="request">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" />{v.name} licence request</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Client"><CustomerSelect value={o.customer_id} onChange={(c) => setO({ ...o, customer_id: c, license_id: "" })} list={customers.data} /></Field>
              <Field label="Request type">
                <Select value={o.order_type} onValueChange={(x) => setO({ ...o, order_type: x, license_id: x === "new" ? "" : o.license_id })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ORDER_TYPES.map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {o.order_type !== "new" && (
                <Field label="Existing licence">
                  <Select value={o.license_id} onValueChange={(id) => {
                    const l = lic.find((x) => x.id === id);
                    setO({ ...o, license_id: id, product: l?.product ?? o.product, existing_serial: l?.license_key ?? "", expiry_date: l?.expiry_date ?? "" });
                  }}>
                    <SelectTrigger><SelectValue placeholder={customerLicenses.length ? "Choose licence" : "None on record"} /></SelectTrigger>
                    <SelectContent>{customerLicenses.map((l) => <SelectItem key={l.id} value={l.id}>{l.product} · {l.seats} seats</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="Product">
                <Select value={o.product} onValueChange={(x) => setO({ ...o, product: x })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Array.from(new Set([o.product, ...v.products])).filter(Boolean).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={o.order_type === "add_seats" || o.order_type === "reduce_seats" ? "Seats to change" : "Seats / users / devices"}>
                <Input type="number" min={1} value={o.quantity} onChange={(e) => setO({ ...o, quantity: e.target.value })} />
              </Field>
              <Field label="Term">
                <Select value={o.term_months} onValueChange={(x) => setO({ ...o, term_months: x })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["1", "12", "24", "36"].map((m) => <SelectItem key={m} value={m}>{m === "1" ? "Monthly" : `${m} months`}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Serial / licence key"><Input value={o.existing_serial} onChange={(e) => setO({ ...o, existing_serial: e.target.value })} placeholder="For renewals" /></Field>
              <Field label="Current expiry"><Input type="date" value={o.expiry_date} onChange={(e) => setO({ ...o, expiry_date: e.target.value })} /></Field>
              <Field label="Unit price (USD, optional)"><Input type="number" min={0} step="0.01" value={o.unit_price} onChange={(e) => setO({ ...o, unit_price: e.target.value })} /></Field>
              <div className="sm:col-span-2 lg:col-span-3"><Field label="Notes"><Textarea rows={1} value={o.notes} onChange={(e) => setO({ ...o, notes: e.target.value })} /></Field></div>
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <Button onClick={() => addOrder.mutate()} disabled={addOrder.isPending}>Send for Finance approval</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-3">
          {orders.data?.length ? orders.data.map((x) => (
            <Card key={x.id}><CardContent className="p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <div className="font-semibold">{label(x.order_type)} · {x.product} × {x.quantity}</div>
                <div className="text-sm text-muted-foreground">
                  {x.customers?.company_name} ({x.customers?.account_number}) · {x.term_months === 1 ? "monthly" : `${x.term_months} months`}
                  {x.unit_price != null ? ` · USD ${Number(x.unit_price).toFixed(2)}/unit` : ""}
                  {x.existing_serial ? ` · ${x.existing_serial}` : ""}
                </div>
              </div>
              <StatusBadge tone={TONE[x.status] ?? "neutral"}>{label(x.status)}</StatusBadge>
              {x.status === "awaiting_approval" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setStatus.mutate({ id: x.id, status: "approved" })}><Check className="h-4 w-4 mr-1" />Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: x.id, status: "rejected" })}><X className="h-4 w-4 mr-1" />Reject</Button>
                </div>
              )}
              {(x.status === "approved" || x.status === "awaiting_api") && (
                <div className="flex gap-2">
                  {x.status === "approved" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: x.id, status: "awaiting_api" })}>Queue for {v.name}</Button>}
                  <Button size="sm" onClick={() => setFulfil({ id: x.id, key: x.existing_serial ?? "", expiry: "" })}><PackageCheck className="h-4 w-4 mr-1" />Mark fulfilled</Button>
                </div>
              )}
            </CardContent></Card>
          )) : <EmptyState title="No orders yet" description="New licences, renewals and seat changes appear here." icon={KeyRound} />}
        </TabsContent>

        <TabsContent value="tenants" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" />Provision {v.tenantLabel}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Client"><CustomerSelect value={t.customer_id} onChange={(c) => {
                const cu = customers.data?.find((x) => x.id === c);
                setT({ ...t, customer_id: c, tenant_name: t.tenant_name || cu?.name || "" });
              }} list={customers.data} /></Field>
              <Field label="Tenant name"><Input value={t.tenant_name} onChange={(e) => setT({ ...t, tenant_name: e.target.value })} /></Field>
              {v.domainLabel && <Field label={v.domainLabel}><Input value={t.tenant_domain} onChange={(e) => setT({ ...t, tenant_domain: e.target.value })} /></Field>}
              {v.regions && (
                <Field label="Data region">
                  <Select value={t.data_region} onValueChange={(x) => setT({ ...t, data_region: x })}>
                    <SelectTrigger><SelectValue placeholder="Choose region" /></SelectTrigger>
                    <SelectContent>{v.regions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="Client admin email"><Input type="email" value={t.admin_email} onChange={(e) => setT({ ...t, admin_email: e.target.value })} /></Field>
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <Button onClick={() => addTenant.mutate()} disabled={addTenant.isPending}>Queue tenant</Button>
              </div>
            </CardContent>
          </Card>
          {tenants.data?.length ? tenants.data.map((x) => (
            <Card key={x.id}><CardContent className="p-4 flex flex-wrap items-center gap-3">
              <Building2 className="h-5 w-5 text-primary" />
              <div className="flex-1 min-w-[200px]">
                <div className="font-semibold">{x.tenant_name}</div>
                <div className="text-sm text-muted-foreground">
                  {x.customers?.company_name} ({x.customers?.account_number})
                  {x.tenant_domain ? ` · ${x.tenant_domain}` : ""}{x.data_region ? ` · ${x.data_region.toUpperCase()}` : ""}{x.admin_email ? ` · ${x.admin_email}` : ""}
                </div>
              </div>
              <StatusBadge tone={TONE[x.status] ?? "solar"}>{label(x.status)}</StatusBadge>
            </CardContent></Card>
          )) : <EmptyState title="No tenants yet" description={`Queue a ${v.tenantLabel} for each client.`} icon={Building2} />}
        </TabsContent>
      </Tabs>

      <Dialog open={!!fulfil} onOpenChange={(open) => !open && setFulfil(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark order fulfilled</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Licence key / subscription ID"><Input value={fulfil?.key ?? ""} onChange={(e) => fulfil && setFulfil({ ...fulfil, key: e.target.value })} /></Field>
            <Field label="New expiry date (leave blank to calculate from term)"><Input type="date" value={fulfil?.expiry ?? ""} onChange={(e) => fulfil && setFulfil({ ...fulfil, expiry: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button onClick={() => fulfil && setStatus.mutate({ id: fulfil.id, status: "fulfilled", key: fulfil.key, expiry: fulfil.expiry })} disabled={setStatus.isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rec} onOpenChange={(open) => !open && setRec(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record existing {v.name} licence</DialogTitle></DialogHeader>
          {rec && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client"><CustomerSelect value={rec.customer_id} onChange={(c) => setRec({ ...rec, customer_id: c })} list={customers.data} /></Field>
              <Field label="Product">
                <Select value={rec.product} onValueChange={(x) => setRec({ ...rec, product: x })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{v.products.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Seats"><Input type="number" min={1} value={rec.seats} onChange={(e) => setRec({ ...rec, seats: e.target.value })} /></Field>
              <Field label="Billing">
                <Select value={rec.billing_cycle} onValueChange={(x) => setRec({ ...rec, billing_cycle: x })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="annual">Annual</SelectItem><SelectItem value="multi_year">Multi-year</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="Licence key"><Input value={rec.license_key} onChange={(e) => setRec({ ...rec, license_key: e.target.value })} /></Field>
              <Field label="Expiry date"><Input type="date" value={rec.expiry_date} onChange={(e) => setRec({ ...rec, expiry_date: e.target.value })} /></Field>
            </div>
          )}
          <DialogFooter><Button onClick={() => recordLicense.mutate()} disabled={recordLicense.isPending}>Save licence</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type LicRow = { id: string; customer_id: string; product: string; seats: number; license_key: string | null; expiry_date: string | null; status: string; auto_renew: boolean; days: number | null; customers: { company_name: string; account_number: string } | null };

function LicenseRow({ l, onAction, onAuto }: { l: LicRow; onAction: (l: LicRow, type: string) => void; onAuto: (v: boolean) => void }) {
  const state = l.status === "active" ? renewalState(l.days) : "unknown";
  return (
    <Card><CardContent className="p-4 flex flex-wrap items-center gap-3">
      <KeyRound className="h-5 w-5 text-primary" />
      <div className="flex-1 min-w-[220px]">
        <div className="font-semibold">{l.product} · {l.seats} seats</div>
        <div className="text-sm text-muted-foreground">
          {l.customers?.company_name} ({l.customers?.account_number}){l.license_key ? ` · ${l.license_key}` : ""}
          {l.expiry_date ? ` · expires ${l.expiry_date}` : " · no expiry recorded"}
        </div>
      </div>
      <StatusBadge tone={TONE[l.status] ?? "neutral"}>{label(l.status)}</StatusBadge>
      {l.status === "active" && l.days !== null && (
        <StatusBadge tone={RENEW_TONE[state]}>{l.days < 0 ? `expired ${-l.days}d ago` : `${l.days}d left`}</StatusBadge>
      )}
      <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={l.auto_renew} onChange={(e) => onAuto(e.target.checked)} />Auto-renew</label>
      {l.status !== "cancelled" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onAction(l, "renewal")}>Renew</Button>
          <Button size="sm" variant="outline" onClick={() => onAction(l, "add_seats")}>Add seats</Button>
          <Button size="sm" variant="outline" onClick={() => onAction(l, "upgrade")}>Upgrade</Button>
          <Button size="sm" variant="outline" onClick={() => onAction(l, "cancel")}>Cancel</Button>
        </div>
      )}
    </CardContent></Card>
  );
}

function Stat({ label: l, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className="text-2xl font-semibold">{value}</div></CardContent></Card>;
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{l}</Label>{children}</div>;
}

function CustomerSelect({ value, onChange, list }: { value: string; onChange: (v: string) => void; list?: Customer[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Choose client" /></SelectTrigger>
      <SelectContent>{(list ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.account_number}</SelectItem>)}</SelectContent>
    </Select>
  );
}
