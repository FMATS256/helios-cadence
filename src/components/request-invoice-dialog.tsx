import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { requestInvoice } from "@/lib/billing.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Line = { description: string; quantity: number; unit_price: number };

/**
 * Account-manager entry point: asks billing to raise an invoice.
 * Nothing is invoiced here — billing reviews the request first.
 */
export function RequestInvoiceDialog({
  open, onOpenChange, customerId, companyName, currency = "USD",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  companyName?: string;
  currency?: string;
}) {
  const qc = useQueryClient();
  const send = useServerFn(requestInvoice);
  const [title, setTitle] = useState("");
  const [dueDays, setDueDays] = useState("14");
  const [neededBy, setNeededBy] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Line[]>([{ description: "", quantity: 1, unit_price: 0 }]);
  const [busy, setBusy] = useState(false);

  const total = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);

  function setItem(idx: number, patch: Partial<Line>) {
    setItems((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function submit() {
    if (title.trim().length < 3) return toast.error("Describe what should be invoiced");
    setBusy(true);
    try {
      await send({
        data: {
          customer_id: customerId,
          title: title.trim(),
          items: items.filter((i) => i.description.trim()),
          currency,
          due_days: Number(dueDays) || 14,
          needed_by: neededBy || undefined,
          notes: notes.trim() || undefined,
        },
      });
      toast.success("Sent to billing — pending review");
      setTitle(""); setNotes(""); setNeededBy("");
      setItems([{ description: "", quantity: 1, unit_price: 0 }]);
      onOpenChange(false);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send the request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request invoice{companyName ? ` · ${companyName}` : ""}</DialogTitle>
          <DialogDescription>
            Billing reviews the request and raises the invoice. You can then send it to the customer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>What should be invoiced *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Starlink installation — September" />
          </div>

          <div className="space-y-2">
            <Label>Suggested lines</Label>
            {items.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <Input className="col-span-6" placeholder="Description" value={l.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                <Input className="col-span-2" type="number" step="0.01" value={l.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} />
                <Input className="col-span-3" type="number" step="0.01" value={l.unit_price} onChange={(e) => setItem(i, { unit_price: Number(e.target.value) })} />
                <Button variant="ghost" size="sm" className="col-span-1" onClick={() => setItems((p) => p.filter((_, x) => x !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setItems((p) => [...p, { description: "", quantity: 1, unit_price: 0 }])}>
                <Plus className="mr-1.5 h-4 w-4" />Add line
              </Button>
              <span className="text-sm text-muted-foreground">Estimated {currency} {total.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Payment terms (days)</Label>
              <Input type="number" min="0" value={dueDays} onChange={(e) => setDueDays(e.target.value)} />
            </div>
            <div>
              <Label>Needed by</Label>
              <Input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Notes for billing</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything billing should know…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy} onClick={submit}>
            <Send className="mr-1.5 h-4 w-4" />{busy ? "Sending…" : "Send to billing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
