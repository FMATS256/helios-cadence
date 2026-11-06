import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { createTicketForCustomer } from "@/lib/client-actions.functions";
import { vendorById, daysUntil, renewalState, type VendorId } from "@/lib/vendors";
import { StatusBadge, EmptyState } from "@/components/enterprise";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { RefreshCw, UserPlus, Wrench, KeyRound, CalendarClock, Check, X } from "lucide-react";

const RENEW_TONE = { expired: "danger", due: "warning", soon: "solar", ok: "success", unknown: "neutral" } as const;
const label = (s: string) => s.replace(/_/g, " ");
const vName = (v: string) => { try { return vendorById(v as VendorId).name; } catch { return v; } };

type Lic = { id: string; vendor: string; product: string; seats: number; license_key: string | null; expiry_date: string | null; status: string; tenant_id: string | null; customer_id: string };
type Action = { kind: "renewal" | "add_seats" | "technical"; lic: Lic };

/** Customer 360: the client's licences with commercial actions (Finance approval) and technical hand-off to NOC. */
export function ClientLicensesPanel({ customerId }: { customerId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const ticketFn = useServerFn(createTicketForCustomer);
  const [act, setAct] = useState<Action | null>(null);
  const [f, setF] = useState({ qty: "1", term: "12", notes: "", subject: "", priority: "normal" });

  const lic = useQuery({
    queryKey: ["client-licenses", customerId], enabled: !!user,
    queryFn: async () => ((await supabase.from("vendor_licenses").select("*").eq("customer_id", customerId).order("expiry_date", { ascending: true, nullsFirst: false })).data ?? []) as Lic[],
  });
  const orders = useQuery({
    queryKey: ["client-license-orders", customerId], enabled: !!user,
    queryFn: async () => (await supabase.from("vendor_license_orders").select("id, vendor, product, order_type, quantity, status, created_at").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(10)).data ?? [],
  });

  const open = (kind: Action["kind"], l: Lic) => {
    setF({ qty: "1", term: "12", notes: "", priority: "normal", subject: kind === "technical" ? `${vName(l.vendor)} ${l.product} — technical change` : "" });
    setAct({ kind, lic: l });
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!act || !user) return;
      const l = act.lic;
      if (act.kind === "technical") {
        if (!f.subject.trim()) throw new Error("Describe the request");
        await ticketFn({ data: {
          customer_id: customerId, subject: f.subject.trim(), priority: f.priority, category: "Licensing",
          description: `${vName(l.vendor)} · ${l.product} · ${l.seats} seat(s)${l.license_key ? ` · key ${l.license_key}` : ""}\n\n${f.notes}`,
        } });
        return "Sent to NOC engineers";
      }
      const qty = act.kind === "renewal" ? l.seats : Number(f.qty);
      if (!Number.isInteger(qty) || qty < 1) throw new Error("Seats must be a whole number");
      const { error } = await supabase.from("vendor_license_orders").insert({
        vendor: l.vendor, customer_id: customerId, tenant_id: l.tenant_id, license_id: l.id, product: l.product,
        quantity: qty, term_months: Number(f.term), order_type: act.kind, existing_serial: l.license_key,
        expiry_date: l.expiry_date, notes: f.notes || null, requested_by: user.id,
      });
      if (error) throw new Error(error.message);
      return "Request sent to Finance for approval";
    },
    onSuccess: (m) => { if (m) toast.success(m); setAct(null); qc.invalidateQueries({ queryKey: ["client-license-orders", customerId] }); qc.invalidateQueries({ queryKey: ["licence-queue"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = lic.data ?? [];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> Licences</CardTitle>
          <span className="text-xs text-muted-foreground">Renewals and seats go to Finance · technical changes go to NOC</span>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? <EmptyState title="No licences recorded" description="Licences recorded on the vendor licensing pages appear here." /> : rows.map((l) => {
            const d = daysUntil(l.expiry_date); const st = renewalState(l.expiry_date);
            return (
              <div key={l.id} className="rounded-lg border border-border p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{vName(l.vendor)} · {l.product}</div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                    <span>{l.seats} seat(s)</span>
                    {l.license_key && <span className="font-mono truncate">{l.license_key}</span>}
                    <span>{l.expiry_date ? `Expires ${l.expiry_date}${d !== null ? ` (${d < 0 ? `${-d} days ago` : `${d} days`})` : ""}` : "No expiry"}</span>
                  </div>
                  <div className="mt-1 flex gap-1.5"><StatusBadge tone={l.status === "active" ? "success" : "neutral"}>{label(l.status)}</StatusBadge><StatusBadge tone={RENEW_TONE[st]}>{st}</StatusBadge></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => open("renewal", l)}><RefreshCw className="h-3.5 w-3.5 mr-1" />Renew</Button>
                  <Button size="sm" variant="outline" onClick={() => open("add_seats", l)}><UserPlus className="h-3.5 w-3.5 mr-1" />Add seats</Button>
                  <Button size="sm" variant="outline" onClick={() => open("technical", l)}><Wrench className="h-3.5 w-3.5 mr-1" />Upgrade / technical</Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {(orders.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recent licence requests</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border">
            {orders.data!.map((o: any) => (
              <div key={o.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{vName(o.vendor)} · {o.product} · {label(o.order_type)} ×{o.quantity}</span>
                <StatusBadge tone={o.status === "fulfilled" ? "success" : o.status === "rejected" ? "danger" : "warning"}>{label(o.status)}</StatusBadge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!act} onOpenChange={(o) => !o && setAct(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>
            {act?.kind === "renewal" ? "Renew licence" : act?.kind === "add_seats" ? "Add seats" : "Send technical request to NOC"}
          </DialogTitle></DialogHeader>
          {act && <p className="text-sm text-muted-foreground">{vName(act.lic.vendor)} · {act.lic.product} · {act.lic.seats} seat(s)</p>}
          <div className="grid gap-3">
            {act?.kind === "add_seats" && <div className="space-y-1"><Label>Extra seats / devices</Label><Input type="number" min={1} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></div>}
            {act && act.kind !== "technical" && (
              <div className="space-y-1"><Label>Term</Label>
                <Select value={f.term} onValueChange={(v) => setF({ ...f, term: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["1", "12", "24", "36"].map((t) => <SelectItem key={t} value={t}>{t === "1" ? "Monthly" : `${t} months`}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {act?.kind === "technical" && <>
              <div className="space-y-1"><Label>Request</Label><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
              <div className="space-y-1"><Label>Priority</Label>
                <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["low", "normal", "high", "urgent"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>}
            <div className="space-y-1"><Label>{act?.kind === "technical" ? "Details for the engineer" : "Notes for Finance"}</Label><Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAct(null)}>Cancel</Button>
            <Button disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Sending…" : act?.kind === "technical" ? "Send to NOC" : "Send for approval"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Department queues: AM = renewal radar, Finance = approvals, NOC = approved orders + licensing tickets. */
export function LicenceQueue({ mode }: { mode: "am" | "finance" | "noc" }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [key, setKey] = useState<{ id: string; key: string; expiry: string } | null>(null);
  const q = useQuery({
    queryKey: ["licence-queue", mode], enabled: !!user,
    queryFn: async () => {
      if (mode === "am") {
        const lim = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
        return (await supabase.from("vendor_licenses").select("id, vendor, product, seats, expiry_date, customers(company_name, account_number)").lte("expiry_date", lim).neq("status", "cancelled").order("expiry_date").limit(50)).data ?? [];
      }
      const statuses = mode === "finance" ? ["awaiting_approval"] : ["approved", "awaiting_api"];
      return (await supabase.from("vendor_license_orders").select("id, vendor, product, order_type, quantity, term_months, notes, status, created_at, customers(company_name, account_number)").in("status", statuses).order("created_at").limit(50)).data ?? [];
    },
  });
  const tickets = useQuery({
    queryKey: ["licence-queue", "tickets"], enabled: !!user && mode === "noc",
    queryFn: async () => (await supabase.from("tickets").select("id, ticket_number, subject, priority, status, customers(company_name)").eq("category", "Licensing").not("status", "in", "(resolved,closed)").order("created_at").limit(30)).data ?? [],
  });
  const setStatus = useMutation({
    mutationFn: async (p: { id: string; status: string; key?: string; expiry?: string }) => {
      const { error } = await supabase.from("vendor_license_orders").update({
        status: p.status, ...(p.key !== undefined ? { fulfilled_license_key: p.key || null, fulfilled_expiry: p.expiry || null } : {}),
      }).eq("id", p.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Order updated"); setKey(null); qc.invalidateQueries({ queryKey: ["licence-queue"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const title = mode === "am" ? "Licence renewals due (60 days)" : mode === "finance" ? "Licence orders awaiting approval" : "Licence fulfilment queue";
  const rows = (q.data ?? []) as any[];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4" />{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && !(mode === "noc" && tickets.data?.length) && <p className="text-sm text-muted-foreground">Nothing waiting.</p>}
        {rows.map((r) => {
          const c = r.customers;
          const client = c ? <Link to="/customers/$accountNumber" params={{ accountNumber: c.account_number }} search={{ tab: "licences" } as any} className="font-medium hover:underline">{c.company_name}</Link> : null;
          if (mode === "am") {
            const d = daysUntil(r.expiry_date);
            return (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                <div className="min-w-0">{client}<div className="text-xs text-muted-foreground">{vName(r.vendor)} · {r.product} · {r.seats} seat(s)</div></div>
                <StatusBadge tone={RENEW_TONE[renewalState(r.expiry_date)]}>{d !== null && d < 0 ? `expired ${-d}d` : `${d}d left`}</StatusBadge>
              </div>
            );
          }
          return (
            <div key={r.id} className="flex flex-col gap-2 rounded-md border border-border p-2 text-sm md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">{client}<div className="text-xs text-muted-foreground">{vName(r.vendor)} · {r.product} · {label(r.order_type)} ×{r.quantity} · {r.term_months} mo{r.notes ? ` · ${r.notes}` : ""}</div></div>
              <div className="flex gap-2">
                {mode === "finance" ? <>
                  <Button size="sm" onClick={() => setStatus.mutate({ id: r.id, status: "approved" })}><Check className="h-3.5 w-3.5 mr-1" />Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: r.id, status: "rejected" })}><X className="h-3.5 w-3.5 mr-1" />Reject</Button>
                </> : <Button size="sm" onClick={() => setKey({ id: r.id, key: "", expiry: "" })}>Mark fulfilled</Button>}
              </div>
            </div>
          );
        })}
        {mode === "noc" && (tickets.data?.length ?? 0) > 0 && <>
          <div className="pt-2 text-xs font-semibold uppercase text-muted-foreground">Technical licence requests from account managers</div>
          {(tickets.data as any[]).map((t) => (
            <Link key={t.id} to="/tickets/$id" params={{ id: t.id }} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm hover:bg-muted/50">
              <span className="min-w-0 truncate"><span className="font-mono text-xs mr-2">{t.ticket_number}</span>{t.customers?.company_name} — {t.subject}</span>
              <StatusBadge tone={t.priority === "urgent" || t.priority === "high" ? "danger" : "info"}>{t.priority}</StatusBadge>
            </Link>
          ))}
        </>}
      </CardContent>
      <Dialog open={!!key} onOpenChange={(o) => !o && setKey(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark licence fulfilled</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1"><Label>Licence key</Label><Input value={key?.key ?? ""} onChange={(e) => setKey(key && { ...key, key: e.target.value })} /></div>
            <div className="space-y-1"><Label>New expiry date</Label><Input type="date" value={key?.expiry ?? ""} onChange={(e) => setKey(key && { ...key, expiry: e.target.value })} /></div>
          </div>
          <DialogFooter><Button disabled={setStatus.isPending} onClick={() => key && setStatus.mutate({ id: key.id, status: "fulfilled", key: key.key, expiry: key.expiry })}>Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
