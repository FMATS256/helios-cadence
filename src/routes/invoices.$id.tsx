import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Printer } from "lucide-react";

export const Route = createFileRoute("/invoices/$id")({
  head: () => ({ meta: [{ title: "Invoice — IMT Operations" }] }),
  component: InvoiceDetail,
});

function InvoiceDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: invoice } = useQuery({
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

  // Keep invoice totals in sync from line items
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

  if (!invoice) return <PageContainer><PageHeader title="Loading…" /></PageContainer>;
  const overdue = invoice.due_date && invoice.status !== "paid" && new Date(invoice.due_date) < new Date();
  const aging = invoice.due_date ? Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86400000) : 0;

  return (
    <PageContainer>
      <PageHeader
        eyebrow={<Link to="/billing" className="text-solar hover:underline">← Billing</Link> as any}
        title={`Invoice ${invoice.invoice_number}`}
        description={<span>For <Link to="/customers/$accountNumber" params={{ accountNumber: invoice.account_number }} className="text-solar hover:underline font-mono">{invoice.account_number}</Link> · {invoice.customers?.company_name}</span> as any}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print / PDF</Button>
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-4">
        <SummaryCard label="Status" value={<StatusPill tone={invoice.status === "paid" ? "success" : overdue ? "danger" : "info"}>{overdue ? "overdue" : invoice.status}</StatusPill>} />
        <SummaryCard label="Total" value={<span className="font-mono">{invoice.currency} {totals.total.toFixed(2)}</span>} />
        <SummaryCard label="Paid" value={<span className="font-mono text-success">{invoice.currency} {totals.paid.toFixed(2)}</span>} />
        <SummaryCard label={overdue ? `Overdue ${aging}d` : "Balance"} value={<span className={`font-mono font-semibold ${totals.balance > 0 ? "text-destructive" : "text-success"}`}>{invoice.currency} {totals.balance.toFixed(2)}</span>} />
      </div>

      <Card>
        <div className="p-4 flex items-center justify-between border-b">
          <h3 className="font-display font-semibold">Line items</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => syncTotals.mutate()}>Sync totals</Button>
            <AddLineItem invoiceId={id} onDone={() => qc.invalidateQueries({ queryKey: ["invoice-items", id] })} />
          </div>
        </div>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No line items yet.</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Description</TableHead><TableHead>Qty</TableHead><TableHead>Unit</TableHead><TableHead>Tax %</TableHead><TableHead>Total</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {items.map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.description}</TableCell>
                    <TableCell className="font-mono">{i.quantity}</TableCell>
                    <TableCell className="font-mono">{Number(i.unit_price).toFixed(2)}</TableCell>
                    <TableCell className="font-mono">{Number(i.tax_rate).toFixed(1)}%</TableCell>
                    <TableCell className="font-mono font-semibold">{Number(i.line_total).toFixed(2)}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => removeItem.mutate(i.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <div className="p-4 flex items-center justify-between border-b">
          <h3 className="font-display font-semibold">Payment allocations</h3>
          <AllocateDialog invoiceId={id} customerId={invoice.customer_id} balance={totals.balance} onDone={() => qc.invalidateQueries({ queryKey: ["invoice-allocs", id] })} />
        </div>
        <CardContent className="p-0">
          {allocs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No payments allocated yet.</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Payment</TableHead><TableHead>Method</TableHead><TableHead>Date</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {(allocs as any[]).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono">{a.payments?.reference || a.payment_id.slice(0, 8)}</TableCell>
                    <TableCell>{a.payments?.method?.replace(/_/g, " ")}</TableCell>
                    <TableCell>{a.payments?.paid_at ? new Date(a.payments.paid_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="font-mono">{invoice.currency} {Number(a.amount).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function SummaryCard({ label, value }: { label: string; value: React.ReactNode }) {
  return <Card><CardContent className="p-5"><p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p><div className="mt-2 text-2xl font-bold">{value}</div></CardContent></Card>;
}

function AddLineItem({ invoiceId, onDone }: { invoiceId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ description: "", quantity: "1", unit_price: "0", tax_rate: "0" });
  const create = useMutation({
    mutationFn: async () => {
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
      const { error } = await supabase.from("payment_allocations").insert({ payment_id: paymentId, invoice_id: invoiceId, amount: Number(amount) });
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
