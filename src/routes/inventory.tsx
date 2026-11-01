import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceTabs } from "@/components/workspace-tabs";
import { AssetsPage } from "@/components/workspaces/assets-workspace";
import { LicensesPage } from "@/components/workspaces/licenses-workspace";
import { LaptopTrackingPage } from "@/components/workspaces/laptop-workspace";
import { ModulePage } from "@/components/module-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/page";

export const Route = createFileRoute("/inventory")({
  validateSearch: (q: Record<string, unknown>): { tab?: string } =>
    typeof q.tab === "string" ? { tab: q.tab } : {},
  head: () => ({
    meta: [
      { title: "Inventory & Assets — IMT Operations" },
      { name: "description", content: "Warehouse stock, managed assets, software licenses and tracked laptops in one workspace." },
      { property: "og:title", content: "Inventory & Assets — IMT Operations" },
      { property: "og:description", content: "Stock, assets, licenses and laptop tracking in one operations workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InventoryHub,
});

const INVENTORY_TABS = [
  { key: "stock", label: "Stock" },
  { key: "assets", label: "Assets" },
  { key: "licenses", label: "Licenses" },
  { key: "laptops", label: "Laptop Tracking" },
] as const;

function InventoryHub() {
  const { tab } = Route.useSearch();
  const active = INVENTORY_TABS.some((t) => t.key === tab) ? tab! : "stock";
  return (
    <div>
      <WorkspaceTabs tabs={INVENTORY_TABS} active={active} to="/inventory" />
      {active === "stock" && <InventoryPage />}
      {active === "assets" && <AssetsPage />}
      {active === "licenses" && <LicensesPage />}
      {active === "laptops" && <LaptopTrackingPage />}
    </div>
  );
}

function InventoryPage() {
  return (
    <ModulePage
      eyebrow="Business"
      title="Inventory"
      description="Warehouse stock — parts, spares and consumables ready for dispatch."
      table="inventory_items"
      queryKey="inventory_items"
      searchFields={["sku", "name", "category", "supplier", "location"]}
      emptyLabel="No inventory items."
      createTitle="New inventory item"
      createLabel="New item"
      emptyForm={{ sku: "", name: "", category: "", description: "", quantity: 0, reorder_level: 0, unit_cost: 0, location: "", supplier: "" }}
      validateForm={(f) => (!f.sku ? "SKU required" : !f.name ? "Name required" : null)}
      transformInsert={(f) => ({ ...f, quantity: Number(f.quantity) || 0, reorder_level: Number(f.reorder_level) || 0, unit_cost: Number(f.unit_cost) || 0 })}
      columns={[
        { header: "SKU", cell: (r: any) => <span className="font-mono font-semibold">{r.sku}</span> },
        { header: "Item", cell: (r: any) => (
          <div className="flex items-center gap-3">
            {r.image_url && <img src={r.image_url} alt={r.name} loading="lazy" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded bg-muted object-contain" />}
            <div className="min-w-0">
              <div className="font-semibold">{r.name}</div>
              <div className="text-xs text-muted-foreground">{r.category || "—"}</div>
              {r.specs && Object.keys(r.specs).filter((k) => k !== "Details").length > 0 && (
                <div className="text-[11px] text-muted-foreground truncate max-w-xs">
                  {Object.entries(r.specs).filter(([k]) => k !== "Details").map(([k, v]) => `${k}: ${v}`).join(" · ")}
                </div>
              )}
            </div>
          </div>
        ) },
        { header: "Sell price", cell: (r: any) => <span className="font-mono font-semibold">${Number(r.sale_price).toFixed(2)}</span> },
        { header: "On hand", cell: (r: any) => <span className={`font-mono ${r.quantity <= r.reorder_level ? "text-destructive font-semibold" : ""}`}>{r.quantity}</span> },
        { header: "Reorder at", cell: (r: any) => <span className="font-mono text-muted-foreground">{r.reorder_level}</span> },
        { header: "Status", cell: (r: any) => r.quantity === 0 ? <StatusPill tone="danger">out of stock</StatusPill> : r.quantity <= r.reorder_level ? <StatusPill tone="warning">low</StatusPill> : <StatusPill tone="success">ok</StatusPill> },
        { header: "Unit cost", cell: (r: any) => <span className="font-mono">${Number(r.unit_cost).toFixed(2)}</span> },
        { header: "Location", cell: (r: any) => r.location || "—" },
        { header: "Supplier", cell: (r: any) => r.supplier || "—" },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>SKU *</Label><Input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} placeholder="RJ45-CAT6-1M" /></div>
          <div className="space-y-2"><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Quantity</Label><Input type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
          <div className="space-y-2"><Label>Reorder level</Label><Input type="number" min="0" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} /></div>
          <div className="space-y-2"><Label>Unit cost</Label><Input type="number" step="0.01" min="0" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} /></div>
          <div className="space-y-2"><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Warehouse A · Shelf 3" /></div>
          <div className="col-span-2 space-y-2"><Label>Supplier</Label><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
