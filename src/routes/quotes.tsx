import { createFileRoute, Link } from "@tanstack/react-router";
import { ModulePage, useCustomersLite } from "@/components/module-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/page";

const STATUSES = ["draft", "sent", "accepted", "rejected", "expired"];

export const Route = createFileRoute("/quotes")({
  head: () => ({ meta: [{ title: "Quotes — IMT Operations" }] }),
  component: QuotesPage,
});

function QuotesPage() {
  const { data: customers = [] } = useCustomersLite();
  return (
    <ModulePage
      eyebrow="Business"
      title="Quotes"
      description="Sales quotes and proposals sent to customers."
      table="quotes"
      queryKey="quotes"
      searchFields={["title", "quote_number", "account_number", "status"]}
      emptyLabel="No quotes yet."
      createTitle="New quote"
      createLabel="New quote"
      emptyForm={{ customer_id: "", quote_number: "", title: "", amount: 0, currency: "USD", status: "draft", valid_until: "", notes: "" }}
      validateForm={(f) => (!f.customer_id ? "Customer required" : !f.title ? "Title required" : null)}
      transformInsert={(f) => ({ ...f, amount: Number(f.amount) || 0, valid_until: f.valid_until || null })}
      columns={[
        { header: "Quote", cell: (r: any) => <div><div className="font-semibold">{r.title}</div><div className="text-xs text-muted-foreground font-mono">{r.quote_number || "—"}</div></div> },
        { header: "Customer", cell: (r: any) => <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline">{r.account_number}</Link> },
        { header: "Amount", cell: (r: any) => <span className="font-mono">{r.currency} {Number(r.amount).toLocaleString()}</span> },
        { header: "Status", cell: (r: any) => <StatusPill tone={r.status === "accepted" ? "success" : r.status === "rejected" || r.status === "expired" ? "danger" : r.status === "sent" ? "info" : "neutral"}>{r.status}</StatusPill> },
        { header: "Valid until", cell: (r: any) => r.valid_until ? new Date(r.valid_until).toLocaleDateString() : "—" },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2"><Label>Customer *</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Quote number</Label><Input value={form.quote_number} onChange={(e) => setForm({ ...form, quote_number: e.target.value })} placeholder="Q-2026-001" /></div>
          <div className="space-y-2"><Label>Title *</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="space-y-2"><Label>Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-2"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
          <div className="space-y-2"><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Valid until</Label><Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
