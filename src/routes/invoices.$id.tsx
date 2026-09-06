import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  PageShell, SectionHeader, SummaryCard, StatusBadge, toneForStatus, DetailCard,
  DataGrid, EmptyState, type ColumnDef,
} from "@/components/enterprise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { emailInvoice } from "@/lib/finance.functions";
import { Plus, Trash2, Printer, Receipt, Mail } from "lucide-react";

export const Route = createFileRoute("/invoices/$id")({
  head: () => ({ meta: [{ title: "Invoice — IMT Operations" }] }),
  component: InvoiceDetail,
});

function InvoiceDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*, customers:customer_id(company_name, account_number)").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data as any;
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["invoice-items", id],
    queryFn: async () => (await supabase.from("invoice_line_items").select("*").eq("invoice_id", id).order("position")).data ?? [],
  });
  const { data: allocs = [] } = useQuery({
    queryKey: ["invoice-allocs", id],
    queryFn: async () => (await supabase.from("payment_allocations").select("*, payments:payment_id(reference,method,paid_at,currency)").eq("invoice_id", id)).data ?? [],
  });

  const totals = (() => {
    const subtotal = items.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unit_price), 0);
    const tax = items.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unit_price) * Number(i.tax_rate) / 100, 0);
    const total = subtotal + tax;
    const paid = (allocs as any[]).reduce((s, a) => s + Number(a.amount), 0);
    return { subtotal, tax, total, paid, balance: total - paid };
  })();

  const sendInvoiceFn = useServerFn(emailInvoice);
  const sendEmail = useMutation({
    mutationFn: async () => await sendInvoiceFn({ data: { invoice_id: id } }),
    onSuccess: (r: any) => {
      toast.success(`Invoice emailed to ${r.to}`, { description: `From ${r.from}` });
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["customer360"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncTotals = useMutation({
    mutationFn: async () => {
      await supabase.from("invoices").update({
        subtotal: Math.round(totals.subtotal * 100) / 100,
        tax: Math.round(totals.tax * 100) / 100,
        total: Math.round(totals.total * 100) / 100,
      }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoice", id] }),
  });

  const removeItem = useMutation({
    mutationFn: async (itemId: string) => { await supabase.from("invoice_line_items").delete().eq("id", itemId); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoice-items", id] }); setTimeout(() => syncTotals.mutate(), 100); },
  });

  if (isLoading || !invoice) {
    return <PageShell><SectionHeader title="Loading invoice…" /></PageShell>;
  }
  const overdue = invoice.due_date && invoice.status !== "paid" && new Date(invoice.due_date) < new Date();
  const aging = invoice.due_date ? Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86400000) : 0;

  const itemCols: ColumnDef<any>[] = [
    { header: "Description", cell: (r) => r.description },
    { header: "Qty", align: "right", cell: (r) => <span className="font-mono">{r.quantity}</span> },
    { header: "Unit", align: "right", cell: (r) => <span className="font-mono">{Number(r.unit_price).toFixed(2)}</span> },
    { header: "Tax %", align: "right", cell: (r) => <span className="font-mono">{Number(r.tax_rate).toFixed(1)}%</span> },
    { header: "Total", align: "right", cell: (r) => <span className="font-mono font-semibold">{Number(r.line_total).toFixed(2)}</span> },
    { header: "", align: "right", cell: (r) => (
      <Button variant="ghost" size="sm" onClick={() => removeItem.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
    ) },
  ];

  const allocCols: ColumnDef<any>[] = [
    { header: "Payment", cell: (r) => <span className="font-mono">{r.payments?.reference || r.payment_id.slice(0, 8)}</span> },
    { header: "Method", cell: (r) => <span className="capitalize">{r.payments?.method?.replace(/_/g, " ") ?? "—"}</span> },
    { header: "Date", cell: (r) => r.payments?.paid_at ? new Date(r.payments.paid_at).toLocaleDateString() : "—" },
    { header: "Amount", align: "right", cell: (r) => <span className="font-mono">{invoice.currency} {Number(r.amount).toFixed(2)}</span> },
  ];

  return (
    <PageShell>
      <SectionHeader
        eyebrow={<Link to="/billing" className="text-solar hover:underline">← Invoices</Link>}
        title={`Invoice ${invoice.invoice_number}`}
        description={
          <span>
            For{" "}
            <Link to="/customers/$accountNumber" params={{ accountNumber: invoice.account_number }} className="text-solar hover:underline font-mono">
              {invoice.account_number}
            </Link>
            {invoice.customers?.company_name ? ` · ${invoice.customers.company_name}` : ""}
          </span>
        }
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => sendEmail.mutate()}
              disabled={sendEmail.isPending}
              className="text-solar-foreground"
              style={{ background: "var(--gradient-solar)" }}
            >
              <Mail className="h-4 w-4 mr-1.5" />
              {sendEmail.isPending ? "Sending…" : "Email invoice"}
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1.5" />Print / PDF
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <SummaryCard
          label="Status"
          tone={invoice.status === "paid" ? "success" : overdue ? "danger" : "info"}
          value={<StatusBadge tone={toneForStatus(overdue ? "overdue" : invoice.status)}>{overdue ? "overdue" : invoice.status}</StatusBadge>}
        />
        <SummaryCard label="Total" value={<span className="font-mono">{invoice.currency} {totals.total.toFixed(2)}</span>} />
        <SummaryCard label="Paid" tone="success" value={<span className="font-mono text-success">{invoice.currency} {totals.paid.toFixed(2)}</span>} />
        <SummaryCard
          label={overdue ? `Overdue ${aging}d` : "Balance"}
          tone={totals.balance > 0.001 ? (overdue ? "danger" : "warning") : "success"}
          value={<span className={`font-mono font-semibold ${totals.balance > 0.001 ? "text-destructive" : "text-success"}`}>{invoice.currency} {totals.balance.toFixed(2)}</span>}
        />
      </div>

      <DetailCard
        title="Line items"
        padded={false}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => syncTotals.mutate()}>Sync totals</Button>
            <AddLineItem invoiceId={id} onDone={() => qc.invalidateQueries({ queryKey: ["invoice-items", id] })} />
          </div>
        }
      >
        <DataGrid
          rows={items as any[]}
          columns={itemCols}
          empty={<EmptyState icon={Receipt} title="No line items" description="Add products or services to build this invoice." />}
        />
      </DetailCard>

      <DetailCard
        title="Payment allocations"
        padded={false}
        action={<AllocateDialog invoiceId={id} customerId={invoice.customer_id} balance={totals.balance} onDone={() => qc.invalidateQueries({ queryKey: ["invoice-allocs", id] })} />}
      >
        <DataGrid
          rows={allocs as any[]}
          columns={allocCols}
          empty={<EmptyState icon={Receipt} title="No payments allocated" description="Allocate a customer payment to settle this invoice." />}
        />
      </DetailCard>
    </PageShell>
  );
}

function AddLineItem({ invoiceId, onDone }: { invoiceId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ description: "", quantity: "1", unit_price: "0", tax_rate: "0" });
  const create = useMutation({
    mutationFn: async () => {
      if (!form.description.trim()) throw new Error("Description required");
      const { error } = await supabase.from("invoice_line_items").insert({
        invoice_id: invoiceId, description: form.description,
        quantity: Number(form.quantity), unit_price: Number(form.unit_price), tax_rate: Number(form.tax_rate),
      });
      if (error) throw error;
    },
    onSuccess: () => { setOpen(false); setForm({ description: "", quantity: "1", unit_price: "0", tax_rate: "0" }); onDone(); toast.success("Added"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1" />Add line</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add line item</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
          <div className="space-y-2"><Label>Description *</Label><Input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Qty</Label><Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
            <div className="space-y-2"><Label>Unit price</Label><Input type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} /></div>
            <div className="space-y-2"><Label>Tax %</Label><Input type="number" step="0.1" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} /></div>
          </div>
          <DialogFooter><Button type="submit" disabled={create.isPending}>Add</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AllocateDialog({ invoiceId, customerId, balance, onDone }: { invoiceId: string; customerId: string; balance: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState(balance.toFixed(2));
  const { data: payments = [] } = useQuery({
    queryKey: ["available-payments", customerId],
    enabled: open,
    queryFn: async () => (await supabase.from("payments").select("id,reference,amount,currency,paid_at,method").eq("customer_id", customerId).order("paid_at", { ascending: false })).data ?? [],
  });
  const alloc = useMutation({
    mutationFn: async () => {
      if (!paymentId) throw new Error("Pick a payment");
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("Amount must be positive");
      const { error } = await supabase.from("payment_allocations").insert({ payment_id: paymentId, invoice_id: invoiceId, amount: amt });
      if (error) throw error;
    },
    onSuccess: () => { setOpen(false); onDone(); toast.success("Allocated"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setAmount(balance.toFixed(2)); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline" disabled={balance <= 0}>Allocate payment</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Allocate payment to invoice</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); alloc.mutate(); }} className="space-y-4">
          <div className="space-y-2"><Label>Payment</Label>
            <Select value={paymentId} onValueChange={setPaymentId}>
              <SelectTrigger><SelectValue placeholder="Select payment" /></SelectTrigger>
              <SelectContent>{(payments as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.reference || p.id.slice(0, 8)} · {p.currency} {Number(p.amount).toFixed(2)} · {new Date(p.paid_at).toLocaleDateString()}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Amount to allocate</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <DialogFooter><Button type="submit" disabled={alloc.isPending}>Allocate</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
