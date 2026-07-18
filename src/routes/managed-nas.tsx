import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/page";

export const Route = createFileRoute("/managed-nas")({
  head: () => ({ meta: [{ title: "Managed NAS — IMT Operations" }] }),
  component: ManagedNasPage,
});

function ManagedNasPage() {
  return (
    <ModulePage
      eyebrow="Services"
      title="Managed NAS"
      description="On-premise / co-located NAS units managed for customers. Awaiting vendor API."
      table="managed_nas_accounts"
      queryKey="managed_nas_accounts"
      searchFields={["name", "vendor", "model", "serial_number", "location", "account_number"]}
      emptyLabel="No NAS deployments yet."
      createTitle="New NAS deployment"
      createLabel="Add NAS"
      emptyForm={{ name: "", vendor: "", model: "", serial_number: "", capacity_tb: "", raid_level: "", location: "", management_url: "", monthly_cost: 0, renewal_date: "", notes: "" }}
      validateForm={(f) => (!f.name ? "Name required" : null)}
      transformInsert={(f) => ({ ...f, monthly_cost: Number(f.monthly_cost) || 0, capacity_tb: f.capacity_tb ? Number(f.capacity_tb) : null, renewal_date: f.renewal_date || null })}
      columns={[
        { header: "Unit", cell: (r: any) => <div><div className="font-semibold">{r.name}</div><div className="text-xs text-muted-foreground">{r.vendor} {r.model}</div></div> },
        { header: "Capacity", cell: (r: any) => <span className="font-mono">{r.capacity_tb || "—"} TB {r.raid_level ? `· ${r.raid_level}` : ""}</span> },
        { header: "Serial", cell: (r: any) => <span className="font-mono text-xs">{r.serial_number || "—"}</span> },
        { header: "Location", cell: (r: any) => r.location || "—" },
        { header: "Cost/mo", cell: (r: any) => <span className="font-mono">${Number(r.monthly_cost).toFixed(2)}</span> },
        { header: "Status", cell: (r: any) => <StatusPill tone={r.status === "active" ? "success" : "warning"}>{r.status}</StatusPill> },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2"><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Client HQ NAS" /></div>
          <div className="space-y-2"><Label>Vendor</Label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Synology / QNAP / TrueNAS" /></div>
          <div className="space-y-2"><Label>Model</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
          <div className="space-y-2"><Label>Serial number</Label><Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></div>
          <div className="space-y-2"><Label>Capacity (TB)</Label><Input type="number" step="0.01" value={form.capacity_tb} onChange={(e) => setForm({ ...form, capacity_tb: e.target.value })} /></div>
          <div className="space-y-2"><Label>RAID</Label><Input value={form.raid_level} onChange={(e) => setForm({ ...form, raid_level: e.target.value })} placeholder="RAID 5 / SHR / Z1" /></div>
          <div className="space-y-2"><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div className="space-y-2"><Label>Management URL</Label><Input value={form.management_url} onChange={(e) => setForm({ ...form, management_url: e.target.value })} /></div>
          <div className="space-y-2"><Label>Monthly cost (USD)</Label><Input type="number" step="0.01" value={form.monthly_cost} onChange={(e) => setForm({ ...form, monthly_cost: e.target.value })} /></div>
          <div className="space-y-2"><Label>Renewal date</Label><Input type="date" value={form.renewal_date} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
