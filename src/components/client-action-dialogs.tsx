import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, CreditCard, Receipt, FileCheck, LifeBuoy, Mail, Package } from "lucide-react";
import { listCatalog, assignServices } from "@/lib/catalog.functions";
import { createPaymentRecord, generateInvoiceForSubscription } from "@/lib/ops.functions";
import {
  createQuoteForCustomer, createTicketForCustomer, logCommunication,
  createInvoiceForCustomer, listAssignableStaff,
} from "@/lib/client-actions.functions";
import { supabase } from "@/integrations/supabase/client";

type LineItem = { description: string; quantity: number; unit_price: number };

export type ClientContext = {
  customerId: string;
  accountNumber: string;
  companyName: string;
  primaryEmail?: string | null;
};

export function ClientActionsBar({ ctx }: { ctx: ClientContext }) {
  const [open, setOpen] = useState<null | "service" | "payment" | "invoice" | "quote" | "ticket" | "comm">(null);

  const btnClass = "bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground";

  return (
    <>
      <div className="relative mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className={btnClass} onClick={() => setOpen("service")}>
          <Package className="h-4 w-4 mr-1.5" />Add Service
        </Button>
        <Button size="sm" variant="outline" className={btnClass} onClick={() => setOpen("payment")}>
          <CreditCard className="h-4 w-4 mr-1.5" />Update Payment
        </Button>
        <Button size="sm" variant="outline" className={btnClass} onClick={() => setOpen("invoice")}>
          <Receipt className="h-4 w-4 mr-1.5" />Create Invoice
        </Button>
        <Button size="sm" variant="outline" className={btnClass} onClick={() => setOpen("quote")}>
          <FileCheck className="h-4 w-4 mr-1.5" />New Quote
        </Button>
        <Button size="sm" variant="outline" className={btnClass} onClick={() => setOpen("ticket")}>
          <LifeBuoy className="h-4 w-4 mr-1.5" />New Ticket
        </Button>
        <Button size="sm" variant="outline" className={btnClass} onClick={() => setOpen("comm")}>
          <Mail className="h-4 w-4 mr-1.5" />Log Comm
        </Button>
      </div>

      {open === "service" && <AddServiceDialog ctx={ctx} onClose={() => setOpen(null)} />}
      {open === "payment" && <RecordPaymentDialog ctx={ctx} onClose={() => setOpen(null)} />}
      {open === "invoice" && <CreateInvoiceDialog ctx={ctx} onClose={() => setOpen(null)} />}
      {open === "quote" && <CreateQuoteDialog ctx={ctx} onClose={() => setOpen(null)} />}
      {open === "ticket" && <CreateTicketDialog ctx={ctx} onClose={() => setOpen(null)} />}
      {open === "comm" && <LogCommDialog ctx={ctx} onClose={() => setOpen(null)} />}
    </>
  );
}

function useRefresh(accountNumber: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["customer-360", accountNumber] });
    qc.invalidateQueries({ queryKey: ["customer-contacts", accountNumber] });
    qc.invalidateQueries({ queryKey: ["customer-comms", accountNumber] });
  };
}

