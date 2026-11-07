import { serviceStatusTone, invoiceOverdue } from "@/lib/customer360/account-status";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusPill } from "@/components/page";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ServiceDetailKind = "Subscription" | "Service" | "Package" | "Asset" | "Credential";
export type ServiceDetail = { kind: ServiceDetailKind; title: string; lineLabel: string; record: any };

const HIDDEN = /(^id$|_id$|password|secret|token|encrypted|cipher|hash|private_key|api_key)/i;

function label(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(k: string, v: any): string {
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /(_at|_date|renewal|expires|start|end)$/i.test(k) && !isNaN(Date.parse(v))) {
    return new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  if (typeof v === "object") return "";
  return String(v);
}

function flatten(rec: any): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(rec || {})) {
    if (HIDDEN.test(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as any)) {
        if (HIDDEN.test(k2)) continue;
        const s = fmt(k2, v2);
        if (s) out.push([`${label(k)} · ${label(k2)}`, s]);
      }
      continue;
    }
    const s = fmt(k, v);
    if (s) out.push([label(k), s]);
  }
  return out;
}

function phoneOf(...vals: any[]): string {
  for (const v of vals) {
    if (!v) continue;
    if (typeof v === "object") {
      for (const k of ["phone", "msisdn", "mobile", "phone_number", "payer_phone", "customer_phone", "mobile_number"]) {
        if (v[k]) return String(v[k]);
      }
      continue;
    }
    const m = String(v).match(/(\+?263|0)7\d[\s-]?\d{3}[\s-]?\d{4}/);
    if (m) return m[0];
  }
  return "";
}

type PayRow = { key: string; date: string; amount: number; currency: string; method: string; reference: string; phone: string; status: string; invoice: string; receipt: string };

function SubscriptionPayments({ subscriptionId }: { subscriptionId: string }) {
  const q = useQuery({
    queryKey: ["c360-sub-payments", subscriptionId],
    queryFn: async () => {
      const { data: invs } = await supabase.from("invoices").select("id, invoice_number, status, total, amount_paid, currency, issue_date, due_date, subscription_period_start").eq("subscription_id", subscriptionId).order("issue_date", { ascending: false });
      const invoices = invs || [];
      const ids = invoices.map((i: any) => i.id);
      const num = new Map(invoices.map((i: any) => [i.id, i.invoice_number]));
      let rows: PayRow[] = [];
      if (ids.length) {
        const [{ data: pays }, { data: subs }] = await Promise.all([
          supabase.from("payments").select("id, invoice_id, amount, currency, method, reference, status, paid_at, notes, receipt_number").in("invoice_id", ids),
          supabase.from("payment_submissions").select("id, invoice_id, amount, currency, method, reference, status, payment_date, submitted_at, notes, receipt_number, external_payload, payment_id").in("invoice_id", ids),
        ]);
        const linked = new Set((subs || []).map((s: any) => s.payment_id).filter(Boolean));
        const subByPay = new Map((subs || []).filter((s: any) => s.payment_id).map((s: any) => [s.payment_id, s]));
        rows = [
          ...(pays || []).map((p: any) => { const s: any = subByPay.get(p.id); return {
            key: `p-${p.id}`, date: p.paid_at, amount: Number(p.amount), currency: p.currency, method: p.method || s?.method || "", reference: p.reference || s?.reference || "",
            phone: phoneOf(s?.external_payload, p.reference, p.notes, s?.reference, s?.notes), status: p.status, invoice: num.get(p.invoice_id) || "", receipt: p.receipt_number || "" }; }),
          ...(subs || []).filter((s: any) => !s.payment_id || !linked.has(s.payment_id) || !(pays || []).some((p: any) => p.id === s.payment_id)).map((s: any) => ({
            key: `s-${s.id}`, date: s.payment_date || s.submitted_at, amount: Number(s.amount), currency: s.currency, method: s.method || "", reference: s.reference || "",
            phone: phoneOf(s.external_payload, s.reference, s.notes), status: `submission ${s.status}`, invoice: num.get(s.invoice_id) || "", receipt: s.receipt_number || "" })),
        ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      }
      return { invoices, rows };
    },
  });
  const d = (v: string) => v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading payment history…</p>;
  const inv = q.data?.invoices || [];
  const rows = q.data?.rows || [];
  const billed = inv.reduce((s: number, i: any) => s + Number(i.total || 0), 0);
  const paid = inv.reduce((s: number, i: any) => s + Number(i.amount_paid || 0), 0);
  const cur = inv[0]?.currency || "USD";
  const last = rows.find((r) => !r.status.startsWith("submission"));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Billed", billed], ["Paid", paid], ["Outstanding", billed - paid]].map(([l, v]) => (
          <div key={l as string} className="border rounded p-2"><p className="text-[11px] uppercase text-muted-foreground">{l}</p><p className="font-semibold text-sm">{cur} {Number(v).toFixed(2)}</p></div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{inv.length} invoice(s) · last payment {last ? `${d(last.date)}${last.phone ? ` from ${last.phone}` : ""}` : "none recorded"}</p>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No payments recorded for this subscription.</p> : (
        <div className="divide-y border rounded">
          {rows.map((r) => (
            <div key={r.key} className="px-3 py-2 text-sm space-y-0.5">
              <div className="flex justify-between gap-2"><span className="font-medium">{r.currency} {r.amount.toFixed(2)}</span><span className="text-xs text-muted-foreground">{d(r.date)}</span></div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                <span>{r.method || "—"}</span>
                <span>Phone: {r.phone || "not recorded"}</span>
                {r.reference && <span>Ref: {r.reference}</span>}
                {r.invoice && <span>{r.invoice}</span>}
                {r.receipt && <span>Receipt {r.receipt}</span>}
                <span className="capitalize">{r.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {inv.length > 0 && (
        <div className="divide-y border rounded">
          {inv.map((i: any) => (
            <div key={i.id} className="px-3 py-2 text-xs flex justify-between gap-2">
              <span className="font-medium">{i.invoice_number}{i.subscription_period_start ? ` · period from ${d(i.subscription_period_start)}` : ""}</span>
              <span className={`capitalize ${invoiceOverdue(i) ? "text-destructive font-semibold" : "text-muted-foreground"}`}>{invoiceOverdue(i) ? "overdue" : i.status} · {i.currency} {Number(i.amount_paid || 0).toFixed(2)}/{Number(i.total || 0).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ServiceDetailDialog({ detail, onClose }: { detail: ServiceDetail | null; onClose: () => void }) {
  const rec = detail?.record || {};
  const status = rec.status || "Not recorded";
  const rows = flatten(rec).filter(([k]) => k !== "Status");
  return (
    <Dialog open={!!detail} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{detail?.lineLabel} · {detail?.kind}</p>
          <DialogTitle className="font-display flex items-center gap-2 flex-wrap">
            {detail?.title}
            <StatusPill tone={serviceStatusTone(status)}>{status}</StatusPill>
          </DialogTitle>
        </DialogHeader>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No further details recorded.</p>
        ) : (
          <dl className="divide-y border rounded">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[minmax(0,40%)_1fr] gap-3 px-3 py-2 text-sm">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium break-words">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {detail?.kind === "Subscription" && rec.id && (
          <div className="space-y-2 pt-2">
            <h4 className="font-display text-sm font-semibold">Payments & billing history</h4>
            <SubscriptionPayments subscriptionId={rec.id} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
