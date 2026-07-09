import { createFileRoute, Link } from "@tanstack/react-router";
import { ModulePage, useCustomersLite } from "@/components/module-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/page";

const STATUSES = ["draft", "sent", "paid", "overdue", "void"];

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Billing — IMT Operations" }] }),
  component: BillingPage,
});

function BillingPage() {
  const { data: customers = [] } = useCustomersLite();
  return (
    <ModulePage
      eyebrow="Business"
      title="Billing"
      description="Invoices, payments and revenue by customer."
      table="invoices"
      queryKey="invoices"
      orderBy="issue_date"
      searchFields={["invoice_number", "account_number", "status"]}
      emptyLabel="No invoices yet."
      createTitle="New invoice"
      createLabel="New invoice"
      emptyForm={{ customer_id: "", status: "draft", issue_date: new Date().toISOString().slice(0, 10), due_date: "", currency: "USD", subtotal: 0, tax: 0, total: 0, notes: "" }}
      validateForm={(f) => (!f.customer_id ? "Customer required" : null)}
      transformInsert={(f) => {
        const subtotal = Number(f.subtotal) || 0;
        const tax = Number(f.tax) || 0;
        return { ...f, due_date: f.due_date || null, subtotal, tax, total: subtotal + tax };
      }}
      columns={[
        { header: "Invoice #", cell: (r: any) => <Link to="/invoices/$id" params={{ id: r.id }} className="font-mono font-semibold text-solar hover:underline">{r.invoice_number}</Link> },
        { header: "Customer", cell: (r: any) => <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline">{r.account_number}</Link> },
        { header: "Status", cell: (r: any) => <StatusPill tone={r.status === "paid" ? "success" : r.status === "overdue" ? "danger" : r.status === "sent" ? "info" : "neutral"}>{r.status}</StatusPill> },
        { header: "Issued", cell: (r: any) => new Date(r.issue_date).toLocaleDateString() },
        { header: "Due", cell: (r: any) => r.due_date ? new Date(r.due_date).toLocaleDateString() : "—" },
        { header: "Subtotal", cell: (r: any) => <span className="font-mono">{r.currency} {Number(r.subtotal).toFixed(2)}</span> },
        { header: "Tax", cell: (r: any) => <span className="font-mono">{Number(r.tax).toFixed(2)}</span> },
        { header: "Total", cell: (r: any) => <span className="font-mono font-semibold">{r.currency} {Number(r.total).toFixed(2)}</span> },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2"><Label>Customer *</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} /></div>
          <div className="space-y-2"><Label>Issue date</Label><Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></div>
          <div className="space-y-2"><Label>Due date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          <div className="space-y-2"><Label>Subtotal</Label><Input type="number" step="0.01" min="0" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })} /></div>
          <div className="space-y-2"><Label>Tax</Label><Input type="number" step="0.01" min="0" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
