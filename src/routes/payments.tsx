import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ModulePage, useCustomersLite } from "@/components/module-page";
import { createPaymentRecord } from "@/lib/ops.functions";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/page";

const METHODS = ["bank_transfer", "credit_card", "cash", "cheque", "other"];
const STATUSES = ["received", "pending", "failed", "refunded"];

export const Route = createFileRoute("/payments")({
  head: () => ({ meta: [{ title: "Payments — IMT Operations" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { data: customers = [] } = useCustomersLite();
  const createPayment = useServerFn(createPaymentRecord);
  const { user } = useAuth();
  return (
    <ModulePage
      eyebrow="Business"
      title="Payments"
      description="Payments received from customers and their reconciliation status."
      table="payments"
      queryKey="payments"
      orderBy="paid_at"
      searchFields={["reference", "account_number", "method", "status"]}
      emptyLabel="No payments recorded yet."
      createTitle="Record payment"
      createDescription="Capture the customer payment, walk-in details, receipt reference and reconciliation status."
      createLabel="Record payment"
      emptyForm={{ customer_id: "", walk_in_name: "", walk_in_email: "", walk_in_phone: "", amount: 0, currency: "USD", method: "cash", reference: "", status: "received", paid_at: new Date().toISOString().slice(0, 10), notes: "" }}
      validateForm={(f) => (!f.customer_id ? "Customer required" : f.customer_id === "__walkin__" && !f.walk_in_name ? "Walk-in client name required" : !f.amount ? "Amount required" : null)}
      transformInsert={(f) => ({ ...f, amount: Number(f.amount), paid_at: f.paid_at ? new Date(f.paid_at).toISOString() : new Date().toISOString() })}
      onCreate={(f) => {
        if (!user) throw new Error("Please sign in before recording payments.");
        return createPayment({ data: f });
      }}
      columns={[
        { header: "Reference", cell: (r: any) => <div><div className="font-semibold">{r.reference || "—"}</div><div className="text-xs text-muted-foreground">{r.method?.replace(/_/g, " ")}</div></div> },
        { header: "Customer", cell: (r: any) => <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline">{r.account_number}</Link> },
        { header: "Amount", cell: (r: any) => <span className="font-mono font-semibold">{r.currency} {Number(r.amount).toLocaleString()}</span> },
        { header: "Status", cell: (r: any) => <StatusPill tone={r.status === "received" ? "success" : r.status === "failed" ? "danger" : r.status === "refunded" ? "warning" : "neutral"}>{r.status}</StatusPill> },
        { header: "Paid at", cell: (r: any) => new Date(r.paid_at).toLocaleDateString() },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2"><Label>Customer *</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__walkin__">Walk-in client / cash customer</SelectItem>
                {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {form.customer_id === "__walkin__" && (
            <>
              <div className="space-y-2"><Label>Walk-in name *</Label><Input required value={form.walk_in_name} onChange={(e) => setForm({ ...form, walk_in_name: e.target.value })} placeholder="Client name" /></div>
              <div className="space-y-2"><Label>Walk-in phone</Label><Input value={form.walk_in_phone} onChange={(e) => setForm({ ...form, walk_in_phone: e.target.value })} placeholder="Phone number" /></div>
              <div className="space-y-2 md:col-span-2"><Label>Walk-in email</Label><Input type="email" value={form.walk_in_email} onChange={(e) => setForm({ ...form, walk_in_email: e.target.value })} placeholder="optional@email.com" /></div>
            </>
          )}
          <div className="space-y-2"><Label>Amount *</Label><Input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-2"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
          <div className="space-y-2"><Label>Method</Label>
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Reference</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="TXN-…" /></div>
          <div className="space-y-2"><Label>Paid at</Label><Input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
