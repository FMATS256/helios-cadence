import { createFileRoute, Link } from "@tanstack/react-router";
import { ModulePage, useCustomersLite } from "@/components/module-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/page";

const CYCLES = ["monthly", "quarterly", "annually", "one_time"];
const STATUSES = ["active", "paused", "cancelled", "expired"];

export const Route = createFileRoute("/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions — IMT Operations" }] }),
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const { data: customers = [] } = useCustomersLite();
  return (
    <ModulePage
      eyebrow="Business"
      title="Subscriptions"
      description="Recurring services and renewal schedule per customer."
      table="subscriptions"
      queryKey="subscriptions"
      searchFields={["plan_name", "account_number", "status"]}
      emptyLabel="No subscriptions yet."
      createTitle="New subscription"
      createLabel="New subscription"
      emptyForm={{ customer_id: "", plan_name: "", description: "", amount: 0, currency: "USD", billing_cycle: "monthly", status: "active", started_on: new Date().toISOString().slice(0, 10), next_renewal: "", auto_renew: true, notes: "" }}
      validateForm={(f) => (!f.customer_id ? "Customer required" : !f.plan_name ? "Plan required" : null)}
      transformInsert={(f) => ({ ...f, amount: Number(f.amount) || 0, started_on: f.started_on || null, next_renewal: f.next_renewal || null })}
      columns={[
        { header: "Plan", cell: (r: any) => <div><div className="font-semibold">{r.plan_name}</div><div className="text-xs text-muted-foreground">{r.billing_cycle}</div></div> },
        { header: "Customer", cell: (r: any) => <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline">{r.account_number}</Link> },
        { header: "Amount", cell: (r: any) => <span className="font-mono">{r.currency} {Number(r.amount).toLocaleString()}</span> },
        { header: "Status", cell: (r: any) => <StatusPill tone={r.status === "active" ? "success" : r.status === "cancelled" || r.status === "expired" ? "danger" : "warning"}>{r.status}</StatusPill> },
        { header: "Next renewal", cell: (r: any) => r.next_renewal ? new Date(r.next_renewal).toLocaleDateString() : "—" },
        { header: "Auto", cell: (r: any) => r.auto_renew ? "Yes" : "No" },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2"><Label>Customer *</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Plan name *</Label><Input required value={form.plan_name} onChange={(e) => setForm({ ...form, plan_name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Billing cycle</Label>
            <Select value={form.billing_cycle} onValueChange={(v) => setForm({ ...form, billing_cycle: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CYCLES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-2"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
          <div className="space-y-2"><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Auto renew</Label>
            <Select value={String(form.auto_renew)} onValueChange={(v) => setForm({ ...form, auto_renew: v === "true" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Started on</Label><Input type="date" value={form.started_on} onChange={(e) => setForm({ ...form, started_on: e.target.value })} /></div>
          <div className="space-y-2"><Label>Next renewal</Label><Input type="date" value={form.next_renewal} onChange={(e) => setForm({ ...form, next_renewal: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
