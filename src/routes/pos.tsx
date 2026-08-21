import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, StatChipRow, ActionBar, DataGrid, DetailCard,
  StatusBadge, EmptyState, money, shortDate,
} from "@/components/enterprise";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShoppingCart, Plus, Minus, Trash2, Search, Package, Printer, Ban, RefreshCw, Receipt,
  ScanLine, Upload, ClipboardCheck, FileText, Download,
} from "lucide-react";
import { getPosWorkspace, createPosSale, voidPosSale, updatePosItem, bulkUpsertPosItems, getPosCloseout, closePosDay, getPosSalePdf } from "@/lib/pos.functions";


export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "Mini POS — IMT Operations Platform" },
      { name: "description", content: "Counter sales for routers, switches, hardware and consumable stock with live inventory and till tracking." },
      { property: "og:title", content: "Mini POS — IMT Operations Platform" },
      { property: "og:description", content: "Sell hardware and stock over the counter with live inventory, tills and receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosPage,
});

type CartLine = { item_id: string | null; sku: string | null; name: string; quantity: number; unit_price: number; on_hand: number };

const PAYMENT_METHODS = ["cash", "mobile money", "card", "bank transfer", "on account"];
const emptyItem = {
  id: "", sku: "", name: "", category: "Hardware", quantity: 0, reorder_level: 1,
  unit_cost: 0, sale_price: 0, is_sellable: true, location: "", supplier: "", barcode: "",
};

