import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ModulePage, useCustomersLite } from "@/components/module-page";
import { createCloudServiceRecord } from "@/lib/ops.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/page";

const TYPES = ["Microsoft 365", "Google Workspace", "Azure", "AWS", "Hosting", "Domain", "Backup", "Antivirus", "VoIP", "Other"];
const STATUSES = ["active", "suspended", "cancelled", "trial"];

export const Route = createFileRoute("/cloud")({
  head: () => ({ meta: [{ title: "Cloud Services — IMT Operations" }] }),
  component: CloudPage,
});

function CloudPage() {
  const { data: customers = [] } = useCustomersLite();
  const createService = useServerFn(createCloudServiceRecord);
  return (
    <ModulePage
      eyebrow="Services"
      title="Cloud Services"
      description="Per-customer SaaS subscriptions, seats, renewals and monthly spend."
      table="cloud_services"
      queryKey="cloud_services"
      searchFields={["service_name", "vendor", "account_number", "service_type"]}
      emptyLabel="No cloud services yet. Add your first subscription."
      createTitle="New cloud service"
      createLabel="New service"
      emptyForm={{ customer_id: "", service_type: "Microsoft 365", service_name: "", vendor: "", plan: "", seats: 0, monthly_cost: 0, status: "active", renewal_date: "", admin_url: "", notes: "" }}
      validateForm={(f) => (!f.customer_id ? "Customer is required" : !f.service_name ? "Service name is required" : null)}
      transformInsert={(f) => ({ ...f, renewal_date: f.renewal_date || null, seats: Number(f.seats) || 0, monthly_cost: Number(f.monthly_cost) || 0 })}
      onCreate={(f) => createService({ data: f })}
      columns={[
        { header: "Service", cell: (r: any) => <div><div className="font-semibold">{r.service_name}</div><div className="text-xs text-muted-foreground">{r.vendor || r.service_type}</div></div> },
        { header: "Type", cell: (r: any) => <StatusPill tone="info">{r.service_type}</StatusPill> },
        { header: "Customer", cell: (r: any) => <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline">{r.account_number}</Link> },
        { header: "Plan", cell: (r: any) => r.plan || "—" },
        { header: "Seats", cell: (r: any) => r.seats ?? 0 },
        { header: "Monthly", cell: (r: any) => <span className="font-mono">${Number(r.monthly_cost || 0).toFixed(2)}</span> },
        { header: "Renewal", cell: (r: any) => r.renewal_date ? new Date(r.renewal_date).toLocaleDateString() : "—" },
        { header: "Status", cell: (r: any) => <StatusPill tone={r.status === "active" ? "success" : r.status === "cancelled" ? "danger" : "warning"}>{r.status}</StatusPill> },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2"><Label>Customer *</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Type</Label>
            <Select value={form.service_type} onValueChange={(v) => setForm({ ...form, service_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-2"><Label>Service name *</Label><Input required value={form.service_name} onChange={(e) => setForm({ ...form, service_name: e.target.value })} placeholder="e.g. Microsoft 365 Business Premium" /></div>
          <div className="space-y-2"><Label>Vendor</Label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
          <div className="space-y-2"><Label>Plan</Label><Input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} /></div>
          <div className="space-y-2"><Label>Seats</Label><Input type="number" min="0" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} /></div>
          <div className="space-y-2"><Label>Monthly cost</Label><Input type="number" step="0.01" min="0" value={form.monthly_cost} onChange={(e) => setForm({ ...form, monthly_cost: e.target.value })} /></div>
          <div className="space-y-2"><Label>Renewal date</Label><Input type="date" value={form.renewal_date} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} /></div>
          <div className="space-y-2"><Label>Admin URL</Label><Input value={form.admin_url} onChange={(e) => setForm({ ...form, admin_url: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