/* ================================ Add Service ================================ */
export function AddServiceDialog({ ctx, onClose }: { ctx: ClientContext; onClose: () => void }) {
  const refresh = useRefresh(ctx.accountNumber);
  const catalogFn = useServerFn(listCatalog);
  const assignFn = useServerFn(assignServices);
  const { data: catalog = [] } = useQuery({
    queryKey: ["catalog-active"],
    queryFn: async () => (await catalogFn()) as any[],
  });
  const active = catalog.filter((c: any) => c.is_active);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<string, { qty: number; price: number }>>({});
  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    return active.filter((c: any) => !s || c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s) || c.category.toLowerCase().includes(s));
  }, [active, q]);
  const items = Object.entries(sel).map(([id, v]) => ({ ...active.find((c: any) => c.id === id), ...v }));
  const total = items.reduce((s, i: any) => s + i.qty * i.price, 0);

  const mut = useMutation({
    mutationFn: async () => assignFn({ data: { customer_id: ctx.customerId, items: items.map((i: any) => ({ catalog_id: i.id, quantity: i.qty, unit_price: i.price })) } }),
    onSuccess: () => { toast.success(`Added ${items.length} service${items.length === 1 ? "" : "s"} to ${ctx.companyName}`); refresh(); onClose(); },
    onError: (e: any) => toast.error(e?.message || "Failed to add service"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Add service · {ctx.companyName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Search catalog (code, name, category)…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-[420px] overflow-y-auto rounded-lg border divide-y">
            {filtered.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">No packages match.</p>}
            {filtered.slice(0, 100).map((c: any) => {
              const s = sel[c.id];
              return (
                <div key={c.id} className={`p-3 cursor-pointer ${s ? "bg-solar/5" : "hover:bg-muted/40"}`} onClick={() => setSel((p) => { const n = { ...p }; if (n[c.id]) delete n[c.id]; else n[c.id] = { qty: 1, price: Number(c.unit_price) }; return n; })}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2"><span className="font-mono text-xs text-solar bg-solar/10 px-1.5 py-0.5 rounded">{c.code}</span><span className="font-semibold text-sm">{c.name}</span></div>
                      <div className="text-xs text-muted-foreground capitalize">{c.category} · {c.billing_cycle}</div>
                    </div>
                    <span className="font-mono text-sm">${Number(c.unit_price).toFixed(2)}</span>
                  </div>
                  {s && (
                    <div className="mt-2 grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                      <div><Label className="text-xs">Qty</Label><Input type="number" min={1} value={s.qty} onChange={(e) => setSel((p) => ({ ...p, [c.id]: { ...p[c.id], qty: Math.max(1, Number(e.target.value) || 1) } }))} className="h-8" /></div>
                      <div><Label className="text-xs">Unit price</Label><Input type="number" step="0.01" value={s.price} onChange={(e) => setSel((p) => ({ ...p, [c.id]: { ...p[c.id], price: Number(e.target.value) || 0 } }))} className="h-8" /></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {items.length > 0 && <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3 text-sm"><span>{items.length} selected</span><span className="font-bold text-solar">${total.toFixed(2)}</span></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={items.length === 0 || mut.isPending} onClick={() => mut.mutate()} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
            {mut.isPending ? "Adding…" : `Add ${items.length || ""} service${items.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =============================== Record Payment ============================== */
export function RecordPaymentDialog({ ctx, onClose }: { ctx: ClientContext; onClose: () => void }) {
  const refresh = useRefresh(ctx.accountNumber);
  const payFn = useServerFn(createPaymentRecord);
  const [form, setForm] = useState({
    amount: "" as string, currency: "USD", method: "cash",
    reference: "", invoice_id: "__none__", notes: "",
    paid_at: new Date().toISOString().slice(0, 10),
  });
  const { data: openInvoices = [] } = useQuery({
    queryKey: ["customer-open-invoices", ctx.customerId],
    queryFn: async () => (await supabase.from("invoices")
      .select("id, invoice_number, total, currency, status, due_date")
      .eq("customer_id", ctx.customerId).in("status", ["sent", "partial", "overdue"])
      .order("issue_date", { ascending: false })).data ?? [],
  });

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(form.amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Enter a payment amount");
      const allocs = form.invoice_id && form.invoice_id !== "__none__" ? [{ invoice_id: form.invoice_id, amount: amt }] : [];
      return payFn({ data: {
        customer_id: ctx.customerId,
        amount: amt, currency: form.currency, method: form.method,
        reference: form.reference || undefined, notes: form.notes || undefined,
        paid_at: form.paid_at,
        allocations: allocs,
      } });
    },
    onSuccess: (r: any) => { toast.success(`Payment recorded · Receipt ${r?.receipt_number || ""}`); refresh(); onClose(); },
    onError: (e: any) => toast.error(e?.message || "Failed to record payment"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Update payment · {ctx.companyName}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Amount *</Label><Input type="number" step="0.01" autoFocus value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-1"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></div>
          <div className="space-y-1"><Label>Method *</Label>
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["cash", "bank_transfer", "mobile_money", "card", "cheque", "other"].map((m) => <SelectItem key={m} value={m}>{m.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Paid on</Label><Input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} /></div>
          <div className="col-span-2 space-y-1"><Label>Allocate to invoice (optional)</Label>
            <Select value={form.invoice_id} onValueChange={(v) => setForm({ ...form, invoice_id: v })}>
              <SelectTrigger><SelectValue placeholder="No allocation" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— No allocation (unallocated) —</SelectItem>
                {openInvoices.map((i: any) => (
                  <SelectItem key={i.id} value={i.id}>{i.invoice_number} · {i.currency} {Number(i.total).toFixed(2)} · {i.status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1"><Label>Reference</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Bank ref, mobile money ID, cheque #" /></div>
          <div className="col-span-2 space-y-1"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={mut.isPending} onClick={() => mut.mutate()} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
            {mut.isPending ? "Recording…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =============================== Create Invoice ============================== */
function CreateInvoiceDialog({ ctx, onClose }: { ctx: ClientContext; onClose: () => void }) {
  const refresh = useRefresh(ctx.accountNumber);
  const invFn = useServerFn(createInvoiceForCustomer);
  const subInvFn = useServerFn(generateInvoiceForSubscription);
  const [mode, setMode] = useState<"custom" | "subscription">("custom");
  const [form, setForm] = useState({ currency: "USD", due_days: 14, tax_rate: 0, notes: "", items: [{ description: "", quantity: 1, unit_price: 0 }] as LineItem[] });
  const [subId, setSubId] = useState<string>("");

  const { data: subs = [] } = useQuery({
    queryKey: ["customer-active-subs", ctx.customerId],
    queryFn: async () => (await supabase.from("subscriptions")
      .select("id, plan_name, amount, currency, billing_cycle, status")
      .eq("customer_id", ctx.customerId).eq("status", "active")).data ?? [],
  });

  const total = form.items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);

  const mut = useMutation({
    mutationFn: async () => {
      if (mode === "subscription") {
        if (!subId) throw new Error("Pick a subscription");
        return subInvFn({ data: { subscription_id: subId } });
      }
      return invFn({ data: {
        customer_id: ctx.customerId,
        currency: form.currency, due_days: form.due_days, tax_rate: form.tax_rate,
        notes: form.notes || undefined,
        items: form.items,
      } });
    },
    onSuccess: (r: any) => { toast.success(`Invoice ${r?.invoice_number || ""} created`); refresh(); onClose(); },
    onError: (e: any) => toast.error(e?.message || "Failed to create invoice"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Create invoice · {ctx.companyName}</DialogTitle></DialogHeader>
        <div className="flex gap-2 mb-3">
          <Button size="sm" variant={mode === "custom" ? "default" : "outline"} onClick={() => setMode("custom")}>Custom line items</Button>
          <Button size="sm" variant={mode === "subscription" ? "default" : "outline"} onClick={() => setMode("subscription")}>From subscription</Button>
        </div>
        {mode === "subscription" ? (
          <div className="space-y-2">
            <Label>Subscription</Label>
            <Select value={subId} onValueChange={setSubId}>
              <SelectTrigger><SelectValue placeholder="Pick a subscription…" /></SelectTrigger>
              <SelectContent>
                {subs.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.plan_name} · {s.currency} {Number(s.amount).toFixed(2)}/{s.billing_cycle}</SelectItem>)}
                {subs.length === 0 && <div className="p-4 text-sm text-muted-foreground">No active subscriptions.</div>}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-xs">Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></div>
              <div><Label className="text-xs">Due (days)</Label><Input type="number" value={form.due_days} onChange={(e) => setForm({ ...form, due_days: Number(e.target.value) || 0 })} /></div>
              <div><Label className="text-xs">Tax %</Label><Input type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) || 0 })} /></div>
            </div>
            <div className="rounded-md border divide-y">
              <div className="p-2 grid grid-cols-[1fr_80px_100px_36px] gap-2 text-[10px] uppercase text-muted-foreground font-semibold">
                <div>Description</div><div>Qty</div><div>Unit price</div><div></div>
              </div>
              {form.items.map((it, idx) => (
                <div key={idx} className="p-2 grid grid-cols-[1fr_80px_100px_36px] gap-2">
                  <Input value={it.description} onChange={(e) => setForm({ ...form, items: form.items.map((x, i) => i === idx ? { ...x, description: e.target.value } : x) })} placeholder="e.g. Cloud hosting — May" />
                  <Input type="number" min={1} value={it.quantity} onChange={(e) => setForm({ ...form, items: form.items.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) || 0 } : x) })} />
                  <Input type="number" step="0.01" value={it.unit_price} onChange={(e) => setForm({ ...form, items: form.items.map((x, i) => i === idx ? { ...x, unit_price: Number(e.target.value) || 0 } : x) })} />
                  <Button size="icon" variant="ghost" onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })} disabled={form.items.length === 1}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
              <div className="p-2"><Button size="sm" variant="outline" onClick={() => setForm({ ...form, items: [...form.items, { description: "", quantity: 1, unit_price: 0 }] })}><Plus className="h-3.5 w-3.5 mr-1" />Add line</Button></div>
            </div>
            <div className="text-right text-sm">Subtotal: <span className="font-bold">${total.toFixed(2)}</span></div>
            <Textarea rows={2} placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={mut.isPending} onClick={() => mut.mutate()} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
            {mut.isPending ? "Creating…" : "Create invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ================================ Create Quote =============================== */
function CreateQuoteDialog({ ctx, onClose }: { ctx: ClientContext; onClose: () => void }) {
  const refresh = useRefresh(ctx.accountNumber);
  const fn = useServerFn(createQuoteForCustomer);
  const [form, setForm] = useState({
    title: "", currency: "USD", valid_until: "", status: "draft", notes: "",
    items: [{ description: "", quantity: 1, unit_price: 0 }] as LineItem[],
  });
  const total = form.items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);
  const mut = useMutation({
    mutationFn: async () => fn({ data: { customer_id: ctx.customerId, ...form, valid_until: form.valid_until || null } }),
    onSuccess: (q: any) => { toast.success(`Quote ${q?.quote_number || ""} created`); refresh(); onClose(); },
    onError: (e: any) => toast.error(e?.message || "Failed to create quote"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New quote · {ctx.companyName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2"><Label>Title *</Label><Input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Q2 infra refresh" /></div>
            <div><Label className="text-xs">Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></div>
            <div><Label className="text-xs">Valid until</Label><Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div>
          </div>
          <div className="rounded-md border divide-y">
            {form.items.map((it, idx) => (
              <div key={idx} className="p-2 grid grid-cols-[1fr_70px_90px_32px] gap-2">
                <Input value={it.description} onChange={(e) => setForm({ ...form, items: form.items.map((x, i) => i === idx ? { ...x, description: e.target.value } : x) })} placeholder="Line description" />
                <Input type="number" min={1} value={it.quantity} onChange={(e) => setForm({ ...form, items: form.items.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) || 0 } : x) })} />
                <Input type="number" step="0.01" value={it.unit_price} onChange={(e) => setForm({ ...form, items: form.items.map((x, i) => i === idx ? { ...x, unit_price: Number(e.target.value) || 0 } : x) })} />
                <Button size="icon" variant="ghost" onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })} disabled={form.items.length === 1}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
            <div className="p-2"><Button size="sm" variant="outline" onClick={() => setForm({ ...form, items: [...form.items, { description: "", quantity: 1, unit_price: 0 }] })}><Plus className="h-3.5 w-3.5 mr-1" />Add line</Button></div>
          </div>
          <div className="text-right text-sm">Total: <span className="font-bold">${total.toFixed(2)}</span></div>
          <Textarea rows={2} placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={mut.isPending || !form.title.trim()} onClick={() => mut.mutate()} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
            {mut.isPending ? "Creating…" : "Create quote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ================================ Create Ticket ============================== */
function CreateTicketDialog({ ctx, onClose }: { ctx: ClientContext; onClose: () => void }) {
  const refresh = useRefresh(ctx.accountNumber);
  const fn = useServerFn(createTicketForCustomer);
  const staffFn = useServerFn(listAssignableStaff);
  const { data: staff = [] } = useQuery({ queryKey: ["assignable-staff"], queryFn: async () => (await staffFn()) as any[] });
  const [form, setForm] = useState({ subject: "", description: "", priority: "normal", category: "", assigned_to: "__unassigned__" });
  const mut = useMutation({
    mutationFn: async () => fn({ data: { customer_id: ctx.customerId, ...form, assigned_to: form.assigned_to === "__unassigned__" ? null : form.assigned_to, category: form.category || undefined } }),
    onSuccess: (t: any) => { toast.success(`Ticket ${t?.ticket_number} created`); refresh(); onClose(); },
    onError: (e: any) => toast.error(e?.message || "Failed to create ticket"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New ticket · {ctx.companyName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Subject *</Label><Input autoFocus value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
          <div><Label>Description</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["low", "normal", "high", "critical"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Networking, cloud…" /></div>
          </div>
          <div><Label>Assign to</Label>
            <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">— Unassigned —</SelectItem>
                {staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.role}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={mut.isPending || !form.subject.trim()} onClick={() => mut.mutate()} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
            {mut.isPending ? "Creating…" : "Create ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================== Log Communication ============================ */
function LogCommDialog({ ctx, onClose }: { ctx: ClientContext; onClose: () => void }) {
  const refresh = useRefresh(ctx.accountNumber);
  const fn = useServerFn(logCommunication);
  const { data: contacts = [] } = useQuery({
    queryKey: ["customer-contacts", ctx.accountNumber],
    queryFn: async () => (await supabase.from("customer_contacts").select("id, name, email, phone, is_primary").eq("customer_id", ctx.customerId).is("archived_at", null)).data ?? [],
  });
  const primary = (contacts as any[]).find((c) => c.is_primary) || (contacts as any[])[0];
  const [form, setForm] = useState({ channel: "call", direction: "outbound", subject: "", body: "", contact_id: "__primary__", occurred_at: new Date().toISOString().slice(0, 16) });
  const mut = useMutation({
    mutationFn: async () => fn({ data: {
      customer_id: ctx.customerId,
      channel: form.channel, direction: form.direction,
      subject: form.subject || undefined, body: form.body || undefined,
      contact_id: form.contact_id !== "__primary__" ? form.contact_id : primary?.id,
      occurred_at: form.occurred_at,
    } }),
    onSuccess: () => { toast.success("Communication logged"); refresh(); onClose(); },
    onError: (e: any) => toast.error(e?.message || "Failed to log"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Log communication · {ctx.companyName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Channel</Label>
              <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["call", "email", "whatsapp", "sms", "meeting", "note"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Direction</Label>
              <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["outbound", "inbound"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Contact person</Label>
            <Select value={form.contact_id} onValueChange={(v) => setForm({ ...form, contact_id: v })}>
              <SelectTrigger><SelectValue placeholder={primary ? `Primary · ${primary.name}` : "No contacts"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__primary__">{primary ? `Primary · ${primary.name}` : "— No primary contact —"}</SelectItem>
                {(contacts as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Renewal discussion" /></div>
          <div><Label>Summary</Label><Textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="What was discussed / next steps" /></div>
          <div><Label>When</Label><Input type="datetime-local" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={mut.isPending} onClick={() => mut.mutate()} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
            {mut.isPending ? "Logging…" : "Log communication"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