/** Parse pasted CSV/TSV stock lines: sku, name, qty, cost, price, [category, barcode, supplier, location, reorder] */
function parseBulk(text: string) {
  const rows: any[] = [];
  for (const raw of (text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(/\t|,|;/).map((c) => c.trim());
    const sku = cells[0] ?? "";
    if (!sku || /^sku$/i.test(sku)) continue;
    rows.push({
      sku,
      name: cells[1] || sku,
      quantity: Number(cells[2] ?? 0) || 0,
      unit_cost: Number(cells[3] ?? 0) || 0,
      sale_price: Number(cells[4] ?? 0) || 0,
      category: cells[5] || null,
      barcode: cells[6] || null,
      supplier: cells[7] || null,
      location: cells[8] || null,
      reorder_level: cells[9] != null && cells[9] !== "" ? Number(cells[9]) || 0 : undefined,
    });
  }
  return rows;
}

function PosPage() {
  const qc = useQueryClient();
  const wsFn = useServerFn(getPosWorkspace);
  const { data, isLoading, isFetching } = useQuery({ queryKey: ["pos-workspace"], queryFn: async () => (await wsFn()) as any });

  const items: any[] = data?.items ?? [];
  const sales: any[] = data?.sales ?? [];
  const accounts: any[] = data?.accounts ?? [];
  const customers: any[] = data?.customers ?? [];
  const closeouts: any[] = data?.closeouts ?? [];
  const stats = data?.stats;

  const refresh = () => qc.invalidateQueries({ queryKey: ["pos-workspace"] });

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [itemForm, setItemForm] = useState<any>(emptyItem);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [scan, setScan] = useState("");
  const [scanMode, setScanMode] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkMode, setBulkMode] = useState<"add" | "set">("add");
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [closeDate, setCloseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [countedCash, setCountedCash] = useState("");
  const [closeAccount, setCloseAccount] = useState("none");
  const [closeNotes, setCloseNotes] = useState("");

  const [customerId, setCustomerId] = useState("walkin");
  const [walkinName, setWalkinName] = useState("");
  const [walkinPhone, setWalkinPhone] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [method, setMethod] = useState("cash");
  const [tendered, setTendered] = useState("");
  const [accountId, setAccountId] = useState("none");
  const [notes, setNotes] = useState("");

  const sellable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => i.is_sellable !== false)
      .filter((i) => !q || [i.name, i.sku, i.category, i.barcode, i.supplier].some((v: any) => String(v ?? "").toLowerCase().includes(q)));
  }, [items, search]);

  const subtotal = cart.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const total = Math.max(0, subtotal - (Number(discount) || 0) + (Number(tax) || 0));
  const change = Math.max(0, (Number(tendered) || 0) - total);

  function addToCart(item: any) {
    if (Number(item.quantity) <= 0) { toast.error(`${item.name} is out of stock`); return; }
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.item_id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        if (next[idx].quantity + 1 > Number(item.quantity)) { toast.error(`Only ${item.quantity} in stock`); return prev; }
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, {
        item_id: item.id, sku: item.sku, name: item.name,
        quantity: 1, unit_price: Number(item.sale_price) || Number(item.unit_cost) || 0,
        on_hand: Number(item.quantity) || 0,
      }];
    });
  }

  function scanAdd(code: string) {
    const q = code.trim().toLowerCase();
    if (!q) return;
    const match =
      items.find((i) => String(i.barcode ?? "").toLowerCase() === q) ||
      items.find((i) => String(i.sku ?? "").toLowerCase() === q) ||
      items.filter((i) => String(i.name ?? "").toLowerCase().includes(q))[0];
    if (!match) { toast.error(`No stock item matches "${code}"`); setScan(""); return; }
    if (match.is_sellable === false) { toast.error(`${match.name} is not sellable`); setScan(""); return; }
    addToCart(match);
    toast.success(`${match.name} added`);
    setScan("");
    scanRef.current?.focus();
  }

  function setQty(i: number, qty: number) {
    setCart((prev) => prev.map((l, idx) => {
      if (idx !== i) return l;
      const capped = l.item_id ? Math.min(qty, l.on_hand) : qty;
      return { ...l, quantity: Math.max(1, capped) };
    }));
  }

  const saleFn = useServerFn(createPosSale);
  const sell = useMutation({
    mutationFn: async () => saleFn({
      data: {
        lines: cart.map((l) => ({ item_id: l.item_id, sku: l.sku, name: l.name, quantity: l.quantity, unit_price: l.unit_price })),
        customer_id: customerId === "walkin" ? null : customerId,
        walkin_name: walkinName || null,
        walkin_phone: walkinPhone || null,
        discount: Number(discount) || 0,
        tax: Number(tax) || 0,
        payment_method: method,
        amount_paid: tendered === "" ? total : Number(tendered),
        account_id: accountId === "none" ? null : accountId,
        notes: notes || null,
      },
    }),
    onSuccess: (sale: any) => {
      toast.success(`Sale ${sale.sale_number} completed`);
      setReceipt(sale);
      setCart([]); setCheckout(false); setDiscount("0"); setTax("0"); setTendered(""); setNotes("");
      setWalkinName(""); setWalkinPhone(""); setCustomerId("walkin");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Sale failed"),
  });

  const voidFn = useServerFn(voidPosSale);
  const voidSale = useMutation({
    mutationFn: (id: string) => voidFn({ data: { id, reason: "Voided at counter" } }),
    onSuccess: () => { toast.success("Sale voided and stock returned"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Void failed"),
  });

  const itemFn = useServerFn(updatePosItem);
  const saveItem = useMutation({
    mutationFn: () => itemFn({ data: { ...itemForm, id: itemForm.id || undefined } }),
    onSuccess: () => { toast.success("Stock item saved"); setItemOpen(false); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  const bulkFn = useServerFn(bulkUpsertPosItems);
  const bulkUpload = useMutation({
    mutationFn: async () => {
      const rows = parseBulk(bulkText);
      if (!rows.length) throw new Error("Nothing to upload — add at least one line");
      return bulkFn({ data: { rows, mode: bulkMode } }) as any;
    },
    onSuccess: (r: any) => {
      toast.success(`Stock uploaded — ${r.created} new, ${r.restocked} updated, ${r.units} units added`);
      setBulkOpen(false); setBulkText(""); refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Upload failed"),
  });

  const zFn = useServerFn(getPosCloseout);
  const zReport = useQuery({
    queryKey: ["pos-closeout", closeDate],
    enabled: closeoutOpen,
    queryFn: async () => (await zFn({ data: { date: closeDate } })) as any,
  });

  const closeFn = useServerFn(closePosDay);
  const closeDay = useMutation({
    mutationFn: () => closeFn({
      data: {
        date: closeDate,
        counted_cash: Number(countedCash) || 0,
        account_id: closeAccount === "none" ? null : closeAccount,
        notes: closeNotes || null,
      },
    }),
    onSuccess: () => {
      toast.success(`Day ${closeDate} closed`);
      setCloseoutOpen(false); setCountedCash(""); setCloseNotes(""); refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Closeout failed"),
  });

  const chips = useMemo(() => stats ? [
    { label: "Sales Today", value: String(stats.salesToday), color: "#4338ca" },
    { label: "Revenue Today", value: money(stats.revenueToday), color: "#15803d" },
    { label: "Units Sold Today", value: String(stats.unitsToday), color: "#0d9488" },
    { label: "Revenue This Month", value: money(stats.revenueMonth), color: "#1d4ed8" },
    { label: "Gross Profit (MTD)", value: money(stats.profitMonth), color: "#7c3aed" },
    { label: "Stock at Cost", value: money(stats.stockValue), color: "#b45309" },
    { label: "Retail Value", value: money(stats.retailValue), color: "#be185d" },
    { label: "Low / Out of Stock", value: `${stats.lowStock} / ${stats.outOfStock}`, color: "#b91c1c" },
  ] : [], [stats]);

  const pdfFn = useServerFn(getPosSalePdf);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  async function downloadInvoice(sale: any) {
    setPdfBusy(sale.id);
    try {
      const file: any = await pdfFn({ data: { sale_id: sale.id } });
      const bin = atob(file.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename || `${sale.sale_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success("Invoice downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Could not generate the invoice PDF");
    } finally {
      setPdfBusy(null);
    }
  }

  function printReceipt(sale: any) {

    const lines = (sale.pos_sale_items || []).map((l: any) =>
      `<tr><td>${l.name}</td><td style="text-align:right">${l.quantity}</td><td style="text-align:right">${money(l.unit_price)}</td><td style="text-align:right">${money(l.line_total)}</td></tr>`).join("");
    const html = `<html><head><title>${sale.sale_number}</title><style>
      body{font-family:ui-sans-serif,system-ui;padding:24px;max-width:420px}
      h1{font-size:18px;margin:0} table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
      td,th{padding:4px 0;border-bottom:1px dashed #ccc} .tot{font-weight:700;font-size:14px}
    </style></head><body>
      <h1>IMT Solutions</h1><p style="font-size:12px;margin:4px 0">Receipt ${sale.sale_number}<br/>${new Date(sale.created_at || Date.now()).toLocaleString()}<br/>${sale.walkin_name || sale.account_number || ""}</p>
      <table><thead><tr><th style="text-align:left">Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead><tbody>${lines}</tbody></table>
      <p class="tot">Subtotal ${money(sale.subtotal)}<br/>Discount ${money(sale.discount)}<br/>Tax ${money(sale.tax)}<br/>TOTAL ${money(sale.total)}<br/>Paid ${money(sale.amount_paid)} (${sale.payment_method})<br/>Change ${money(sale.change_due)}</p>
      <p style="font-size:11px">Served by ${sale.sold_by_name || "IMT staff"} — thank you for your business.</p>
    </body></html>`;
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) { toast.error("Allow pop-ups to print receipts"); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
  }

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Retail"
        title="Mini POS"
        description="Sell routers, switches, hardware and consumables over the counter — live stock, tills and receipts."
      />

      <StatChipRow chips={chips} cols={4} />

      <ActionBar
        actions={[
          { tone: "emerald", icon: ShoppingCart, label: `Checkout (${cart.length})`, onClick: () => cart.length ? setCheckout(true) : toast.error("Cart is empty") },
          { tone: "emerald", icon: ScanLine, label: "Scan Mode", onClick: () => { setScanMode(true); setTimeout(() => scanRef.current?.focus(), 50); } },
          { tone: "indigo", icon: Plus, label: "New Stock Item", onClick: () => { setItemForm(emptyItem); setItemOpen(true); } },
          { tone: "sky", icon: Upload, label: "Bulk Stock Upload", onClick: () => setBulkOpen(true) },
          { tone: "amber", icon: ClipboardCheck, label: "Close Day", onClick: () => setCloseoutOpen(true) },
          { tone: "rose", icon: Trash2, label: "Clear Cart", onClick: () => setCart([]), disabled: !cart.length },
          { tone: "slate", icon: RefreshCw, label: "Refresh", onClick: refresh },
        ]}
      />

      <Tabs defaultValue="counter">
        <TabsList>
          <TabsTrigger value="counter">Counter</TabsTrigger>
          <TabsTrigger value="stock">Stock &amp; Pricing</TabsTrigger>
          <TabsTrigger value="sales">Sales History</TabsTrigger>
          <TabsTrigger value="closeouts">Daily Closeouts</TabsTrigger>
        </TabsList>

        <TabsContent value="counter" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-3">
              <div className="relative">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                <Input
                  ref={scanRef}
                  className="pl-9 border-emerald-500/50 focus-visible:ring-emerald-500"
                  placeholder="Scan barcode — point the scanner here and it drops straight into the cart"
                  value={scan}
                  autoFocus={scanMode}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); scanAdd(scan); } }}
                />
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search products, SKU or barcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {isLoading ? (
                <div className="p-10 text-center text-sm text-muted-foreground">Loading stock…</div>
              ) : !sellable.length ? (
                <EmptyState title="No sellable stock" description="Add stock items with a selling price to start selling." icon={Package} />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {sellable.map((i) => {
                    const out = Number(i.quantity) <= 0;
                    return (
                      <button
                        key={i.id}
                        onClick={() => addToCart(i)}
                        className={`text-left rounded-xl border bg-card p-3 transition hover:border-solar hover:shadow-md ${out ? "opacity-60" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{i.name}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{i.sku}</p>
                          </div>
                          <StatusBadge tone={out ? "danger" : Number(i.quantity) <= Number(i.reorder_level) ? "warning" : "success"}>
                            {out ? "out" : `${i.quantity} left`}
                          </StatusBadge>
                        </div>
                        <div className="mt-2 flex items-end justify-between">
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{i.category || "stock"}</span>
                          <span className="font-display text-lg font-bold tabular-nums">{money(i.sale_price)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <DetailCard title="Cart">
              {!cart.length ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Tap a product to add it to the cart.</p>
              ) : (
                <div className="space-y-3">
                  {cart.map((l, i) => (
                    <div key={`${l.item_id}-${i}`} className="flex items-center gap-2 border-b pb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{l.name}</p>
                        <p className="text-xs text-muted-foreground">{money(l.unit_price)} each</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(i, l.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                        <span className="w-8 text-center text-sm tabular-nums">{l.quantity}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(i, l.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setCart((p) => p.filter((_, x) => x !== i))}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                      <span className="w-16 text-right text-sm font-mono">{money(l.quantity * l.unit_price)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm text-muted-foreground">Subtotal</span>
                    <span className="font-display text-xl font-bold tabular-nums">{money(subtotal)}</span>
                  </div>
                  <Button className="w-full" onClick={() => setCheckout(true)}>
                    <ShoppingCart className="h-4 w-4 mr-2" /> Checkout
                  </Button>
                </div>
              )}
            </DetailCard>
          </div>
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          <DataGrid
            rows={items}
            loading={isLoading}
            empty={<EmptyState title="No stock" description="Add your first hardware item." icon={Package} />}
            columns={[
              { header: "SKU", cell: (r: any) => <span className="font-mono text-xs font-semibold">{r.sku}</span> },
              { header: "Item", cell: (r: any) => <div><div className="font-semibold text-sm">{r.name}</div><div className="text-xs text-muted-foreground">{r.category || "—"}</div></div> },
              { header: "On hand", align: "right", cell: (r: any) => <span className="font-mono">{r.quantity}</span> },
              { header: "Cost", align: "right", cell: (r: any) => <span className="font-mono">{money(r.unit_cost)}</span> },
              { header: "Sell price", align: "right", cell: (r: any) => <span className="font-mono font-semibold">{money(r.sale_price)}</span> },
              { header: "Margin", align: "right", cell: (r: any) => <span className="font-mono">{money(Number(r.sale_price || 0) - Number(r.unit_cost || 0))}</span> },
              { header: "Status", cell: (r: any) => r.is_sellable === false ? <StatusBadge tone="neutral">not for sale</StatusBadge> : Number(r.quantity) <= 0 ? <StatusBadge tone="danger">out of stock</StatusBadge> : Number(r.quantity) <= Number(r.reorder_level) ? <StatusBadge tone="warning">low</StatusBadge> : <StatusBadge tone="success">available</StatusBadge> },
              { header: "", align: "right", cell: (r: any) => <Button size="sm" variant="outline" onClick={() => { setItemForm({ ...emptyItem, ...r, category: r.category ?? "", location: r.location ?? "", supplier: r.supplier ?? "", barcode: r.barcode ?? "" }); setItemOpen(true); }}>Edit</Button> },
            ]}
          />
        </TabsContent>

        <TabsContent value="sales" className="mt-4">
          <DataGrid
            rows={sales}
            loading={isLoading}
            empty={<EmptyState title="No sales yet" description="Completed counter sales will appear here." icon={Receipt} />}
            columns={[
              { header: "Sale", cell: (r: any) => <span className="font-mono text-xs font-semibold">{r.sale_number}</span> },
              { header: "When", cell: (r: any) => <span className="text-xs">{shortDate(r.created_at)}</span> },
              { header: "Customer", cell: (r: any) => r.account_number || r.walkin_name || "Walk-in" },
              { header: "Items", align: "right", cell: (r: any) => (r.pos_sale_items || []).length },
              { header: "Total", align: "right", cell: (r: any) => <span className="font-mono font-semibold">{money(r.total, r.currency)}</span> },
              { header: "Invoice", cell: (r: any) => r.invoice_id
                ? <Button variant="link" size="sm" className="h-auto px-0 font-mono text-xs" onClick={() => window.open(`/invoices/${r.invoice_id}`, "_blank")}>view</Button>
                : <span className="text-xs text-muted-foreground">—</span> },
              { header: "Paid via", cell: (r: any) => <StatusBadge tone="info">{r.payment_method}</StatusBadge> },
              { header: "Status", cell: (r: any) => <StatusBadge tone={r.status === "void" ? "danger" : "success"}>{r.status}</StatusBadge> },
              { header: "Sold by", cell: (r: any) => <span className="text-xs text-muted-foreground">{r.sold_by_name || "—"}</span> },
              {
                header: "", align: "right", cell: (r: any) => (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => printReceipt(r)}><Printer className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" disabled={pdfBusy === r.id} onClick={() => downloadInvoice(r)} title="Download invoice PDF">
                      {pdfBusy === r.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    </Button>
                    {r.status !== "void" && (
                      <Button size="sm" variant="outline" className="text-destructive" disabled={voidSale.isPending} onClick={() => voidSale.mutate(r.id)}><Ban className="h-3 w-3" /></Button>
                    )}
                  </div>
                ),

              },
            ]}
          />
        </TabsContent>

        <TabsContent value="closeouts" className="mt-4">
          <DataGrid
            rows={closeouts}
            loading={isLoading}
            empty={<EmptyState title="No closeouts yet" description="Close the trading day to snapshot sales, cash and variance." icon={ClipboardCheck} />}
            columns={[
              { header: "Date", cell: (r: any) => <span className="font-mono text-xs font-semibold">{r.business_date}</span> },
              { header: "Sales", align: "right", cell: (r: any) => r.sales_count },
              { header: "Units", align: "right", cell: (r: any) => Number(r.units_sold) },
              { header: "Net sales", align: "right", cell: (r: any) => <span className="font-mono">{money(r.net_sales)}</span> },
              { header: "Gross profit", align: "right", cell: (r: any) => <span className="font-mono">{money(r.gross_profit)}</span> },
              { header: "Expected cash", align: "right", cell: (r: any) => <span className="font-mono">{money(r.expected_cash)}</span> },
              { header: "Counted", align: "right", cell: (r: any) => <span className="font-mono">{money(r.counted_cash)}</span> },
              { header: "Variance", align: "right", cell: (r: any) => (
                <StatusBadge tone={Math.abs(Number(r.variance)) < 0.005 ? "success" : Number(r.variance) > 0 ? "info" : "danger"}>
                  {money(r.variance)}
                </StatusBadge>
              ) },
              { header: "Closed by", cell: (r: any) => <span className="text-xs text-muted-foreground">{r.closed_by_name || "—"}</span> },
            ]}
          />
        </TabsContent>
      </Tabs>

      {/* Checkout */}
      <Dialog open={checkout} onOpenChange={setCheckout}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Checkout · {money(total)}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border p-3 text-sm space-y-1">
              {cart.map((l, i) => (
                <div key={i} className="flex justify-between"><span>{l.quantity} × {l.name}</span><span className="font-mono">{money(l.quantity * l.unit_price)}</span></div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="walkin">Walk-in customer</SelectItem>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {customerId === "walkin" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Name</Label><Input value={walkinName} onChange={(e) => setWalkinName(e.target.value)} placeholder="Walk-in customer" /></div>
                <div className="space-y-2"><Label>Phone</Label><Input value={walkinPhone} onChange={(e) => setWalkinPhone(e.target.value)} /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Discount</Label><Input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
              <div className="space-y-2"><Label>Tax</Label><Input type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} /></div>
              <div className="space-y-2"><Label>Payment method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Amount tendered</Label><Input type="number" min="0" step="0.01" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={String(total.toFixed(2))} /></div>
              <div className="col-span-2 space-y-2"><Label>Bank into till / account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="Do not record cash movement" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Do not record</SelectItem>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.kind})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{money(subtotal)}</span></div>
              <div className="flex justify-between font-bold"><span>Total</span><span className="font-mono">{money(total)}</span></div>
              <div className="flex justify-between"><span>Change due</span><span className="font-mono">{money(change)}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckout(false)}>Cancel</Button>
            <Button disabled={sell.isPending || !cart.length} onClick={() => sell.mutate()}>
              {sell.isPending ? "Processing…" : `Complete sale · ${money(total)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock item editor */}
      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{itemForm.id ? "Edit stock item" : "New stock item"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>SKU *</Label><Input value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value.toUpperCase() })} placeholder="RTR-MT-HAP" /></div>
            <div className="space-y-2"><Label>Category</Label><Input value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} placeholder="Routers" /></div>
            <div className="col-span-2 space-y-2"><Label>Name *</Label><Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="MikroTik hAP ax2" /></div>
            <div className="space-y-2"><Label>Quantity</Label><Input type="number" min="0" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} /></div>
            <div className="space-y-2"><Label>Reorder level</Label><Input type="number" min="0" value={itemForm.reorder_level} onChange={(e) => setItemForm({ ...itemForm, reorder_level: e.target.value })} /></div>
            <div className="space-y-2"><Label>Unit cost</Label><Input type="number" min="0" step="0.01" value={itemForm.unit_cost} onChange={(e) => setItemForm({ ...itemForm, unit_cost: e.target.value })} /></div>
            <div className="space-y-2"><Label>Sell price</Label><Input type="number" min="0" step="0.01" value={itemForm.sale_price} onChange={(e) => setItemForm({ ...itemForm, sale_price: e.target.value })} /></div>
            <div className="space-y-2"><Label>Barcode</Label><Input value={itemForm.barcode} onChange={(e) => setItemForm({ ...itemForm, barcode: e.target.value })} /></div>
            <div className="space-y-2"><Label>Location</Label><Input value={itemForm.location} onChange={(e) => setItemForm({ ...itemForm, location: e.target.value })} /></div>
            <div className="space-y-2"><Label>Supplier</Label><Input value={itemForm.supplier} onChange={(e) => setItemForm({ ...itemForm, supplier: e.target.value })} /></div>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={itemForm.is_sellable} onCheckedChange={(v) => setItemForm({ ...itemForm, is_sellable: v })} />
              <Label>Available in POS</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemOpen(false)}>Cancel</Button>
            <Button disabled={saveItem.isPending} onClick={() => saveItem.mutate()}>{saveItem.isPending ? "Saving…" : "Save item"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk stock upload */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Bulk stock upload</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              One item per line, comma or tab separated:{" "}
              <span className="font-mono">sku, name, qty, unit cost, sell price, category, barcode, supplier, location, reorder level</span>.
              Existing SKUs are restocked and repriced; new SKUs are created.
            </p>
            <div className="space-y-2">
              <Label>Quantity handling</Label>
              <Select value={bulkMode} onValueChange={(v) => setBulkMode(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add to existing stock (delivery / restock)</SelectItem>
                  <SelectItem value="set">Set stock to this figure (stock take)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              rows={10}
              className="font-mono text-xs"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"RTR-MT-HAP, MikroTik hAP ax2, 12, 48.00, 79.00, Routers, 6009999123456, Miro, Shelf A, 3"}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{parseBulk(bulkText).length} line(s) ready</span>
              <label className="cursor-pointer text-primary">
                Upload CSV file
                <input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setBulkText(await f.text());
                  e.target.value = "";
                }} />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button disabled={bulkUpload.isPending} onClick={() => bulkUpload.mutate()}>
              {bulkUpload.isPending ? "Uploading…" : "Upload stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Daily closeout */}
      <Dialog open={closeoutOpen} onOpenChange={setCloseoutOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Daily closeout · Z-report</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Business date</Label>
              <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            </div>
            {zReport.isLoading ? (
              <p className="text-sm text-muted-foreground">Building report…</p>
            ) : zReport.data ? (
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>Sales</span><span className="font-mono">{zReport.data.sales_count} ({zReport.data.voided_count} void)</span></div>
                <div className="flex justify-between"><span>Units sold</span><span className="font-mono">{zReport.data.units}</span></div>
                <div className="flex justify-between"><span>Gross</span><span className="font-mono">{money(zReport.data.gross_sales)}</span></div>
                <div className="flex justify-between"><span>Discounts</span><span className="font-mono">-{money(zReport.data.discounts)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span className="font-mono">{money(zReport.data.tax)}</span></div>
                <div className="flex justify-between font-bold"><span>Net sales</span><span className="font-mono">{money(zReport.data.net_sales)}</span></div>
                <div className="flex justify-between"><span>Gross profit</span><span className="font-mono">{money(zReport.data.gross_profit)}</span></div>
                <div className="border-t pt-1 mt-1">
                  {Object.entries(zReport.data.methods ?? {}).map(([m, v]: any) => (
                    <div key={m} className="flex justify-between text-xs"><span className="capitalize">{m} × {v.count}</span><span className="font-mono">{money(v.amount)}</span></div>
                  ))}
                </div>
                <div className="flex justify-between font-semibold"><span>Expected cash in till</span><span className="font-mono">{money(zReport.data.expected_cash)}</span></div>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Counted cash</Label>
                <Input type="number" min="0" step="0.01" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} placeholder={String((zReport.data?.expected_cash ?? 0).toFixed(2))} />
              </div>
              <div className="space-y-2"><Label>Till / account</Label>
                <Select value={closeAccount} onValueChange={setCloseAccount}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Do not post variance</SelectItem>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.kind})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {countedCash !== "" && zReport.data && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm flex justify-between">
                <span>Variance</span>
                <span className="font-mono font-semibold">{money((Number(countedCash) || 0) - Number(zReport.data.expected_cash || 0))}</span>
              </div>
            )}
            <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseoutOpen(false)}>Cancel</Button>
            <Button disabled={closeDay.isPending || !zReport.data} onClick={() => closeDay.mutate()}>
              {closeDay.isPending ? "Closing…" : "Close the day"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Sale complete · {receipt?.sale_number}</DialogTitle></DialogHeader>
          {receipt && (
            <div className="space-y-2 text-sm">
              {(receipt.pos_sale_items || []).map((l: any, i: number) => (
                <div key={i} className="flex justify-between"><span>{l.quantity} × {l.name}</span><span className="font-mono">{money(l.line_total)}</span></div>
              ))}
              <div className="border-t pt-2 flex justify-between font-bold"><span>Total</span><span className="font-mono">{money(receipt.total)}</span></div>
              <div className="flex justify-between"><span>Change</span><span className="font-mono">{money(receipt.change_due)}</span></div>
              {receipt.invoice_number ? (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs">
                  Paid invoice <span className="font-mono font-semibold">{receipt.invoice_number}</span> was generated and settled automatically.
                  <Button variant="link" size="sm" className="px-1 h-auto" onClick={() => window.open(`/invoices/${receipt.invoice_id}`, "_blank")}>
                    <FileText className="h-3 w-3 mr-1" /> Open invoice
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Walk-in sale — receipt only, no account invoice.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceipt(null)}>Close</Button>
            <Button variant="outline" disabled={!!receipt && pdfBusy === receipt.id} onClick={() => receipt && downloadInvoice(receipt)}>
              {receipt && pdfBusy === receipt.id ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} Download invoice
            </Button>

            <Button onClick={() => receipt && printReceipt(receipt)}><Printer className="h-4 w-4 mr-2" /> Print receipt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isFetching && !isLoading && <p className="text-xs text-muted-foreground">Syncing…</p>}
    </PageShell>
  );
}
