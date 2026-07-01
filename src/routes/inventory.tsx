import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/page";

export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [{ title: "Inventory — IMT Operations" }] }),
  component: InventoryPage,
});

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
        { header: "Item", cell: (r: any) => <div><div className="font-semibold">{r.name}</div><div className="text-xs text-muted-foreground">{r.category || "—"}</div></div> },
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
