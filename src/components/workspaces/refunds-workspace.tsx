import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { listRefunds, decideRefundRequest } from "@/lib/refunds.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Receipt, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, KpiRow, DataGrid, StatusBadge, toneForStatus,
  EmptyState, money as fmtMoney, type ColumnDef,
} from "@/components/enterprise";

const TABS = [
  { key: "requested", label: "Requests" },
  { key: "processed", label: "Processed" },
  { key: "rejected", label: "Declined" },
  { key: "all", label: "All" },
] as const;

function shortDate(v?: string | null) {
  return v ? new Date(v).toLocaleDateString() : "—";
}

export function RefundsWorkspace() {
  const load = useServerFn(listRefunds);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["refunds-queue"], queryFn: () => load({ data: {} }) });
  const [tab, setTab] = useState<string>("requested");
  const [search, setSearch] = useState("");
  const [review, setReview] = useState<any>(null);

  const canProcess = Boolean(data?.canProcess);
  const stats = data?.stats;

  const rows = useMemo(() => {
    const list = (data?.refunds ?? []) as any[];
    return list.filter((r) => {
      if (tab === "processed" && !["processed", "credited"].includes(r.status)) return false;
      if (tab === "requested" && r.status !== "requested") return false;
      if (tab === "rejected" && r.status !== "rejected") return false;
      if (!search) return true;
      const v = search.toLowerCase();
      return [r.company_name, r.customer_account, r.reference, r.request_reason, r.requested_by_name]
        .some((f) => String(f ?? "").toLowerCase().includes(v));
    });
  }, [data, tab, search]);

  const columns: ColumnDef<any>[] = [
    {
      header: "Customer",
      cell: (r) => (
        <div className="min-w-0">
          {r.customer_account ? (
            <Link to="/customers/$accountNumber" params={{ accountNumber: r.customer_account }} className="font-medium hover:underline">
              {r.company_name ?? r.customer_account}
            </Link>
          ) : <span className="font-medium">{r.company_name ?? "—"}</span>}
          <div className="font-mono text-xs text-muted-foreground">{r.customer_account}</div>
        </div>
      ),
    },
    { header: "Amount", align: "right", cell: (r) => <span className="font-semibold">{fmtMoney(r.amount, r.currency)}</span> },
    { header: "From account", cell: (r) => <span className="text-sm">{r.refund_account_name ?? "—"}</span> },
    { header: "Reason", cell: (r) => <span className="text-sm text-muted-foreground line-clamp-2">{r.request_reason ?? r.reason ?? "—"}</span> },
    { header: "Requested by", cell: (r) => <span className="text-sm">{r.requested_by_name ?? "—"}</span> },
    { header: "Raised", cell: (r) => <span className="text-xs text-muted-foreground">{shortDate(r.created_at)}</span> },
    { header: "Status", cell: (r) => <StatusBadge tone={toneForStatus(r.status)}>{String(r.status).replace(/_/g, " ")}</StatusBadge> },
    {
      header: "",
      align: "right",
      cell: (r) => (canProcess && r.status === "requested"
        ? <Button size="sm" onClick={() => setReview(r)}>Review</Button>
        : r.reviewed_by_name ? <span className="text-xs text-muted-foreground">{r.reviewed_by_name}</span> : null),
    },
  ];

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Separation of duties"
        title="Refunds"
        description="Only billing initiates refunds. Account managers request one with a reason and the account it should be paid from; billing approves or declines."
      />

      <KpiRow
        cols={4}
        items={[
          { icon: Clock, label: "Awaiting review", value: String(stats?.requested ?? 0), tone: "warning" },
          { icon: Receipt, label: "Requested value", value: fmtMoney(stats?.requestedValue ?? 0), tone: "info" },
          { icon: CheckCircle2, label: "Processed", value: String(stats?.processed ?? 0), tone: "success" },
          { icon: XCircle, label: "Declined", value: String(stats?.rejected ?? 0), tone: "danger" },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                {TABS.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
              </TabsList>
            </Tabs>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search customer, reason, reference…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <DataGrid
            rows={rows}
            columns={columns}
            loading={isLoading}
            empty={<EmptyState title="No refunds" description="Refund requests raised by account managers land here for billing to review." icon={Receipt} />}
          />
        </CardContent>
      </Card>

      {review && (
        <ReviewDialog refund={review} onClose={() => setReview(null)} onDone={() => { setReview(null); refetch(); }} />
      )}
    </PageShell>
  );
}

function ReviewDialog({ refund, onClose, onDone }: { refund: any; onClose: () => void; onDone: () => void }) {
  const decide = useServerFn(decideRefundRequest);
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState(refund.reference ?? "");
  const [asCredit, setAsCredit] = useState(false);

  const run = useMutation({
    mutationFn: (action: "approve" | "reject") => decide({
      data: { refund_id: refund.id, action, as_credit: asCredit, reference, notes },
    }),
    onSuccess: (_d, action) => { toast.success(action === "approve" ? "Refund processed" : "Request declined"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Review refund request</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{refund.company_name ?? refund.customer_account}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">{fmtMoney(refund.amount, refund.currency)}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Pay from</span><span>{refund.refund_account_name ?? "—"}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Requested by</span><span>{refund.requested_by_name ?? "—"}</span></div>
            <p className="mt-2 text-muted-foreground">{refund.request_reason ?? refund.reason}</p>
          </div>
          <div className="space-y-1"><Label>Payment reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank / transfer reference" /></div>
          <div className="flex items-center gap-2">
            <input id="refund-credit" type="checkbox" className="h-4 w-4" checked={asCredit} onChange={(e) => setAsCredit(e.target.checked)} />
            <Label htmlFor="refund-credit">Issue as account credit instead of paying out</Label>
          </div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Required when declining" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => run.mutate("reject")} disabled={run.isPending}>Decline</Button>
          <Button onClick={() => run.mutate("approve")} disabled={run.isPending}>{run.isPending ? "Saving…" : "Approve refund"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
