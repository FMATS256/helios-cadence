import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCustomersLite } from "@/components/module-page";
import { saveCustomerDocument } from "@/lib/customer360.functions";
import { getSubmissionContext, submitPaymentToBilling } from "@/lib/payment-submissions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money as fmtMoney } from "@/components/enterprise";
import { AlertTriangle, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";

const METHODS = ["bank_transfer", "mobile_money", "cash", "cheque", "credit_card", "other"];

/**
 * Account-manager entry point: sends payment evidence to billing for
 * verification. Nothing is posted to the ledger here.
 */
export function SubmitPaymentDialog({
  open, onOpenChange, customerId, invoiceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId?: string;
  invoiceId?: string | null;
}) {
  const qc = useQueryClient();
  const { data: customers = [] } = useCustomersLite();
  const loadCtx = useServerFn(getSubmissionContext);
  const submit = useServerFn(submitPaymentToBilling);
  const saveDoc = useServerFn(saveCustomerDocument);

  const [customer, setCustomer] = useState(customerId ?? "");
  const [invoice, setInvoice] = useState(invoiceId ?? "none");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [account, setAccount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dupWarning, setDupWarning] = useState<string | null>(null);

  const activeCustomer = customerId ?? customer;

  const { data: ctx } = useQuery({
    queryKey: ["submission-context", activeCustomer],
    queryFn: () => loadCtx({ data: { customer_id: activeCustomer } }),
    enabled: open && !!activeCustomer,
  });

  const openInvoices = (ctx?.openInvoices ?? []) as any[];
  const selected = openInvoices.find((i) => i.id === invoice);
  const accounts = ((ctx as any)?.cashAccounts ?? []) as any[];
  const activeAccount = account || accounts.find((a) => a.is_default)?.id || "";

  function reset() {
    setAmount(""); setReference(""); setNotes(""); setFile(null);
    setInvoice(invoiceId ?? "none"); setDupWarning(null);
  }

  async function send(acknowledge = false) {
    if (!activeCustomer) return toast.error("Select a customer");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return toast.error("Enter the amount received");
    setBusy(true);
    try {
      let proofId: string | null = null;
      if (file) {
        const path = `${activeCustomer}/billing/proof_of_payment/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error } = await supabase.storage.from("customer-documents").upload(path, file, { upsert: false });
        if (error) throw error;
        const doc: any = await saveDoc({
          data: {
            customer_id: activeCustomer,
            doc_key: "proof_of_payment",
            doc_label: "Proof of payment",
            category: "billing",
            file_path: path,
            file_name: file.name,
            mime_type: file.type,
            file_size: file.size,
          },
        });
        proofId = doc?.id ?? null;
      }
      await submit({
        data: {
          customer_id: activeCustomer,
          invoice_id: invoice === "none" ? null : invoice,
          amount: value,
          method,
          payment_date: date,
          reference: reference.trim() || null,
          proof_document_id: proofId,
          cash_account_id: activeAccount || null,
          notes: notes.trim() || null,
          acknowledge_duplicate: acknowledge,
        },
      });
      toast.success("Sent to billing — pending verification");
      setDupWarning(null);
      reset();
      onOpenChange(false);
      qc.invalidateQueries();
    } catch (e: any) {
      const msg = e?.message ?? "Could not submit the payment";
      if (/duplicate/i.test(msg) && !acknowledge) setDupWarning(msg);
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setDupWarning(null); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit payment to billing</DialogTitle>
          <DialogDescription>
            Billing verifies the evidence before the payment is recorded and the invoice balance changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!customerId && (
            <div>
              <Label>Customer</Label>
              <Select value={customer} onValueChange={(v) => { setCustomer(v); setInvoice("none"); }}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {(customers as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name} · {c.account_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Invoice</Label>
            <Select value={invoice} onValueChange={setInvoice}>
              <SelectTrigger><SelectValue placeholder="Unallocated" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific invoice</SelectItem>
                {openInvoices.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.invoice_number} · balance {fmtMoney(i.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && (
              <p className="mt-1 text-xs text-muted-foreground">
                Invoice total {fmtMoney(selected.total)} · already paid {fmtMoney(selected.paid_amount)} · outstanding {fmtMoney(selected.balance)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount received</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Payment date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank / transaction ref" />
            </div>
          </div>

          <div>
            <Label className="flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" />Proof of payment</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>

          <div>
            <Label>Notes for billing</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything billing should know…" />
          </div>

          {dupWarning && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="flex items-start gap-2 font-medium text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Possible duplicate
              </p>
              <p className="mt-1 text-muted-foreground">{dupWarning}</p>
              <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => send(true)}>
                It is a separate payment — submit anyway
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy} onClick={() => send(false)}>
            <Send className="mr-1.5 h-4 w-4" />{busy ? "Submitting…" : "Submit to billing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
