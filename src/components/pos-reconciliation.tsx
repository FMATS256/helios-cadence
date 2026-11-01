import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { DataGrid, DetailCard, StatusBadge, EmptyState, money, shortDate } from "@/components/enterprise";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Scale, ClipboardCheck } from "lucide-react";
import { getPosReconciliation, reconcilePosSale, reviewPosCloseout } from "@/lib/pos.functions";

/** Finance-only queue: confirm each counter sale against the money actually received. */
export function PosReconciliation({ accounts }: { accounts: any[] }) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getPosReconciliation);
  const reconcileFn = useServerFn(reconcilePosSale);
  const reviewFn = useServerFn(reviewPosCloseout);
  const { data, isLoading } = useQuery({ queryKey: ["pos-reconciliation"], queryFn: async () => (await fetchFn()) as any });
  const sales: any[] = data?.sales ?? [];
  const payments: any[] = data?.payments ?? [];
  const closeouts: any[] = data?.closeouts ?? [];

  const [active, setActive] = useState<any | null>(null);
  const [mode, setMode] = useState<"record" | "match" | "dispute">("record");
  const [accountId, setAccountId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [note, setNote] = useState("");
  const [review, setReview] = useState<any | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pos-reconciliation"] });
    qc.invalidateQueries({ queryKey: ["pos-workspace"] });
  };

  function open(s: any) {
    setActive(s);
    setMode(s.suggestions?.length ? "match" : "record");
    setPaymentId(s.suggestions?.[0]?.id ?? "");
    setAccountId(s.account_id ?? accounts[0]?.id ?? "");
    setNote("");
  }

  const reconcile = useMutation({
    mutationFn: () => reconcileFn({ data: { id: active.id, mode, account_id: accountId || null, payment_id: paymentId || null, note } }),
    onSuccess: () => { toast.success(mode === "dispute" ? "Sale flagged" : "Sale reconciled"); setActive(null); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });
  const signOff = useMutation({
    mutationFn: () => reviewFn({ data: { id: review.id, account_id: accountId || null, note } }),
    onSuccess: () => { toast.success("Day signed off"); setReview(null); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const candidates = active
    ? [...(active.suggestions ?? []), ...payments.filter((p) => !(active.suggestions ?? []).some((s: any) => s.id === p.id)
        && String(p.currency || "USD").toUpperCase() === String(active.currency || "USD").toUpperCase())].slice(0, 60)
    : [];

  return (
    <div className="space-y-4">
      <DetailCard title="Sales waiting for Finance">
        <DataGrid
          rows={sales}
          loading={isLoading}
          empty={<EmptyState title="All sales reconciled" description="New counter sales appear here until Finance confirms the money." icon={Scale} />}
          columns={[
            { header: "Sale", cell: (r: any) => <span className="font-mono text-xs font-semibold">{r.sale_number}</span> },
            { header: "When", cell: (r: any) => <span className="text-xs">{shortDate(r.created_at)}</span> },
            { header: "Customer", cell: (r: any) => r.account_number || r.walkin_name || "Walk-in" },
            { header: "Paid via", cell: (r: any) => <StatusBadge tone="info">{r.payment_method}</StatusBadge> },
            { header: "Total", align: "right", cell: (r: any) => <span className="font-mono font-semibold">{money(r.total, r.currency)}</span> },
            { header: "Sold by", cell: (r: any) => <span className="text-xs text-muted-foreground">{r.sold_by_name || "—"}</span> },
            { header: "Status", cell: (r: any) => r.reconciliation_status === "disputed"
                ? <StatusBadge tone="danger">query</StatusBadge>
                : r.suggestions?.length ? <StatusBadge tone="success">payment found</StatusBadge> : <StatusBadge tone="warning">pending</StatusBadge> },
            { header: "", align: "right", cell: (r: any) => <Button size="sm" onClick={() => open(r)}>Reconcile</Button> },
          ]}
        />
      </DetailCard>

      <DetailCard title="Closed days awaiting Finance sign-off">
        <DataGrid
          rows={closeouts}
          loading={isLoading}
          empty={<EmptyState title="No days waiting" description="Closed trading days appear here for Finance sign-off." icon={ClipboardCheck} />}
          columns={[
            { header: "Date", cell: (r: any) => <span className="font-mono text-xs font-semibold">{r.business_date}</span> },
            { header: "Sales", align: "right", cell: (r: any) => r.sales_count },
            { header: "Net", align: "right", cell: (r: any) => <span className="font-mono">{money(r.net_sales)}</span> },
            { header: "Expected cash", align: "right", cell: (r: any) => <span className="font-mono">{money(r.expected_cash)}</span> },
            { header: "Counted", align: "right", cell: (r: any) => <span className="font-mono">{money(r.counted_cash)}</span> },
            { header: "Variance", align: "right", cell: (r: any) => <span className={`font-mono ${Math.abs(Number(r.variance)) > 0.005 ? "text-destructive font-semibold" : ""}`}>{money(r.variance)}</span> },
            { header: "Closed by", cell: (r: any) => <span className="text-xs text-muted-foreground">{r.closed_by_name || "—"}</span> },
            { header: "", align: "right", cell: (r: any) => <Button size="sm" variant="outline" onClick={() => { setReview(r); setAccountId(r.account_id ?? accounts[0]?.id ?? ""); setNote(""); }}>Sign off</Button> },
          ]}
        />
      </DetailCard>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Reconcile {active?.sale_number} · {active && money(active.total, active.currency)}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>What happened to the money?</Label>
              <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="match">It matches a payment already recorded</SelectItem>
                  <SelectItem value="record">Record it now as received into a till/bank</SelectItem>
                  <SelectItem value="dispute">Doesn't match — flag a query</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "match" && (
              <div>
                <Label>Payment</Label>
                <Select value={paymentId} onValueChange={setPaymentId}>
                  <SelectTrigger><SelectValue placeholder="Choose payment" /></SelectTrigger>
                  <SelectContent>
                    {candidates.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {money(p.amount, p.currency)} · {p.method || "—"} · {p.reference || p.receipt_number || "no ref"} · {shortDate(p.paid_at)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!candidates.length && <p className="mt-1 text-xs text-muted-foreground">No unmatched payments in this currency.</p>}
              </div>
            )}
            {mode === "record" && (
              <div>
                <Label>Money went into</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="Choose till or bank" /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {a.currency}</SelectItem>)}</SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">Posts the deposit and ledger entry; account clients also get a paid invoice and receipt.</p>
              </div>
            )}
            <div>
              <Label>Note {mode === "dispute" ? "(required)" : "(optional)"}</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)}>Cancel</Button>
            <Button disabled={reconcile.isPending} onClick={() => reconcile.mutate()}>
              {mode === "dispute" ? "Flag query" : "Confirm reconciliation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Sign off {review?.business_date}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Variance: <span className="font-mono font-semibold">{review && money(review.variance)}</span>. Every sale from this day must be reconciled first.</p>
            {review && Math.abs(Number(review.variance)) > 0.005 && (
              <div>
                <Label>Post variance to</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="Choose till" /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Note</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>Cancel</Button>
            <Button disabled={signOff.isPending} onClick={() => signOff.mutate()}>Sign off day</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
