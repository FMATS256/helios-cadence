import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/page";

export const Route = createFileRoute("/cloud-storage")({
  head: () => ({ meta: [{ title: "Cloud Storage — IMT Operations" }] }),
  component: CloudStoragePage,
});

function CloudStoragePage() {
  return (
    <ModulePage
      eyebrow="Services"
      title="Cloud Storage"
      description="Customer cloud storage accounts, capacity and renewals. Awaiting provider API."
      table="cloud_storage_accounts"
      queryKey="cloud_storage_accounts"
      searchFields={["name", "provider", "account_number"]}
      emptyLabel="No cloud storage accounts yet."
      createTitle="New cloud storage account"
      createLabel="Add account"
      emptyForm={{ name: "", provider: "", storage_tb: "", used_tb: 0, access_url: "", monthly_cost: 0, renewal_date: "", notes: "" }}
      validateForm={(f) => (!f.name ? "Name required" : null)}
      transformInsert={(f) => ({ ...f, monthly_cost: Number(f.monthly_cost) || 0, storage_tb: f.storage_tb ? Number(f.storage_tb) : null, used_tb: Number(f.used_tb) || 0, renewal_date: f.renewal_date || null })}
      columns={[
        { header: "Account", cell: (r: any) => <div><div className="font-semibold">{r.name}</div><div className="text-xs text-muted-foreground">{r.provider || "—"}</div></div> },
        { header: "Capacity", cell: (r: any) => <span className="font-mono">{r.used_tb || 0} / {r.storage_tb || "—"} TB</span> },
        { header: "Cost/mo", cell: (r: any) => <span className="font-mono">${Number(r.monthly_cost).toFixed(2)}</span> },
        { header: "Renewal", cell: (r: any) => r.renewal_date || "—" },
        { header: "Status", cell: (r: any) => <StatusPill tone={r.status === "active" ? "success" : "warning"}>{r.status}</StatusPill> },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2"><Label>Account name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Provider</Label><Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="Wasabi / Backblaze B2 / IMT" /></div>
          <div className="space-y-2"><Label>Access URL</Label><Input value={form.access_url} onChange={(e) => setForm({ ...form, access_url: e.target.value })} /></div>
          <div className="space-y-2"><Label>Capacity (TB)</Label><Input type="number" step="0.01" value={form.storage_tb} onChange={(e) => setForm({ ...form, storage_tb: e.target.value })} /></div>
          <div className="space-y-2"><Label>Used (TB)</Label><Input type="number" step="0.01" value={form.used_tb} onChange={(e) => setForm({ ...form, used_tb: e.target.value })} /></div>
          <div className="space-y-2"><Label>Monthly cost (USD)</Label><Input type="number" step="0.01" value={form.monthly_cost} onChange={(e) => setForm({ ...form, monthly_cost: e.target.value })} /></div>
          <div className="space-y-2"><Label>Renewal date</Label><Input type="date" value={form.renewal_date} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
