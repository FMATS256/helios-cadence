import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/page";

const CATEGORIES = ["networking", "cybersecurity", "software", "other"] as const;

function daysUntil(d?: string | null) {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export const Route = createFileRoute("/licenses")({
  head: () => ({ meta: [{ title: "Licenses — IMT Operations" }] }),
  component: LicensesPage,
});

function LicensesPage() {
  return (
    <ModulePage
      eyebrow="Business"
      title="Licenses"
      description="Networking, cybersecurity and software licenses with renewal reminders."
      table="licenses"
      queryKey="licenses"
      searchFields={["product", "vendor", "category", "license_key", "account_number"]}
      emptyLabel="No licenses tracked yet."
      createTitle="Add license"
      createLabel="Add license"
      emptyForm={{ product: "", vendor: "", category: "networking", license_key: "", seats: 1, purchase_date: "", expiry_date: "", cost: 0, auto_renew: false, notes: "" }}
      validateForm={(f) => (!f.product ? "Product required" : null)}
      transformInsert={(f) => ({ ...f, seats: Number(f.seats) || 1, cost: Number(f.cost) || 0, auto_renew: !!f.auto_renew, purchase_date: f.purchase_date || null, expiry_date: f.expiry_date || null })}
      columns={[
        { header: "Product", cell: (r: any) => <div><div className="font-semibold">{r.product}</div><div className="text-xs text-muted-foreground">{r.vendor || "—"} · {r.category || "—"}</div></div> },
        { header: "Seats", cell: (r: any) => <span className="font-mono">{r.seats}</span> },
        { header: "Cost", cell: (r: any) => <span className="font-mono">${Number(r.cost).toFixed(2)}</span> },
        { header: "Expiry", cell: (r: any) => {
          const d = daysUntil(r.expiry_date);
          if (r.expiry_date == null) return "—";
          if (d! < 0) return <StatusPill tone="danger">expired</StatusPill>;
          if (d! <= 30) return <StatusPill tone="warning">in {d}d</StatusPill>;
          return <span className="text-muted-foreground">{r.expiry_date}</span>;
        } },
        { header: "Auto-renew", cell: (r: any) => r.auto_renew ? <StatusPill tone="success">yes</StatusPill> : "no" },
        { header: "Status", cell: (r: any) => <StatusPill tone={r.status === "active" ? "success" : "warning"}>{r.status}</StatusPill> },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2"><Label>Product *</Label><Input required value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder="Fortinet FortiGate 60F" /></div>
          <div className="space-y-2"><Label>Vendor</Label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
          <div className="space-y-2"><Label>Category</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label>Seats</Label><Input type="number" min="1" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} /></div>
          <div className="space-y-2"><Label>License key</Label><Input value={form.license_key} onChange={(e) => setForm({ ...form, license_key: e.target.value })} /></div>
          <div className="space-y-2"><Label>Purchase date</Label><Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
          <div className="space-y-2"><Label>Expiry date</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
          <div className="space-y-2"><Label>Cost (USD)</Label><Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
          <div className="col-span-2 flex items-center gap-2"><input id="auto-renew" type="checkbox" checked={!!form.auto_renew} onChange={(e) => setForm({ ...form, auto_renew: e.target.checked })} /><Label htmlFor="auto-renew">Auto-renew this license</Label></div>
          <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
