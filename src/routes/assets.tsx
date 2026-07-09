import { createFileRoute, Link } from "@tanstack/react-router";
import { ModulePage, useCustomersLite } from "@/components/module-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/page";

const ASSET_TYPES = ["Server", "Laptop", "Desktop", "Router", "Switch", "Firewall", "Access Point", "NAS", "Printer", "Phone", "Monitor", "Other"];
const STATUSES = ["in_service", "spare", "in_repair", "retired", "lost"];

export const Route = createFileRoute("/assets")({
  head: () => ({ meta: [{ title: "Assets — IMT Operations" }] }),
  component: AssetsPage,
});

function AssetsPage() {
  const { data: customers = [] } = useCustomersLite();
  return (
    <ModulePage
      eyebrow="Services"
      title="Assets"
      description="Hardware and devices under management — serials, warranties and assignment."
      table="assets"
      queryKey="assets"
      searchFields={["asset_tag", "make", "model", "serial_number", "account_number", "assigned_to"]}
      emptyLabel="No assets registered yet."
      createTitle="Register asset"
      createLabel="New asset"
      emptyForm={{ customer_id: "", asset_tag: "", asset_type: "Server", make: "", model: "", serial_number: "", location: "", assigned_to: "", status: "in_service", purchase_date: "", warranty_expires: "", cost: 0, notes: "" }}
      validateForm={(f) => (!f.asset_type ? "Type required" : !f.make ? "Make required" : null)}
      transformInsert={(f) => ({ ...f, customer_id: f.customer_id || null, purchase_date: f.purchase_date || null, warranty_expires: f.warranty_expires || null, cost: Number(f.cost) || null })}
      columns={[
        { header: "Tag / Serial", cell: (r: any) => <Link to="/assets/$id" params={{ id: r.id }}><div><div className="font-mono text-sm text-solar hover:underline">{r.asset_tag || r.id.slice(0, 8)}</div><div className="text-xs text-muted-foreground">{r.serial_number || "—"}</div></div></Link> },
        { header: "Type", cell: (r: any) => <StatusPill tone="info">{r.asset_type}</StatusPill> },
        { header: "Device", cell: (r: any) => <div>{r.make} {r.model}</div> },
        { header: "Customer", cell: (r: any) => r.account_number ? <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline">{r.account_number}</Link> : <span className="text-muted-foreground text-xs">Internal</span> },
        { header: "Assigned", cell: (r: any) => r.assigned_to || "—" },
        { header: "Location", cell: (r: any) => r.location || "—" },
        { header: "Warranty", cell: (r: any) => r.warranty_expires ? new Date(r.warranty_expires).toLocaleDateString() : "—" },
        { header: "Status", cell: (r: any) => <StatusPill tone={r.status === "in_service" ? "success" : r.status === "retired" ? "neutral" : "warning"}>{r.status.replace(/_/g, " ")}</StatusPill> },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Customer</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Internal / none" /></SelectTrigger>
              <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Type</Label>
            <Select value={form.asset_type} onValueChange={(v) => setForm({ ...form, asset_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Asset tag</Label><Input value={form.asset_tag} onChange={(e) => setForm({ ...form, asset_tag: e.target.value })} placeholder="IMT-A-0001" /></div>
          <div className="space-y-2"><Label>Serial number</Label><Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></div>
          <div className="space-y-2"><Label>Make *</Label><Input required value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} /></div>
          <div className="space-y-2"><Label>Model</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
          <div className="space-y-2"><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div className="space-y-2"><Label>Assigned to</Label><Input value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} /></div>
          <div className="space-y-2"><Label>Purchased</Label><Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
          <div className="space-y-2"><Label>Warranty expires</Label><Input type="date" value={form.warranty_expires} onChange={(e) => setForm({ ...form, warranty_expires: e.target.value })} /></div>
          <div className="space-y-2"><Label>Cost</Label><Input type="number" step="0.01" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
          <div className="space-y-2"><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
