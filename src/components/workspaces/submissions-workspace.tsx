import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listPaymentSubmissions, getSubmissionReview, reviewPaymentSubmission,
  respondToSubmission, cancelSubmission,
} from "@/lib/payment-submissions.functions";
import { supabase } from "@/integrations/supabase/client";
import { SubmitPaymentDialog } from "@/components/submit-payment-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiRow, StatusBadge, toneForStatus, money as fmtMoney } from "@/components/enterprise";
import {
  AlertTriangle, CheckCircle2, Clock, FileText, HelpCircle, Plus, Search, XCircle,
} from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { key: "pending", label: "Pending verification" },
  { key: "clarification", label: "Needs clarification" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

function when(v?: string | null) { return v ? new Date(v).toLocaleString() : "—"; }

/**
 * Payment submissions queue. Account managers see their own submissions;
 * billing sees everything and can approve, reject or ask for clarification.
 */
export function SubmissionsWorkspace({ customerId }: { customerId?: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listPaymentSubmissions);
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [openSubmit, setOpenSubmit] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payment-submissions", customerId ?? "all"],
    queryFn: () => list({ data: { customer_id: customerId } }),
  });

  const submissions = (data?.submissions ?? []) as any[];
  const isBilling = !!data?.isBilling;
  const stats = data?.stats;

  const filtered = useMemo(() => submissions.filter((s) => {
    if (tab !== "all" && s.status !== tab) return false;
    if (!search) return true;
    const v = search.toLowerCase();
    return [s.customers?.company_name, s.customers?.account_number, s.reference, s.invoices?.invoice_number, s.submitted_by_name, s.receipt_number]
      .some((f) => String(f ?? "").toLowerCase().includes(v));
  }), [submissions, tab, search]);

  return (
    <div className="space-y-4">
      <KpiRow
        items={[
          { icon: Clock, label: "Pending verification", value: String(stats?.pending ?? 0), hint: fmtMoney(stats?.pendingValue ?? 0), tone: "warning" },
          { icon: HelpCircle, label: "Needs clarification", value: String(stats?.clarification ?? 0), tone: "info" },
          { icon: CheckCircle2, label: "Approved", value: String(stats?.approved ?? 0), hint: fmtMoney(stats?.approvedValue ?? 0), tone: "solar" },
          { icon: XCircle, label: "Rejected", value: String(stats?.rejected ?? 0), tone: "danger" },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex-wrap">
                {TABS.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-9 pl-10" placeholder="Customer, reference, invoice…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Button size="sm" onClick={() => setOpenSubmit(true)}>
                <Plus className="mr-1.5 h-4 w-4" />Submit payment
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading submissions…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Nothing here yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Submitted by</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setReviewId(s.id)}>
                    <TableCell>
                      <div className="font-medium">{s.customers?.company_name ?? "—"}</div>
                      <div className="font-mono text-xs text-muted-foreground">{s.account_number}</div>
                    </TableCell>
                    <TableCell className="font-semibold">{fmtMoney(s.amount, s.currency)}</TableCell>
                    <TableCell className="text-xs">{s.invoices?.invoice_number ?? "Unallocated"}</TableCell>
                    <TableCell className="text-xs capitalize">{String(s.method ?? "").replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-xs">{s.submitted_by_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{when(s.submitted_at ?? s.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge tone={toneForStatus(s.status === "approved" ? "active" : s.status === "rejected" ? "failed" : s.status === "clarification" ? "pending" : s.status)}>{String(s.status).replace(/_/g, " ")}</StatusBadge>
                        {s.duplicate_flag && <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SubmitPaymentDialog open={openSubmit} onOpenChange={setOpenSubmit} customerId={customerId} />
      <ReviewSheet
        id={reviewId}
        isBilling={isBilling}
        onClose={() => setReviewId(null)}
        onDone={() => { setReviewId(null); qc.invalidateQueries(); }}
      />
    </div>
  );
}

function ReviewSheet({ id, isBilling, onClose, onDone }: {
  id: string | null; isBilling: boolean; onClose: () => void; onDone: () => void;
}) {
  const load = useServerFn(getSubmissionReview);
  const review = useServerFn(reviewPaymentSubmission);
  const respond = useServerFn(respondToSubmission);
  const cancel = useServerFn(cancelSubmission);

  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [invoiceId, setInvoiceId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["submission-review", id],
    queryFn: () => load({ data: { submission_id: id! } }),
    enabled: !!id,
  });

  const sub = data?.submission as any;
  const proof = data?.proof as any;
  const openInvoices = (data?.openInvoices ?? []) as any[];
  const events = (data?.events ?? []) as any[];
  const cashAccounts = ((data as any)?.cashAccounts ?? []) as any[];
  const targetInvoice = invoiceId || sub?.invoice_id || "";
  const targetAccount = accountId || sub?.cash_account_id || cashAccounts.find((a) => a.is_default)?.id || "";
  const accountName = cashAccounts.find((a) => a.id === targetAccount)?.name ?? "—";

  async function openProof() {
    if (!proof?.file_path) return;
    const { data: signed, error } = await supabase.storage.from("customer-documents").createSignedUrl(proof.file_path, 300);
    if (error || !signed) return toast.error("Could not open the proof file");
    window.open(signed.signedUrl, "_blank");
  }

  async function act(fn: () => Promise<any>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); setNotes(""); setReason(""); onDone(); }
    catch (e: any) { toast.error(e?.message ?? "Action failed"); }
    finally { setBusy(false); }
  }

  const pending = sub && ["pending", "clarification"].includes(sub.status);

  return (
    <Sheet open={!!id} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>Payment submission</SheetTitle></SheetHeader>
        {!sub ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{fmtMoney(sub.amount, sub.currency)}</p>
                  <p className="text-sm text-muted-foreground">
                    {data?.customer?.company_name}{" · "}
                    <Link to="/customers/$accountNumber" params={{ accountNumber: sub.account_number }} className="underline">
                      {sub.account_number}
                    </Link>
                  </p>
                </div>
                <StatusBadge tone={toneForStatus(sub.status === "approved" ? "active" : sub.status === "rejected" ? "failed" : "pending")}>{String(sub.status).replace(/_/g, " ")}</StatusBadge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-muted-foreground">Method</dt><dd className="capitalize">{String(sub.method ?? "").replace(/_/g, " ")}</dd></div>
                <div><dt className="text-muted-foreground">Payment date</dt><dd>{sub.payment_date ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Reference</dt><dd className="font-mono">{sub.reference ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Submitted</dt><dd>{when(sub.submitted_at ?? sub.created_at)}</dd></div>
                {sub.receipt_number && <div><dt className="text-muted-foreground">Receipt</dt><dd className="font-mono">{sub.receipt_number}</dd></div>}
                <div><dt className="text-muted-foreground">Banked into</dt><dd>{accountName}</dd></div>
              </dl>
              {sub.notes && <p className="mt-3 rounded bg-muted/50 p-2 text-xs">{sub.notes}</p>}
              {sub.duplicate_flag && (
                <p className="mt-3 flex items-start gap-2 rounded border border-warning/40 bg-warning/5 p-2 text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  Flagged as a possible duplicate of an earlier payment and acknowledged by the submitter.
                </p>
              )}
              {proof ? (
                <Button size="sm" variant="outline" className="mt-3" onClick={openProof}>
                  <FileText className="mr-1.5 h-4 w-4" />View proof · {proof.file_name}
                </Button>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">No proof of payment attached.</p>
              )}
            </div>

            {events.length > 0 && (
              <div className="rounded-lg border p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</p>
                <ul className="space-y-2 text-xs">
                  {events.map((e) => (
                    <li key={e.id} className="flex justify-between gap-3">
                      <span><span className="font-medium capitalize">{String(e.action).replace(/_/g, " ")}</span>{e.notes ? ` — ${e.notes}` : ""}</span>
                      <span className="shrink-0 text-muted-foreground">{when(e.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {pending && isBilling && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-semibold">Billing review</p>
                <div>
                  <Label>Allocate to invoice</Label>
                  <Select value={targetInvoice || "none"} onValueChange={(v) => setInvoiceId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Oldest first (automatic)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Oldest outstanding first</SelectItem>
                      {openInvoices.map((i) => (
                        <SelectItem key={i.id} value={i.id}>{i.invoice_number} · balance {fmtMoney(i.balance)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Deposit into account</Label>
                  <Select value={targetAccount} onValueChange={setAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {cashAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} · {String(a.kind).replace(/_/g, " ")}{a.is_default ? " (default)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">Approving posts the deposit here and moves the account balance.</p>
                </div>
                <div>
                  <Label>Review notes</Label>
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Verification notes, or what you need clarified" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy} onClick={() => act(() => review({ data: { submission_id: sub.id, decision: "approve", notes: notes.trim() || undefined, invoice_id: targetInvoice || null } }), "Payment approved and recorded")}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />Approve & record
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => review({ data: { submission_id: sub.id, decision: "clarify", notes: notes.trim() || undefined } }), "Clarification requested")}>
                    <HelpCircle className="mr-1.5 h-4 w-4" />Request clarification
                  </Button>
                </div>
                <div className="border-t pt-3">
                  <Label>Rejection reason</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the payment cannot be accepted" />
                  <Button size="sm" variant="destructive" className="mt-2" disabled={busy || !reason.trim()}
                    onClick={() => act(() => review({ data: { submission_id: sub.id, decision: "reject", reason: reason.trim() } }), "Submission rejected")}>
                    <XCircle className="mr-1.5 h-4 w-4" />Reject
                  </Button>
                </div>
              </div>
            )}

            {pending && !isBilling && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-semibold">Respond to billing</p>
                {sub.review_notes && <p className="rounded bg-muted/50 p-2 text-xs">Billing asked: {sub.review_notes}</p>}
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add the information billing asked for…" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy || !notes.trim()} onClick={() => act(() => respond({ data: { submission_id: sub.id, notes: notes.trim() } }), "Response sent to billing")}>
                    Send response
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => cancel({ data: { submission_id: sub.id, reason: notes.trim() || undefined } }), "Submission cancelled")}>
                    Cancel submission
                  </Button>
                </div>
              </div>
            )}

            {sub.status === "rejected" && sub.rejection_reason && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                Rejected: {sub.rejection_reason}
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
