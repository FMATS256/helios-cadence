import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getSophosConnection, syncSophosQueue } from "@/lib/sophos.functions";
import { PageShell, SectionHeader, StatusBadge, EmptyState, type StatusTone } from "@/components/enterprise";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ShieldCheck, Building2, KeyRound, RefreshCw, Check, X, PlugZap } from "lucide-react";

export const Route = createFileRoute("/sophos")({
  head: () => ({
    meta: [
      { title: "Sophos Licensing — IMT Operations" },
      { name: "description", content: "Prepare Sophos client tenants and licence orders with Finance approval, ready for automatic provisioning." },
      { property: "og:title", content: "Sophos Licensing — IMT Operations" },
      { property: "og:description", content: "Sophos tenants, licence requests and approvals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SophosPage,
});

const PRODUCTS = [
  "Intercept X Essentials", "Intercept X Advanced", "Intercept X Advanced with XDR",
  "Managed Detection & Response (MDR) Essentials", "MDR Complete", "Intercept X for Server",
  "Email Security", "Firewall (XGS) Subscription", "Phish Threat", "Other",
];

const TONE: Record<string, StatusTone> = {
  awaiting_approval: "warning", approved: "info", awaiting_api: "solar", queued: "solar",
  provisioned: "success", fulfilled: "success", rejected: "danger", failed: "danger",
};
const label = (s: string) => s.replace(/_/g, " ");

function SophosPage() {
  const { user, loading } = useAuth();
  const ready = !loading && !!user;
  const qc = useQueryClient();
  const connFn = useServerFn(getSophosConnection);
  const syncFn = useServerFn(syncSophosQueue);

  const conn = useQuery({ queryKey: ["sophos-conn"], queryFn: () => connFn(), enabled: ready });
  const customers = useQuery({
    queryKey: ["sophos-customers"], enabled: ready,
    queryFn: async () => (await supabase.from("customers").select("id, name, account_number").order("name")).data ?? [],
  });
  const tenants = useQuery({
    queryKey: ["sophos-tenants"], enabled: ready,
    queryFn: async () => (await supabase.from("sophos_tenants").select("*, customers(name, account_number)").order("created_at", { ascending: false })).data ?? [],
  });
  const orders = useQuery({
    queryKey: ["sophos-orders"], enabled: ready,
    queryFn: async () => (await supabase.from("sophos_license_orders").select("*, customers(name, account_number)").order("created_at", { ascending: false })).data ?? [],
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["sophos-tenants"] }).then(() => qc.invalidateQueries({ queryKey: ["sophos-orders"] }));

  const [t, setT] = useState({ customer_id: "", tenant_name: "", data_region: "eu", admin_email: "" });
  const addTenant = useMutation({
    mutationFn: async () => {
      if (!t.customer_id || !t.tenant_name.trim()) throw new Error("Choose a client and tenant name");
      const { error } = await supabase.from("sophos_tenants").insert({ ...t, admin_email: t.admin_email || null });
      if (error) throw new Error(error.code === "23505" ? "This client already has a Sophos tenant" : error.message);
    },
    onSuccess: () => { toast.success("Tenant queued for Sophos"); setT({ customer_id: "", tenant_name: "", data_region: "eu", admin_email: "" }); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [o, setO] = useState({ customer_id: "", product: PRODUCTS[1], quantity: "1", term_months: "12", order_type: "new", existing_serial: "", expiry_date: "", notes: "" });
  const addOrder = useMutation({
    mutationFn: async () => {
      if (!o.customer_id || !user) throw new Error("Choose a client");
      const qty = Number(o.quantity);
      if (!Number.isInteger(qty) || qty < 1) throw new Error("Quantity must be a whole number");
      const tenant = tenants.data?.find((x) => x.customer_id === o.customer_id);
      const { error } = await supabase.from("sophos_license_orders").insert({
        customer_id: o.customer_id, tenant_id: tenant?.id ?? null, product: o.product, quantity: qty,
        term_months: Number(o.term_months), order_type: o.order_type, existing_serial: o.existing_serial || null,
        expiry_date: o.expiry_date || null, notes: o.notes || null, requested_by: user.id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Licence request sent for Finance approval"); setO((p) => ({ ...p, customer_id: "", quantity: "1", existing_serial: "", expiry_date: "", notes: "" })); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("sophos_license_orders").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Order updated"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const sync = useMutation({ mutationFn: () => syncFn(), onSuccess: (r) => toast[r.ok ? "success" : "info"](r.message) });

  const pending = orders.data?.filter((x) => x.status === "awaiting_approval").length ?? 0;
  const queued = (orders.data?.filter((x) => x.status === "awaiting_api" || x.status === "approved").length ?? 0)
    + (tenants.data?.filter((x) => x.status === "awaiting_api").length ?? 0);

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Cybersecurity"
        title="Sophos Licensing"
        description="Prepare client tenants and licence orders now. Approved items provision automatically once Sophos is connected."
        actions={<Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}><RefreshCw className="h-4 w-4 mr-2" />Push queue to Sophos</Button>}
      />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <PlugZap className="h-5 w-5 text-primary" />
          <div className="flex-1 min-w-[200px]">
            <div className="font-semibold">Sophos Central Partner connection</div>
            <div className="text-sm text-muted-foreground">
              {conn.data?.connected ? "Credentials found." : "Waiting for Sophos API credentials (Client ID and Secret) from Partner Support."}
            </div>
          </div>
          <StatusBadge tone={conn.data?.connected ? "success" : "warning"}>{conn.data?.connected ? "Connected" : "Not connected"}</StatusBadge>
          <StatusBadge tone="warning">{pending} awaiting approval</StatusBadge>
          <StatusBadge tone="solar">{queued} queued</StatusBadge>
        </CardContent>
      </Card>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Licence orders</TabsTrigger>
          <TabsTrigger value="tenants">Client tenants</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" />Request a licence</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Client"><CustomerSelect value={o.customer_id} onChange={(v) => setO({ ...o, customer_id: v })} list={customers.data} /></Field>
              <Field label="Product">
                <Select value={o.product} onValueChange={(v) => setO({ ...o, product: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRODUCTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Order type">
                <Select value={o.order_type} onValueChange={(v) => setO({ ...o, order_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem><SelectItem value="renewal">Renewal</SelectItem>
                    <SelectItem value="upgrade">Upgrade</SelectItem><SelectItem value="add_seats">Add seats</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Seats / devices"><Input type="number" min={1} value={o.quantity} onChange={(e) => setO({ ...o, quantity: e.target.value })} /></Field>
              <Field label="Term">
                <Select value={o.term_months} onValueChange={(v) => setO({ ...o, term_months: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["1", "12", "24", "36"].map((m) => <SelectItem key={m} value={m}>{m === "1" ? "Monthly (MSP Flex)" : `${m} months`}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Existing licence / serial"><Input value={o.existing_serial} onChange={(e) => setO({ ...o, existing_serial: e.target.value })} placeholder="For renewals" /></Field>
              <Field label="Current expiry"><Input type="date" value={o.expiry_date} onChange={(e) => setO({ ...o, expiry_date: e.target.value })} /></Field>
              <Field label="Notes"><Textarea rows={1} value={o.notes} onChange={(e) => setO({ ...o, notes: e.target.value })} /></Field>
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <Button onClick={() => addOrder.mutate()} disabled={addOrder.isPending}>Send for Finance approval</Button>
              </div>
            </CardContent>
          </Card>

          {orders.data?.length ? (
            <div className="grid gap-3">
              {orders.data.map((x) => (
                <Card key={x.id}><CardContent className="p-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-semibold">{x.product} × {x.quantity}</div>
                    <div className="text-sm text-muted-foreground">
                      {x.customers?.name} ({x.customers?.account_number}) · {label(x.order_type)} · {x.term_months === 1 ? "monthly" : `${x.term_months} months`}
                      {x.existing_serial ? ` · ${x.existing_serial}` : ""}{x.expiry_date ? ` · expires ${x.expiry_date}` : ""}
                    </div>
                  </div>
                  <StatusBadge tone={TONE[x.status] ?? "neutral"}>{label(x.status)}</StatusBadge>
                  {x.status === "awaiting_approval" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => decide.mutate({ id: x.id, status: "approved" })}><Check className="h-4 w-4 mr-1" />Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: x.id, status: "rejected" })}><X className="h-4 w-4 mr-1" />Reject</Button>
                    </div>
                  )}
                  {x.status === "approved" && (
                    <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: x.id, status: "awaiting_api" })}>Queue for Sophos</Button>
                  )}
                </CardContent></Card>
              ))}
            </div>
          ) : <EmptyState title="No licence orders yet" description="Requests appear here for Finance approval." icon={KeyRound} />}
        </TabsContent>

        <TabsContent value="tenants" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" />Prepare a client tenant</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Client"><CustomerSelect value={t.customer_id} onChange={(v) => {
                const c = customers.data?.find((x) => x.id === v);
                setT({ ...t, customer_id: v, tenant_name: t.tenant_name || c?.name || "" });
              }} list={customers.data} /></Field>
              <Field label="Tenant name"><Input value={t.tenant_name} onChange={(e) => setT({ ...t, tenant_name: e.target.value })} /></Field>
              <Field label="Data region">
                <Select value={t.data_region} onValueChange={(v) => setT({ ...t, data_region: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eu">Europe (Ireland / Germany)</SelectItem><SelectItem value="us">United States</SelectItem>
                    <SelectItem value="ca">Canada</SelectItem><SelectItem value="au">Australia</SelectItem><SelectItem value="jp">Japan</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Client admin email"><Input type="email" value={t.admin_email} onChange={(e) => setT({ ...t, admin_email: e.target.value })} /></Field>
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <Button onClick={() => addTenant.mutate()} disabled={addTenant.isPending}>Queue tenant</Button>
              </div>
            </CardContent>
          </Card>
          {tenants.data?.length ? (
            <div className="grid gap-3">
              {tenants.data.map((x) => (
                <Card key={x.id}><CardContent className="p-4 flex flex-wrap items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-semibold">{x.tenant_name}</div>
                    <div className="text-sm text-muted-foreground">{x.customers?.name} ({x.customers?.account_number}) · region {x.data_region.toUpperCase()}{x.sophos_tenant_id ? ` · ${x.sophos_tenant_id}` : ""}</div>
                  </div>
                  <StatusBadge tone={TONE[x.status] ?? "neutral"}>{label(x.status)}</StatusBadge>
                </CardContent></Card>
              ))}
            </div>
          ) : <EmptyState title="No tenants yet" description="Queue a tenant for each client you protect with Sophos." icon={Building2} />}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{l}</Label>{children}</div>;
}

function CustomerSelect({ value, onChange, list }: { value: string; onChange: (v: string) => void; list?: { id: string; name: string; account_number: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Choose client" /></SelectTrigger>
      <SelectContent>{(list ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.account_number}</SelectItem>)}</SelectContent>
    </Select>
  );
}
