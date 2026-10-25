import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Receipt = { id: string; receipt_number: string | null; amount: number; currency: string; method: string; paid_at: string; status: string };
const money = (p: Receipt) => `${p.currency} ${Number(p.amount).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (v: string) => new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function ClientReceipts({ payments, profile, submissions }: { payments: Receipt[]; profile: any; submissions: any[] }) {
  const [selected, setSelected] = useState<Receipt | null>(null);
  const rows = payments.filter((p) => p.status === "received");
  const submission = selected ? submissions.find((s) => s.receipt_number && s.receipt_number === selected.receipt_number) : null;
  return <section className="portal-receipts space-y-4">
    <header className="bills-mobile-heading hidden"><h1>My Receipts</h1><p>Showing {rows.length} {rows.length === 1 ? "receipt" : "receipts"}</p></header>
    <h2 className="bills-desktop-heading text-lg font-bold">Recorded payments & receipts</h2>
    {!rows.length ? <p className="py-10 text-muted-foreground text-center">No receipts recorded yet.</p> : <div className="bills-list space-y-4">{rows.map((p) => <article key={p.id} className="bill-card border border-border bg-card rounded-sm overflow-hidden">
      <div className="bill-content grid grid-cols-[minmax(0,1fr)_auto] gap-4 p-5">
        <div className="bill-identity flex items-center gap-3 min-w-0"><span className="bill-icon flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-solar text-solar-foreground"><FileText className="w-5 h-5" /></span><div className="min-w-0"><Button variant="link" className="h-auto p-0 text-lg underline whitespace-normal break-all" onClick={() => setSelected(p)}>{p.receipt_number || "Receipt"}</Button><p className="text-xs text-muted-foreground mt-1">Post date: {date(p.paid_at)}</p></div></div>
        <div className="bill-amount font-semibold"><p>{money(p)}</p></div>
      </div><div className="bill-payment bg-muted flex justify-end px-5 py-3"><Button className="bg-solar text-solar-foreground hover:bg-solar/90" onClick={() => setSelected(p)}>View</Button></div>
    </article>)}</div>}
    <Dialog open={!!selected} onOpenChange={(v) => { if (!v) setSelected(null); }}><DialogContent className="receipt-detail max-h-[92dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle className="break-all">Receipt {selected?.receipt_number || "details"}</DialogTitle></DialogHeader>{selected && <div className="space-y-5"><section className="rounded-sm bg-muted p-6 text-center"><h2 className="text-2xl font-normal text-solar mb-7">Details</h2><dl className="text-sm leading-7 break-words"><div><dt className="inline font-bold">Amount: </dt><dd className="inline">{money(selected)}</dd></div><div><dt className="inline font-bold">Payment method: </dt><dd className="inline capitalize">{selected.method.replaceAll("_", " ")}</dd></div><div><dt className="inline font-bold">Reference Number: </dt><dd className="inline">{submission?.reference || selected.receipt_number || "—"}</dd></div><div><dt className="inline font-bold">Date Paid: </dt><dd className="inline">{date(selected.paid_at)}</dd></div>{submission?.review_notes && <div><dt className="inline font-bold">Notes: </dt><dd className="inline">{submission.review_notes}</dd></div>}</dl></section><section className="rounded-sm bg-muted p-6 text-center"><h2 className="text-2xl font-normal text-solar mb-6">Issued to</h2><p className="font-bold">{profile?.company_name}</p><p className="text-sm mt-2">{profile?.account_number}</p>{profile?.billing_address && <p className="text-sm whitespace-pre-line mt-2">{profile.billing_address}</p>}</section></div>}</DialogContent></Dialog>
  </section>;
}