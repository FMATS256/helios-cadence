import { createFileRoute, Link } from "@tanstack/react-router";
import { ModulePage, useCustomersLite } from "@/components/module-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/page";

const CHECK_TYPES = ["http", "https", "ping", "tcp", "dns"];

export const Route = createFileRoute("/monitoring")({
  head: () => ({ meta: [{ title: "Monitoring — IMT Operations" }] }),
  component: MonitoringPage,
});

function MonitoringPage() {
  const { data: customers = [] } = useCustomersLite();
  return (
    <ModulePage
      eyebrow="Services"
      title="Monitoring"
      description="Uptime and reachability checks for customer endpoints and infrastructure."
      table="monitoring_checks"
      queryKey="monitoring_checks"
      searchFields={["name", "target", "account_number", "check_type"]}
      emptyLabel="No monitoring checks configured."
      createTitle="New check"
      createLabel="New check"
      emptyForm={{ customer_id: "", name: "", check_type: "https", target: "", interval_seconds: 300, enabled: true }}
      validateForm={(f) => (!f.name ? "Name required" : !f.target ? "Target required" : null)}
      transformInsert={(f) => ({ ...f, customer_id: f.customer_id || null, interval_seconds: Number(f.interval_seconds) || 300 })}
      columns={[
        { header: "Status", cell: (r: any) => <StatusPill tone={r.status === "up" ? "success" : r.status === "down" ? "danger" : "neutral"}>{r.status}</StatusPill> },
        { header: "Check", cell: (r: any) => <div><div className="font-semibold">{r.name}</div><div className="text-xs text-muted-foreground font-mono">{r.target}</div></div> },
        { header: "Type", cell: (r: any) => <StatusPill tone="info">{r.check_type.toUpperCase()}</StatusPill> },
        { header: "Customer", cell: (r: any) => r.account_number ? <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline">{r.account_number}</Link> : "—" },
        { header: "Interval", cell: (r: any) => `${r.interval_seconds}s` },
        { header: "Last checked", cell: (r: any) => r.last_checked_at ? new Date(r.last_checked_at).toLocaleString() : "Never" },
        { header: "Latency", cell: (r: any) => r.last_response_ms != null ? `${r.last_response_ms}ms` : "—" },
        { header: "Enabled", cell: (r: any) => r.enabled ? <StatusPill tone="success">on</StatusPill> : <StatusPill tone="neutral">off</StatusPill> },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Customer</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Internal / none" /></SelectTrigger>
              <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Check type</Label>
            <Select value={form.check_type} onValueChange={(v) => setForm({ ...form, check_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CHECK_TYPES.map(t => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-2"><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Customer web portal" /></div>
          <div className="col-span-2 space-y-2"><Label>Target *</Label><Input required value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="https://portal.example.com or 10.0.0.1" /></div>
          <div className="space-y-2"><Label>Interval (seconds)</Label><Input type="number" min="30" value={form.interval_seconds} onChange={(e) => setForm({ ...form, interval_seconds: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
