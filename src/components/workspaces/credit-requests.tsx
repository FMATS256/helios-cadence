/**
 * Billing → Credits: account-manager requests to apply money already sitting on
 * a customer's account. One click settles the invoice and logs everything.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listCreditRequests, applyCustomerCredit } from "@/lib/credits.functions";
import { EmptyState, SectionHeader, StatusBadge } from "@/components/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Wallet, Zap, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const money = (n: number, cur = "USD") =>
  `${cur} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CreditRequestList({ onChanged }: { onChanged?: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(listCreditRequests);
  const apply = useServerFn(applyCustomerCredit);
  const [choose, setChoose] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["credit-requests"],
    queryFn: () => load({ data: {} }),
  });
  const canManage = !!data?.canManage;
  const requests = (data?.requests ?? []) as any[];
  const open = requests.filter((r) => r.status === "open");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["credit-requests"] });
    qc.invalidateQueries({ queryKey: ["billing-workspace"] });
    qc.invalidateQueries({ queryKey: ["finance-workspace"] });
    onChanged?.();
  };

  const applyM = useMutation({
    mutationFn: (v: { customer_id: string; amount?: number; invoice_id?: string; note?: string }) =>
      apply({ data: v }),
    onSuccess: (res: any) => {
      toast.success(
        `${money(res.applied, res.currency)} applied to ${res.invoices.map((i: any) => i.invoice_number).join(", ")}` +
        (res.services_resumed ? ` · ${res.services_resumed} service(s) resumed` : ""),
      );
      setChoose(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Account credit"
        title="Credit application requests"
        description="Money already received and held on the account. Apply it to settle an invoice in one click."
      />

      {isLoading && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>}

      {!isLoading && !open.length && (
        <EmptyState
          icon={Wallet}
          title="No credit waiting"
          description="When an account manager asks for credit to be applied, it appears here."
        />
      )}

      <div className="grid gap-3">
        {open.map((r) => (
          <Card key={r.id} className="border-l-4 border-l-teal-500">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to="/customers/$accountNumber"
                      params={{ accountNumber: r.account_number }}
                      className="font-semibold hover:underline"
                    >
                      {r.company_name}
                    </Link>
                    <span className="text-xs text-muted-foreground">{r.account_number}</span>
                    <StatusBadge tone="info">{r.disposition === "service" ? "to service" : "new invoice"}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.instruction ?? "Apply the credit"}
                    {r.service_label ? ` · ${r.service_label}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Requested by {r.requested_by_name} · {new Date(r.requested_at).toLocaleString()}
                    {r.note ? ` · “${r.note}”` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-teal-600 dark:text-teal-400">
                    {money(r.credit_available, r.currency)}
                  </div>
                  <div className="text-xs text-muted-foreground">credit on account</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {r.open_invoices.length === 0 ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    No unpaid invoice yet — raise the invoice, then apply the credit.
                  </span>
                ) : (
                  r.open_invoices.slice(0, 4).map((i: any) => (
                    <span
                      key={i.id}
                      className={`border px-2 py-1 ${i.is_overdue ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground"}`}
                    >
                      {i.invoice_number} · {money(i.balance, i.currency)}
                    </span>
                  ))
                )}
              </div>

              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!r.ready || applyM.isPending}
                    onClick={() => applyM.mutate({ customer_id: r.customer_id, amount: r.amount || undefined })}
                    className="bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    {applyM.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Zap className="h-4 w-4 mr-1.5" />}
                    Apply {money(Math.min(r.amount || r.credit_available, r.credit_available), r.currency)}
                  </Button>
                  <Button size="sm" variant="outline" disabled={!r.ready} onClick={() => setChoose(r)}>
                    Choose invoice…
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }}>
                      <ExternalLink className="h-4 w-4 mr-1.5" />Open customer
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {choose && (
        <ApplyToInvoiceDialog
          request={choose}
          pending={applyM.isPending}
          onClose={() => setChoose(null)}
          onApply={(v) => applyM.mutate({ customer_id: choose.customer_id, ...v })}
        />
      )}
    </div>
  );
}

function ApplyToInvoiceDialog({
  request, pending, onClose, onApply,
}: {
  request: any; pending: boolean; onClose: () => void;
  onApply: (v: { invoice_id?: string; amount?: number; note?: string }) => void;
}) {
  const [invoiceId, setInvoiceId] = useState<string>(request.open_invoices[0]?.id ?? "");
  const invoice = request.open_invoices.find((i: any) => i.id === invoiceId);
  const max = Math.min(request.credit_available, Number(invoice?.balance ?? request.credit_available));
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState("");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply credit · {request.company_name}</DialogTitle>
          <DialogDescription>
            {money(request.credit_available, request.currency)} available on the account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Invoice to settle</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger><SelectValue placeholder="Choose an invoice" /></SelectTrigger>
              <SelectContent>
                {request.open_invoices.map((i: any) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.invoice_number} · {money(i.balance, i.currency)}{i.is_overdue ? " · overdue" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount</Label>
            <Input
              type="number" step="0.01" min="0" value={amount}
              placeholder={max.toFixed(2)} onChange={(e) => setAmount(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">Leave blank to apply {money(max, request.currency)}.</p>
          </div>
          <div>
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional reference for the ledger" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || !invoiceId}
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => onApply({
              invoice_id: invoiceId,
              amount: amount ? Number(amount) : undefined,
              note: note || undefined,
            })}
          >
            {pending ? "Applying…" : "Apply credit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
