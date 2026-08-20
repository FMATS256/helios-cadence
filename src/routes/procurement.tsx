import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, DetailCard, ActionBar,
  StatusBadge, toneForStatus, RefreshButton, shortDate,
} from "@/components/enterprise";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, ShoppingCart, Plus, Trash2, Pencil, Coins, PackageCheck, CheckCircle2 } from "lucide-react";
import { fmtCurrency } from "@/lib/currency.shared";
import {
  getProcurementWorkspace, upsertVendor, deleteVendor, savePurchaseOrder,
  setPurchaseOrderStatus, receivePurchaseOrder, deletePurchaseOrder,
  upsertExchangeRate, deleteExchangeRate,
} from "@/lib/procurement.functions";

export const Route = createFileRoute("/procurement")({
  head: () => ({
    meta: [
      { title: "Procurement & Vendors — IMT Operations Platform" },
      { name: "description", content: "Manage vendors, purchase orders, goods receipting and multi-currency exchange rates in one workspace." },
      { property: "og:title", content: "Procurement & Vendors — IMT Operations Platform" },
      { property: "og:description", content: "Vendors, purchase orders and multi-currency rates for IMT operations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProcurementPage,
});

const CATEGORIES = ["general", "hardware", "connectivity", "software & licenses", "cloud & hosting", "logistics", "professional services", "facilities"];
const TERMS = ["prepaid", "net_7", "net_14", "net_30", "net_60", "on_delivery"];
const PO_STATUSES = ["draft", "submitted", "approved", "ordered", "partially_received", "received", "cancelled"];

type Line = { description: string; quantity: number; unit_price: number };

function ProcurementPage() {
  const qc = useQueryClient();
  const wsFn = useServerFn(getProcurementWorkspace);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["procurement-workspace"],
    queryFn: async () => (await wsFn()) as any,
  });

  const vendors: any[] = data?.vendors ?? [];
  const orders: any[] = data?.orders ?? [];
  const rateRows: any[] = data?.rateRows ?? [];
  const rates: Record<string, number> = data?.rates ?? { USD: 1 };
  const stats = data?.stats;
  const currencies = Object.keys(rates).sort();

  const refresh = () => qc.invalidateQueries({ queryKey: ["procurement-workspace"] });

  /* -------- vendor dialog -------- */
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendor, setVendor] = useState<any>({});
  const vendorFn = useServerFn(upsertVendor);
  const saveVendor = useMutation({
    mutationFn: () => vendorFn({ data: vendor }),
    onSuccess: () => { toast.success("Vendor saved"); setVendorOpen(false); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });
  const delVendorFn = useServerFn(deleteVendor);
  const delVendor = useMutation({
    mutationFn: (id: string) => delVendorFn({ data: { id } }),
    onSuccess: () => { toast.success("Vendor deactivated"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  /* -------- purchase order dialog -------- */
  const [poOpen, setPoOpen] = useState(false);
  const [po, setPo] = useState<any>({});
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: 1, unit_price: 0 }]);
  const poFn = useServerFn(savePurchaseOrder);
  const savePo = useMutation({
    mutationFn: () => poFn({ data: { ...po, items: lines } }),
    onSuccess: () => { toast.success("Purchase order saved"); setPoOpen(false); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });
  const statusFn = useServerFn(setPurchaseOrderStatus);
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => statusFn({ data: v }),
    onSuccess: () => { toast.success("Status updated"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });
  const receiveFn = useServerFn(receivePurchaseOrder);
  const receive = useMutation({
    mutationFn: (id: string) => receiveFn({ data: { id } }),
    onSuccess: (r: any) => { toast.success(`Received${r?.stocked ? ` · ${r.stocked} item(s) stocked` : ""}`); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });
  const delPoFn = useServerFn(deletePurchaseOrder);
  const delPo = useMutation({
    mutationFn: (id: string) => delPoFn({ data: { id } }),
    onSuccess: () => { toast.success("Purchase order deleted"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  /* -------- currency dialog -------- */
  const [rateOpen, setRateOpen] = useState(false);
  const [rate, setRate] = useState<any>({ currency: "", rate: 1, effective_date: new Date().toISOString().slice(0, 10) });
  const rateFn = useServerFn(upsertExchangeRate);
  const saveRate = useMutation({
    mutationFn: () => rateFn({ data: rate }),
    onSuccess: () => { toast.success("Rate saved"); setRateOpen(false); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });
  const delRateFn = useServerFn(deleteExchangeRate);
  const delRate = useMutation({
    mutationFn: (id: string) => delRateFn({ data: { id } }),
    onSuccess: () => { toast.success("Rate removed"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);

  const chips = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Vendors", value: String(stats.vendorCount), color: "#1d4ed8" },
      { label: "Active Vendors", value: String(stats.activeVendors), color: "#15803d" },
      { label: "Open Orders", value: String(stats.openOrders), color: "#b45309" },
      { label: "Open Value (USD)", value: fmtCurrency(stats.openValue), color: "#4338ca" },
      { label: "Awaiting Approval", value: String(stats.awaitingApproval), color: "#be123c" },
      { label: "Spend This Month", value: fmtCurrency(stats.monthSpend), color: "#0d9488" },
      { label: "Late Deliveries", value: String(stats.overdueDeliveries), color: "#b91c1c" },
      { label: "Currencies", value: String(stats.currencies), color: "#7e22ce" },
    ];
  }, [stats]);

  const openVendor = (v?: any) => { setVendor(v ? { ...v } : { currency: "USD", category: "general", payment_terms: "net_30", status: "active", rating: 3 }); setVendorOpen(true); };
  const openPo = (o?: any) => {
    setPo(o ? { id: o.id, vendor_id: o.vendor_id, status: o.status, order_date: o.order_date, expected_date: o.expected_date, currency: o.currency, tax: o.tax, notes: o.notes } : { currency: "USD", status: "draft", order_date: new Date().toISOString().slice(0, 10), tax: 0 });
    setLines(o?.items?.length ? o.items.map((i: any) => ({ description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })) : [{ description: "", quantity: 1, unit_price: 0 }]);
    setPoOpen(true);
  };

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Supply Chain"
        title="Procurement & Vendor Management"
        description="Vendors, purchase orders, goods receipting and multi-currency rates — all values normalised to USD."
        actions={<RefreshButton onClick={refresh} loading={isFetching} />}
      />

      <StatChipRow chips={chips} cols={4} />

      <ActionBar
        actions={[
          { tone: "indigo", icon: Building2, label: "New Vendor", onClick: () => openVendor() },
          { tone: "emerald", icon: ShoppingCart, label: "New Purchase Order", onClick: () => openPo() },
          { tone: "amber", icon: Coins, label: "Update Exchange Rate", onClick: () => { setRate({ currency: "", rate: 1, effective_date: new Date().toISOString().slice(0, 10) }); setRateOpen(true); } },
        ]}
      />

      <Tabs defaultValue="vendors">
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="currency">Multi-Currency</TabsTrigger>
        </TabsList>

        <TabsContent value="vendors" className="mt-4">
          <DetailCard title="Vendor Register" padded={false}>
            <DataGrid
              rows={vendors}
              loading={isLoading}
              empty="No vendors yet — add your first supplier."
              columns={[
                { header: "Vendor", cell: (v: any) => <div><p className="font-medium">{v.name}</p><p className="text-xs text-muted-foreground">{v.code ?? "—"} · {v.category}</p></div> },
                { header: "Contact", cell: (v: any) => <div className="text-xs"><p>{v.contact_name ?? "—"}</p><p className="text-muted-foreground">{v.email ?? v.phone ?? ""}</p></div> },
                { header: "Currency", cell: (v: any) => v.currency },
                { header: "Terms", cell: (v: any) => (v.payment_terms || "").replace("_", " ") },
                { header: "Open POs", align: "right", cell: (v: any) => v.open_orders },
                { header: "Spend (USD)", align: "right", cell: (v: any) => fmtCurrency(v.spend_base) },
                { header: "Status", cell: (v: any) => <StatusBadge tone={toneForStatus(v.status)}>{v.status}</StatusBadge> },
                {
                  header: "", align: "right",
                  cell: (v: any) => (
                    <div className="flex justify-end gap-2">
                      <Button size="icon" variant="ghost" onClick={() => openVendor(v)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => delVendor.mutate(v.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ),
                },
              ]}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <DetailCard title="Purchase Orders" padded={false}>
            <DataGrid
              rows={orders}
              loading={isLoading}
              empty="No purchase orders raised yet."
              columns={[
                { header: "PO", cell: (o: any) => <span className="font-medium">{o.po_number}</span> },
                { header: "Vendor", cell: (o: any) => o.vendors?.name ?? "—" },
                { header: "Ordered", cell: (o: any) => shortDate(o.order_date) },
                { header: "Expected", cell: (o: any) => o.expected_date ? shortDate(o.expected_date) : "—" },
                { header: "Total", align: "right", cell: (o: any) => <div><p>{fmtCurrency(o.total, o.currency)}</p>{o.currency !== "USD" && <p className="text-[11px] text-muted-foreground">≈ {fmtCurrency(o.total_base)}</p>}</div> },
                { header: "Status", cell: (o: any) => <StatusBadge tone={toneForStatus(o.status)}>{(o.status || "").replace("_", " ")}</StatusBadge> },
                {
                  header: "", align: "right",
                  cell: (o: any) => (
                    <div className="flex justify-end gap-2">
                      {o.status === "submitted" && (
                        <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: o.id, status: "approved" })}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve
                        </Button>
                      )}
                      {!["received", "cancelled"].includes(o.status) && (
                        <Button size="sm" variant="outline" onClick={() => receive.mutate(o.id)}>
                          <PackageCheck className="h-3.5 w-3.5 mr-1" />Receive
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => openPo(o)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => delPo.mutate(o.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ),
                },
              ]}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="currency" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            {currencies.map((c) => (
              <DetailCard key={c} title={c}>
                <p className="font-display text-2xl font-bold tabular-nums">{Number(rates[c]).toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
                <p className="text-xs text-muted-foreground mt-1">{c} per 1 USD</p>
              </DetailCard>
            ))}
          </div>
          <DetailCard title="Rate History" padded={false}>
            <DataGrid
              rows={rateRows}
              loading={isLoading}
              empty="No exchange rates captured."
              columns={[
                { header: "Currency", cell: (r: any) => <span className="font-medium">{r.currency}</span> },
                { header: "Rate per USD", align: "right", cell: (r: any) => Number(r.rate).toLocaleString(undefined, { maximumFractionDigits: 6 }) },
                { header: "Effective", cell: (r: any) => shortDate(r.effective_date) },
                { header: "Source", cell: (r: any) => r.source },
                {
                  header: "", align: "right",
                  cell: (r: any) => (
                    <div className="flex justify-end gap-2">
                      <Button size="icon" variant="ghost" onClick={() => { setRate({ currency: r.currency, rate: Number(r.rate), effective_date: new Date().toISOString().slice(0, 10) }); setRateOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => delRate.mutate(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ),
                },
              ]}
            />
          </DetailCard>
        </TabsContent>
      </Tabs>

      {/* Vendor dialog */}
      <Dialog open={vendorOpen} onOpenChange={setVendorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{vendor.id ? "Edit vendor" : "New vendor"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={vendor.name ?? ""} onChange={(e) => setVendor({ ...vendor, name: e.target.value })} /></Field>
            <Field label="Code"><Input value={vendor.code ?? ""} onChange={(e) => setVendor({ ...vendor, code: e.target.value })} /></Field>
            <Field label="Category">
              <Select value={vendor.category ?? "general"} onValueChange={(v) => setVendor({ ...vendor, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Currency">
              <Select value={vendor.currency ?? "USD"} onValueChange={(v) => setVendor({ ...vendor, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Contact person"><Input value={vendor.contact_name ?? ""} onChange={(e) => setVendor({ ...vendor, contact_name: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={vendor.email ?? ""} onChange={(e) => setVendor({ ...vendor, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={vendor.phone ?? ""} onChange={(e) => setVendor({ ...vendor, phone: e.target.value })} /></Field>
            <Field label="Website"><Input value={vendor.website ?? ""} onChange={(e) => setVendor({ ...vendor, website: e.target.value })} /></Field>
            <Field label="Country"><Input value={vendor.country ?? ""} onChange={(e) => setVendor({ ...vendor, country: e.target.value })} /></Field>
            <Field label="Tax number"><Input value={vendor.tax_number ?? ""} onChange={(e) => setVendor({ ...vendor, tax_number: e.target.value })} /></Field>
            <Field label="Payment terms">
              <Select value={vendor.payment_terms ?? "net_30"} onValueChange={(v) => setVendor({ ...vendor, payment_terms: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={vendor.status ?? "active"} onValueChange={(v) => setVendor({ ...vendor, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["active", "inactive", "on_hold", "blacklisted"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Rating (1-5)"><Input type="number" min={1} max={5} value={vendor.rating ?? 3} onChange={(e) => setVendor({ ...vendor, rating: Number(e.target.value) })} /></Field>
            <div className="sm:col-span-2"><Field label="Address"><Input value={vendor.address ?? ""} onChange={(e) => setVendor({ ...vendor, address: e.target.value })} /></Field></div>
            <div className="sm:col-span-2"><Field label="Notes"><Textarea value={vendor.notes ?? ""} onChange={(e) => setVendor({ ...vendor, notes: e.target.value })} /></Field></div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveVendor.mutate()} disabled={saveVendor.isPending}>{saveVendor.isPending ? "Saving…" : "Save vendor"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purchase order dialog */}
      <Dialog open={poOpen} onOpenChange={setPoOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{po.id ? "Edit purchase order" : "New purchase order"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vendor">
              <Select value={po.vendor_id ?? ""} onValueChange={(v) => {
                const found = vendors.find((x) => x.id === v);
                setPo({ ...po, vendor_id: v, currency: found?.currency ?? po.currency ?? "USD" });
              }}>
                <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Currency">
              <Select value={po.currency ?? "USD"} onValueChange={(v) => setPo({ ...po, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Order date"><Input type="date" value={po.order_date ?? ""} onChange={(e) => setPo({ ...po, order_date: e.target.value })} /></Field>
            <Field label="Expected date"><Input type="date" value={po.expected_date ?? ""} onChange={(e) => setPo({ ...po, expected_date: e.target.value })} /></Field>
            <Field label="Status">
              <Select value={po.status ?? "draft"} onValueChange={(v) => setPo({ ...po, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PO_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Tax"><Input type="number" step="0.01" value={po.tax ?? 0} onChange={(e) => setPo({ ...po, tax: Number(e.target.value) })} /></Field>
          </div>

          <div className="space-y-2">
            <Label>Line items</Label>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <Input className="col-span-6" placeholder="Description" value={l.description}
                  onChange={(e) => setLines(lines.map((x, xi) => xi === i ? { ...x, description: e.target.value } : x))} />
                <Input className="col-span-2" type="number" step="0.01" placeholder="Qty" value={l.quantity}
                  onChange={(e) => setLines(lines.map((x, xi) => xi === i ? { ...x, quantity: Number(e.target.value) } : x))} />
                <Input className="col-span-3" type="number" step="0.01" placeholder="Unit price" value={l.unit_price}
                  onChange={(e) => setLines(lines.map((x, xi) => xi === i ? { ...x, unit_price: Number(e.target.value) } : x))} />
                <Button className="col-span-1" size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, xi) => xi !== i))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setLines([...lines, { description: "", quantity: 1, unit_price: 0 }])}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add line
            </Button>
          </div>

          <div className="text-right text-sm">
            <p className="text-muted-foreground">Subtotal {fmtCurrency(subtotal, po.currency ?? "USD")}</p>
            <p className="font-semibold">Total {fmtCurrency(subtotal + (Number(po.tax) || 0), po.currency ?? "USD")}</p>
          </div>

          <Field label="Notes"><Textarea value={po.notes ?? ""} onChange={(e) => setPo({ ...po, notes: e.target.value })} /></Field>

          <DialogFooter>
            <Button onClick={() => savePo.mutate()} disabled={savePo.isPending}>{savePo.isPending ? "Saving…" : "Save purchase order"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exchange rate dialog */}
      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Exchange rate</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="Currency code"><Input value={rate.currency} placeholder="ZWG" onChange={(e) => setRate({ ...rate, currency: e.target.value.toUpperCase() })} /></Field>
            <Field label="Units per 1 USD"><Input type="number" step="0.0001" value={rate.rate} onChange={(e) => setRate({ ...rate, rate: Number(e.target.value) })} /></Field>
            <Field label="Effective date"><Input type="date" value={rate.effective_date} onChange={(e) => setRate({ ...rate, effective_date: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button onClick={() => saveRate.mutate()} disabled={saveRate.isPending}>{saveRate.isPending ? "Saving…" : "Save rate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
