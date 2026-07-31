/**
 * Customer 360 workspaces — the dialogs behind the action bar.
 * Presentation only reuses the existing enterprise primitives; all data and
 * mutations run through the authenticated server functions in
 * `src/lib/customer360.functions.ts`.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  KpiRow, StatusBadge, toneForStatus, DataGrid, EmptyState, InfoRow, money, shortDate,
  type ColumnDef,
} from "@/components/enterprise";
import {
  DollarSign, TrendingUp, Receipt, AlertTriangle, Wallet, Activity, FileText,
  Mail, Boxes, ShieldCheck, Clock, Download, Printer, Trash2, Upload, Send,
} from "lucide-react";
import {
  getCustomerBilling, changeCustomerPackage, getPackageHistory, setServiceState,
  recordRefund, addCustomerCredit, addBillingNote, getCustomerHistory,
  getCustomerConversations, sendCustomerMessage, getCustomerDocuments,
  saveCustomerDocument, setDocumentStatus, deleteCustomerDocument, getDocumentLink,
  getCustomerEquipment, assignEquipment, releaseEquipment, updateEquipment, generateContract,
  getCustomerStatement, getCustomerProfileExport,
} from "@/lib/customer360.functions";

export type WorkspaceKind =
  | "package" | "billing" | "timeline" | "comms" | "kyc" | "equipment"
  | "suspend" | "resume" | "cancel" | "contract" | "refund" | "statement" | "export";

export type WorkspaceCtx = {
  customerId: string;
  accountNumber: string;
  companyName: string;
  primaryEmail?: string | null;
  subscriptions?: any[];
};

/* ------------------------------------------------------------------ utils */

function useRefreshAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries();
  };
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function printHtml(title: string, body: string) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) { toast.error("Allow pop-ups to print this document"); return; }
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>
    body{font-family:Inter,Arial,sans-serif;font-size:12px;color:#111;padding:32px}
    h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:20px 0 6px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
    th{background:#f4f4f5} .r{text-align:right} .muted{color:#666}
  </style></head><body>${body}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

const tableHtml = (headers: string[], rows: (string | number)[][]) =>
  `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${
    rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("")
  }</tbody></table>`;

const csv = (headers: string[], rows: any[][]) =>
  [headers, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");

function Shell({
  open, onClose, title, description, wide, children, footer,
}: {
  open: boolean; onClose: () => void; title: string; description?: string;
  wide?: boolean; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={wide ? "max-w-5xl max-h-[88vh] overflow-y-auto" : "max-w-2xl max-h-[88vh] overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------- dispatcher */

export function Customer360Workspace({ kind, ctx, onClose }: {
  kind: WorkspaceKind; ctx: WorkspaceCtx; onClose: () => void;
}) {
  switch (kind) {
    case "package": return <ChangePackageWorkspace ctx={ctx} onClose={onClose} />;
    case "billing": return <BillingWorkspace ctx={ctx} onClose={onClose} />;
    case "timeline": return <TimelineWorkspace ctx={ctx} onClose={onClose} />;
    case "comms": return <CommunicationCenter ctx={ctx} onClose={onClose} />;
    case "kyc": return <KycWorkspace ctx={ctx} onClose={onClose} />;
    case "equipment": return <EquipmentWorkspace ctx={ctx} onClose={onClose} />;
    case "contract": return <ContractWorkspace ctx={ctx} onClose={onClose} />;
    case "refund": return <RefundWorkspace ctx={ctx} onClose={onClose} />;
    case "statement": return <StatementWorkspace ctx={ctx} onClose={onClose} />;
    case "export": return <ProfileExportWorkspace ctx={ctx} onClose={onClose} />;
    default: return <ServiceStateWorkspace kind={kind} ctx={ctx} onClose={onClose} />;
  }
}

/* ------------------------------------------------------------- 1. package */

function ChangePackageWorkspace({ ctx, onClose }: { ctx: WorkspaceCtx; onClose: () => void }) {
  const refresh = useRefreshAll();
  const change = useServerFn(changeCustomerPackage);
  const historyFn = useServerFn(getPackageHistory);
  const subs = (ctx.subscriptions ?? []).filter((s) => s.status !== "cancelled");

  const { data: history = [] } = useQuery({
    queryKey: ["c360-package-history", ctx.customerId],
    queryFn: () => historyFn({ data: { customer_id: ctx.customerId } }),
  });

  const [subId, setSubId] = useState<string>(subs[0]?.id ?? "new");
  const current = subs.find((s) => s.id === subId);
  const [form, setForm] = useState({
    plan_name: subs[0]?.plan_name ?? "",
    description: subs[0]?.description ?? "",
    amount: String(subs[0]?.amount ?? ""),
    billing_cycle: subs[0]?.billing_cycle ?? "monthly",
    currency: subs[0]?.currency ?? "USD",
    reason: "",
    effective_on: new Date().toISOString().slice(0, 10),
    generate_invoice: false,
  });

  function pick(id: string) {
    setSubId(id);
    const s = subs.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      plan_name: s?.plan_name ?? "",
      description: s?.description ?? "",
      amount: String(s?.amount ?? ""),
      billing_cycle: s?.billing_cycle ?? "monthly",
      currency: s?.currency ?? "USD",
    }));
  }

  const save = useMutation({
    mutationFn: () => change({
      data: {
        customer_id: ctx.customerId,
        subscription_id: subId === "new" ? null : subId,
        plan_name: form.plan_name,
        description: form.description,
        amount: Number(form.amount),
        billing_cycle: form.billing_cycle,
        currency: form.currency,
        reason: form.reason,
        effective_on: form.effective_on,
        generate_invoice: form.generate_invoice,
      },
    }),
    onSuccess: () => { toast.success("Package updated"); refresh(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell
      open onClose={onClose} wide
      title={`Change package · ${ctx.companyName}`}
      description="Updates the existing active package on the same service line instead of creating a duplicate."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.plan_name}>
            {save.isPending ? "Saving…" : current ? "Change package" : "Add package"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Target service</Label>
          <Select value={subId} onValueChange={pick}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {subs.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.plan_name} · {s.status}</SelectItem>
              ))}
              <SelectItem value="new">➕ New service line</SelectItem>
            </SelectContent>
          </Select>
          {current && (
            <p className="text-xs text-muted-foreground">
              Current: {current.plan_name} — {money(current.amount, current.currency)} / {current.billing_cycle}
            </p>
          )}
        </div>
        <div className="space-y-2"><Label>Package name *</Label>
          <Input value={form.plan_name} onChange={(e) => setForm({ ...form, plan_name: e.target.value })} /></div>
        <div className="space-y-2"><Label>Price *</Label>
          <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        <div className="space-y-2"><Label>Billing cycle</Label>
          <Select value={form.billing_cycle} onValueChange={(v) => setForm({ ...form, billing_cycle: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["monthly", "quarterly", "yearly", "weekly", "one_time"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select></div>
        <div className="space-y-2"><Label>Currency</Label>
          <Input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></div>
        <div className="space-y-2"><Label>Effective on</Label>
          <Input type="date" value={form.effective_on} onChange={(e) => setForm({ ...form, effective_on: e.target.value })} /></div>
        <div className="space-y-2 flex items-end gap-2">
          <input id="gen-inv" type="checkbox" checked={form.generate_invoice}
            onChange={(e) => setForm({ ...form, generate_invoice: e.target.checked })} className="h-4 w-4" />
          <Label htmlFor="gen-inv" className="mb-1">Generate pro-rata invoice</Label>
        </div>
        <div className="space-y-2 md:col-span-2"><Label>Description</Label>
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="space-y-2 md:col-span-2"><Label>Reason for change</Label>
          <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Package history</h4>
        <DataGrid
          rows={history as any[]}
          columns={[
            { header: "When", cell: (r: any) => shortDate(r.created_at) },
            { header: "Change", cell: (r: any) => <StatusBadge tone={toneForStatus(r.change_type)}>{r.change_type}</StatusBadge> },
            { header: "From", cell: (r: any) => r.from_plan ?? "—" },
            { header: "To", cell: (r: any) => r.to_plan ?? "—" },
            { header: "Reason", cell: (r: any) => <span className="text-xs text-muted-foreground">{r.reason ?? "—"}</span> },
          ] as ColumnDef<any>[]}
          empty={<EmptyState icon={Clock} title="No package changes yet" />}
        />
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------- 2. billing */

function BillingWorkspace({ ctx, onClose }: { ctx: WorkspaceCtx; onClose: () => void }) {
  const fn = useServerFn(getCustomerBilling);
  const creditFn = useServerFn(addCustomerCredit);
  const noteFn = useServerFn(addBillingNote);
  const qc = useQueryClient();
  const key = ["c360-billing", ctx.customerId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => fn({ data: { customer_id: ctx.customerId } }) });
  const [note, setNote] = useState("");
  const [credit, setCredit] = useState("");

  const addCredit = useMutation({
    mutationFn: () => creditFn({ data: { customer_id: ctx.customerId, amount: Number(credit), note: "Manual credit" } }),
    onSuccess: () => { toast.success("Credit added"); setCredit(""); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const addNote = useMutation({
    mutationFn: () => noteFn({ data: { customer_id: ctx.customerId, body: note } }),
    onSuccess: () => { toast.success("Billing note saved"); setNote(""); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = data?.summary;
  return (
    <Shell open onClose={onClose} wide title={`Billing workspace · ${ctx.companyName}`}
      description="Live balances, invoices, payments, credits and refunds for this account.">
      {isLoading || !s ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading billing data…</p>
      ) : (
        <div className="space-y-4">
          <KpiRow items={[
            { icon: DollarSign, label: "Outstanding", value: money(s.outstanding), tone: s.outstanding > 0 ? "warning" : "success" },
            { icon: Wallet, label: "Credit balance", value: money(s.creditBalance), tone: "info" },
            { icon: TrendingUp, label: "MRR", value: money(s.mrr), tone: "success" },
            { icon: TrendingUp, label: "ARR", value: money(s.arr), tone: "info" },
            { icon: Receipt, label: "Refunded", value: money(s.totalRefunded), tone: "neutral" },
          ]} />

          {!!data.alerts?.length && (
            <Card><CardContent className="p-3 space-y-1">
              {data.alerts.map((a: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />{a.text}
                </div>
              ))}
            </CardContent></Card>
          )}

          <Card><CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 p-4">
            <InfoRow label="Next invoice date" value={s.nextInvoiceDate ? shortDate(s.nextInvoiceDate) : "—"} />
            <InfoRow label="Next payment due" value={s.nextPaymentDue ? `${s.nextPaymentDue.invoice_number} · ${money(s.nextPaymentDue.balance, s.nextPaymentDue.currency)}` : "—"}
              sub={s.nextPaymentDue?.due_date ? shortDate(s.nextPaymentDue.due_date) : null} />
            <InfoRow label="Last payment" value={s.lastPayment ? money(s.lastPayment.amount, s.lastPayment.currency) : "—"}
              sub={s.lastPayment?.paid_at ? shortDate(s.lastPayment.paid_at) : null} />
            <InfoRow label="Recurring charges" value={String(s.recurringCount)} />
            <InfoRow label="Total paid" value={money(s.totalPaid)} />
            <InfoRow label="Advance payments" value={money(s.advanceTotal)} />
          </CardContent></Card>

          <Tabs defaultValue="invoices">
            <TabsList>
              <TabsTrigger value="invoices">Invoices ({s.invoiceCounts.total})</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="ageing">Ageing</TabsTrigger>
              <TabsTrigger value="recurring">Recurring</TabsTrigger>
              <TabsTrigger value="refunds">Refunds & credits</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="invoices">
              <DataGrid rows={data.invoices} columns={[
                { header: "Invoice", cell: (r: any) => <span className="font-mono">{r.invoice_number}</span> },
                { header: "Issued", cell: (r: any) => shortDate(r.issue_date) },
                { header: "Due", cell: (r: any) => r.due_date ? shortDate(r.due_date) : "—" },
                { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.is_overdue ? "overdue" : r.status)}>{r.is_overdue ? "overdue" : r.status}</StatusBadge> },
                { header: "Total", align: "right", cell: (r: any) => money(r.total, r.currency) },
                { header: "Paid", align: "right", cell: (r: any) => money(r.paid_amount, r.currency) },
                { header: "Balance", align: "right", cell: (r: any) => money(r.balance, r.currency) },
              ] as ColumnDef<any>[]} empty={<EmptyState icon={FileText} title="No invoices" />} />
            </TabsContent>

            <TabsContent value="payments">
              <DataGrid rows={data.payments} columns={[
                { header: "Receipt", cell: (r: any) => <span className="font-mono">{r.receipt_number ?? r.reference ?? "—"}</span> },
                { header: "Paid at", cell: (r: any) => shortDate(r.paid_at) },
                { header: "Method", cell: (r: any) => r.method ?? "—" },
                { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge> },
                { header: "Amount", align: "right", cell: (r: any) => money(r.amount, r.currency) },
              ] as ColumnDef<any>[]} empty={<EmptyState icon={Receipt} title="No payments" />} />
            </TabsContent>

            <TabsContent value="ageing">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-3">
                {Object.entries(data.ageing).map(([k, v]) => (
                  <Card key={k}><CardContent className="p-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.replace("d", "").replace("_", "–")}</div>
                    <div className="font-mono font-semibold">{money(v as number)}</div>
                  </CardContent></Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="recurring">
              <DataGrid rows={data.serviceBillingStatus} columns={[
                { header: "Service", cell: (r: any) => r.label },
                { header: "Kind", cell: (r: any) => r.kind },
                { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge> },
                { header: "Billing", cell: (r: any) => <StatusBadge tone={r.billing_state === "arrears" ? "danger" : "success"}>{r.billing_state}</StatusBadge> },
                { header: "Next renewal", cell: (r: any) => r.next_renewal ? shortDate(r.next_renewal) : "—" },
                { header: "Monthly", align: "right", cell: (r: any) => money(r.monthly, r.currency) },
              ] as ColumnDef<any>[]} empty={<EmptyState icon={Activity} title="No recurring charges" />} />
            </TabsContent>

            <TabsContent value="refunds" className="space-y-3">
              <DataGrid rows={data.refunds} columns={[
                { header: "When", cell: (r: any) => shortDate(r.refunded_at ?? r.created_at) },
                { header: "Reason", cell: (r: any) => r.reason ?? "—" },
                { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge> },
                { header: "Amount", align: "right", cell: (r: any) => money(r.amount, r.currency) },
              ] as ColumnDef<any>[]} empty={<EmptyState icon={Receipt} title="No refunds" />} />
              <div className="flex items-end gap-2">
                <div className="space-y-1"><Label>Add credit</Label>
                  <Input type="number" step="0.01" value={credit} onChange={(e) => setCredit(e.target.value)} className="w-40" /></div>
                <Button onClick={() => addCredit.mutate()} disabled={!credit || addCredit.isPending}>Add credit</Button>
              </div>
              <DataGrid rows={data.credits} columns={[
                { header: "When", cell: (r: any) => shortDate(r.created_at) },
                { header: "Kind", cell: (r: any) => r.kind },
                { header: "Note", cell: (r: any) => r.note ?? "—" },
                { header: "Amount", align: "right", cell: (r: any) => money(r.amount, r.currency) },
              ] as ColumnDef<any>[]} empty={<EmptyState icon={Wallet} title="No credits" />} />
            </TabsContent>

            <TabsContent value="notes" className="space-y-3">
              <div className="flex gap-2">
                <Textarea rows={2} placeholder="Billing note…" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button onClick={() => addNote.mutate()} disabled={!note.trim() || addNote.isPending}>Save</Button>
              </div>
              {data.notes.length === 0 ? <EmptyState icon={FileText} title="No billing notes" /> : (
                <div className="space-y-2">
                  {data.notes.map((n: any) => (
                    <Card key={n.id}><CardContent className="p-3">
                      <div className="text-xs text-muted-foreground">{shortDate(n.created_at)}</div>
                      <div className="text-sm whitespace-pre-wrap">{n.body}</div>
                    </CardContent></Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------ 3. timeline */

function TimelineWorkspace({ ctx, onClose }: { ctx: WorkspaceCtx; onClose: () => void }) {
  const fn = useServerFn(getCustomerHistory);
  const [full, setFull] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["c360-history", ctx.customerId, full],
    queryFn: () => fn({ data: { customer_id: ctx.customerId, account_number: ctx.accountNumber, full } }),
  });
  const entries = full ? data?.all ?? [] : data?.major ?? [];

  return (
    <Shell open onClose={onClose} wide title={`Customer timeline · ${ctx.companyName}`}
      description="Every major event recorded against this account."
      footer={<Button variant="outline" onClick={() => setFull((v) => !v)}>{full ? "Show major events only" : "View more (full audit history)"}</Button>}>
      {isLoading ? <p className="text-sm text-muted-foreground py-8 text-center">Loading timeline…</p> : (
        <div className="space-y-2">
          {entries.length === 0 && <EmptyState icon={Clock} title="No activity recorded yet" />}
          {entries.map((e: any) => (
            <div key={e.id} className="flex gap-3 border-l-2 border-border pl-3 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{e.title}</div>
                {e.description && <div className="text-xs text-muted-foreground">{e.description}</div>}
                <div className="text-[11px] text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()} · {e.event_type}{e.actor_name ? ` · ${e.actor_name}` : ""}
                </div>
              </div>
            </div>
          ))}
          {full && !!data?.audit?.length && (
            <div className="pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Audit log</h4>
              <DataGrid rows={data.audit} columns={[
                { header: "When", cell: (r: any) => new Date(r.created_at).toLocaleString() },
                { header: "Action", cell: (r: any) => r.action },
                { header: "Entity", cell: (r: any) => `${r.entity_type}${r.entity_id ? ` · ${String(r.entity_id).slice(0, 8)}` : ""}` },
                { header: "Actor", cell: (r: any) => r.actor_email ?? "—" },
                { header: "IP", cell: (r: any) => r.ip_address ?? "—" },
              ] as ColumnDef<any>[]} />
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

/* --------------------------------------------------------------- 4. comms */

function CommunicationCenter({ ctx, onClose }: { ctx: WorkspaceCtx; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(getCustomerConversations);
  const send = useServerFn(sendCustomerMessage);
  const key = ["c360-comms", ctx.customerId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => fn({ data: { customer_id: ctx.customerId } }) });
  const [form, setForm] = useState({
    channel: "email" as "email" | "note",
    recipient: ctx.primaryEmail ?? "",
    subject: "",
    body: "",
    thread_id: null as string | null,
  });

  const post = useMutation({
    mutationFn: () => send({
      data: {
        customer_id: ctx.customerId,
        channel: form.channel,
        recipient: form.recipient,
        subject: form.subject,
        body: form.body,
        thread_id: form.thread_id,
        is_internal: form.channel === "note",
      },
    }),
    onSuccess: () => {
      toast.success(form.channel === "email" ? "Email sent" : "Internal note saved");
      setForm((f) => ({ ...f, subject: "", body: "", thread_id: null }));
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell open onClose={onClose} wide title={`Communication center · ${ctx.companyName}`}
      description="Outgoing email, replies, threads and internal notes.">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>Channel</Label>
              <Select value={form.channel} onValueChange={(v: any) => setForm({ ...form, channel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="note">Internal note</SelectItem>
                </SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Recipient</Label>
              <Input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} disabled={form.channel === "note"} /></div>
          </div>
          <div className="space-y-1"><Label>Subject</Label>
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
          <div className="space-y-1"><Label>Message</Label>
            <Textarea rows={7} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
          {form.thread_id && <p className="text-xs text-muted-foreground">Replying in an existing thread. <button className="underline" onClick={() => setForm({ ...form, thread_id: null })}>Start new</button></p>}
          <Button onClick={() => post.mutate()} disabled={post.isPending || !form.subject || !form.body}>
            <Send className="h-4 w-4 mr-1.5" />{post.isPending ? "Sending…" : form.channel === "email" ? "Send email" : "Save note"}
          </Button>
        </div>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {isLoading && <p className="text-sm text-muted-foreground">Loading conversations…</p>}
          {!isLoading && !data?.threads.length && <EmptyState icon={Mail} title="No communications yet" />}
          {data?.threads.map((t: any) => (
            <Card key={t.id}><CardContent className="p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{t.subject}</div>
                <StatusBadge tone="info">{t.channel}</StatusBadge>
              </div>
              {t.messages.map((m: any) => (
                <div key={m.id} className="text-xs border-l-2 border-border pl-2 py-1">
                  <div className="text-muted-foreground">
                    {m.direction} · {m.status} · {shortDate(m.sent_at ?? m.created_at)}
                  </div>
                  <div className="whitespace-pre-wrap">{m.body}</div>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="h-7 text-xs"
                onClick={() => setForm((f) => ({ ...f, thread_id: t.id, subject: `Re: ${t.subject}` }))}>
                Reply in thread
              </Button>
            </CardContent></Card>
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ----------------------------------------------------------------- 5. KYC */

function DocRow({ doc, onOpen, onChanged }: { doc: any; onOpen: (id: string) => void; onChanged: () => void }) {
  const setStatus = useServerFn(setDocumentStatus);
  const del = useServerFn(deleteCustomerDocument);
  const [issued, setIssued] = useState(doc.issued_on ?? "");
  const [expires, setExpires] = useState(doc.expires_at ?? "");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try { await fn(); toast.success(msg); onChanged(); }
    catch (e: any) { toast.error(e.message ?? "Action failed"); }
    finally { setBusy(false); }
  }

  const tone = doc.expired ? "danger" : doc.status === "verified" ? "success" : doc.status === "rejected" ? "danger" : doc.expiring_soon ? "warning" : toneForStatus(doc.status);
  const label = doc.expired ? "expired" : doc.expiring_soon ? `expires in ${doc.expiry_days}d` : doc.status;

  return (
    <div className="rounded border px-2 py-1.5 text-xs space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate">{doc.file_name ?? doc.doc_label}</div>
          <div className="text-muted-foreground">
            uploaded {shortDate(doc.created_at)}
            {doc.verified_at ? ` · verified ${shortDate(doc.verified_at)}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge tone={tone as any}>{label}</StatusBadge>
          {doc.file_path && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onOpen(doc.id)}>Open</Button>}
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy || doc.status === "verified"}
            onClick={() => run(() => setStatus({ data: { document_id: doc.id, status: "verified" } }), "Document verified")}>Verify</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-warning" disabled={busy}
            onClick={() => {
              const reason = window.prompt("Reason for rejecting this document?");
              if (!reason?.trim()) return;
              void run(() => setStatus({ data: { document_id: doc.id, status: "rejected", notes: reason.trim() } }), "Document rejected");
            }}>Reject</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" disabled={busy}
            onClick={() => { if (confirm("Remove this document?")) void run(() => del({ data: { document_id: doc.id } }), "Document removed"); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Issued</Label>
          <Input type="date" className="h-7 w-36 text-xs" value={issued ?? ""} onChange={(e) => setIssued(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Expires</Label>
          <Input type="date" className="h-7 w-36 text-xs" value={expires ?? ""} onChange={(e) => setExpires(e.target.value)} /></div>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
          onClick={() => run(() => setStatus({ data: { document_id: doc.id, issued_on: issued || null, expires_at: expires || null } }), "Dates saved")}>
          Save dates
        </Button>
        {doc.notes && <span className="text-[11px] text-muted-foreground">Note: {doc.notes}</span>}
      </div>
    </div>
  );
}

function KycWorkspace({ ctx, onClose }: { ctx: WorkspaceCtx; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(getCustomerDocuments);
  const saveDoc = useServerFn(saveCustomerDocument);
  const link = useServerFn(getDocumentLink);
  const key = ["c360-kyc", ctx.customerId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => fn({ data: { customer_id: ctx.customerId } }) });
  const [busy, setBusy] = useState<string | null>(null);
  const [otherLabel, setOtherLabel] = useState("");

  const refresh = () => qc.invalidateQueries();

  async function upload(docKey: string, docLabel: string, file: File) {
    setBusy(docKey);
    try {
      const path = `${ctx.customerId}/${docKey}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("customer-documents").upload(path, file, { upsert: false });
      if (error) throw error;
      await saveDoc({
        data: {
          customer_id: ctx.customerId, doc_key: docKey, doc_label: docLabel,
          file_path: path, file_name: file.name, mime_type: file.type, file_size: file.size,
        },
      });
      toast.success(`${docLabel} uploaded`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally { setBusy(null); }
  }

  async function open(id: string) {
    try {
      const res = await link({ data: { document_id: id } });
      if (res?.url) window.open(res.url, "_blank", "noopener");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <Shell open onClose={onClose} wide title={`KYC documents · ${ctx.companyName}`}
      description={data ? `${data.profile} profile · ${data.completion}% complete · ${data.verifiedCount}/${data.totalCount} verified` : undefined}>
      {isLoading || !data ? <p className="text-sm text-muted-foreground py-8 text-center">Loading documents…</p> : (
        <div className="space-y-3">
          <KpiRow cols={4} items={[
            { icon: ShieldCheck, label: "Completion", value: `${data.completion}%`, tone: data.completion === 100 ? "success" : "warning" },
            { icon: FileText, label: "On file", value: String(data.totalCount), tone: "info" },
            { icon: Clock, label: "Expiring ≤30d", value: String(data.expiringSoon.length), tone: data.expiringSoon.length ? "warning" : "neutral" },
            { icon: AlertTriangle, label: "Expired", value: String(data.expired.length), tone: data.expired.length ? "danger" : "neutral" },
          ]} />
          {!!data.missingRequired.length && (
            <div className="flex items-center gap-2 text-xs text-warning">
              <AlertTriangle className="h-4 w-4" />Missing required: {data.missingRequired.join(", ")}
            </div>
          )}
          {data.checklist.map((c: any) => (
            <Card key={c.key}><CardContent className="p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`h-4 w-4 ${c.satisfied ? "text-success" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">{c.label}</span>
                  {c.required && <StatusBadge tone={c.satisfied ? "success" : "danger"}>{c.satisfied ? "on file" : "required"}</StatusBadge>}
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer text-solar">
                  <Upload className="h-3.5 w-3.5" />{busy === c.key ? "Uploading…" : "Upload"}
                  <input type="file" className="hidden" disabled={busy === c.key}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(c.key, c.label, f); e.currentTarget.value = ""; }} />
                </label>
              </div>
              {c.documents.map((d: any) => <DocRow key={d.id} doc={d} onOpen={open} onChanged={refresh} />)}
            </CardContent></Card>
          ))}

          <Card><CardContent className="p-3 space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Other documents</h4>
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-8 max-w-xs text-xs" placeholder="Document name (e.g. Signed SLA)"
                value={otherLabel} onChange={(e) => setOtherLabel(e.target.value)} />
              <label className={`inline-flex items-center gap-1.5 text-xs ${otherLabel.trim() ? "cursor-pointer text-solar" : "text-muted-foreground pointer-events-none"}`}>
                <Upload className="h-3.5 w-3.5" />{busy === "__other" ? "Uploading…" : "Upload"}
                <input type="file" className="hidden" disabled={!otherLabel.trim() || busy === "__other"}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const label = otherLabel.trim();
                      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "other_document";
                      void upload(slug, label, f).then(() => setOtherLabel(""));
                    }
                    e.currentTarget.value = "";
                  }} />
              </label>
            </div>
            {data.others.length === 0
              ? <p className="text-xs text-muted-foreground">No additional documents.</p>
              : data.others.map((d: any) => <DocRow key={d.id} doc={d} onOpen={open} onChanged={refresh} />)}
          </CardContent></Card>
        </div>
      )}
    </Shell>
  );
}

/* ----------------------------------------------------------- 6. equipment */

const ASSET_STATES = ["deployed", "in_service", "spare", "in_repair", "retired", "lost"];

function EditEquipment({ asset, onDone }: { asset: any; onDone: () => void }) {
  const update = useServerFn(updateEquipment);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    assigned_to: asset.assigned_to ?? "",
    location: asset.location ?? "",
    status: asset.status ?? "deployed",
    warranty_expires: asset.warranty_expires ?? "",
    notes: "",
  });
  const save = useMutation({
    mutationFn: () => update({
      data: {
        asset_id: asset.id,
        assigned_to: form.assigned_to,
        location: form.location,
        status: form.status,
        warranty_expires: form.warranty_expires || null,
        notes: form.notes || null,
      },
    }),
    onSuccess: () => { toast.success("Equipment updated"); setOpen(false); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(true)}>Reassign</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reassign / update equipment</DialogTitle>
            <DialogDescription>{[asset.asset_tag, asset.asset_type, asset.serial_number].filter(Boolean).join(" · ")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Technician / holder</Label>
              <Input value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} /></div>
            <div className="space-y-1"><Label>Location / site</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div className="space-y-1"><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ASSET_STATES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Warranty expires</Label>
              <Input type="date" value={form.warranty_expires ?? ""} onChange={(e) => setForm({ ...form, warranty_expires: e.target.value })} /></div>
            <div className="space-y-1 md:col-span-2"><Label>Note</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EquipmentWorkspace({ ctx, onClose }: { ctx: WorkspaceCtx; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(getCustomerEquipment);
  const assign = useServerFn(assignEquipment);
  const release = useServerFn(releaseEquipment);
  const key = ["c360-equipment", ctx.customerId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => fn({ data: { customer_id: ctx.customerId } }) });
  const [stock, setStock] = useState({ asset_id: "", assigned_to: "", location: "", notes: "" });
  const emptyNew = { asset_type: "", make: "", model: "", serial_number: "", warranty_expires: "", purchase_date: "", location: "", assigned_to: "", notes: "" };
  const [nw, setNw] = useState(emptyNew);

  const doAssign = useMutation({
    mutationFn: (payload: any) => assign({ data: { customer_id: ctx.customerId, ...payload } }),
    onSuccess: () => {
      toast.success("Equipment assigned");
      setStock({ asset_id: "", assigned_to: "", location: "", notes: "" });
      setNw(emptyNew);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell open onClose={onClose} wide title={`Equipment & assets · ${ctx.companyName}`}
      description="Assigned equipment, technician handover, warranty tracking and full assignment history.">
      {isLoading || !data ? <p className="text-sm text-muted-foreground py-8 text-center">Loading equipment…</p> : (
        <div className="space-y-4">
          <KpiRow cols={4} items={[
            { icon: Boxes, label: "Assigned", value: String(data.stats.total), tone: "info" },
            { icon: Activity, label: "In service", value: String(data.stats.inService), tone: "success" },
            { icon: ShieldCheck, label: "Under warranty", value: String(data.stats.underWarranty), tone: "info" },
            { icon: AlertTriangle, label: "Warranty expiring", value: String(data.stats.warrantyExpiring), tone: data.stats.warrantyExpiring ? "warning" : "neutral" },
          ]} />

          <DataGrid rows={data.assigned} columns={[
            { header: "Tag", cell: (r: any) => <span className="font-mono">{r.asset_tag ?? "—"}</span> },
            { header: "Type", cell: (r: any) => r.asset_type },
            { header: "Make/Model", cell: (r: any) => [r.make, r.model].filter(Boolean).join(" ") || "—" },
            { header: "Serial", cell: (r: any) => <span className="font-mono text-xs">{r.serial_number ?? "—"}</span> },
            { header: "Technician", cell: (r: any) => r.assigned_to ?? "—" },
            { header: "Assigned", cell: (r: any) => shortDate(r.assigned_on) },
            {
              header: "Warranty", cell: (r: any) => r.warranty_expires
                ? <StatusBadge tone={r.warranty_state === "expired" ? "danger" : r.warranty_state === "expiring" ? "warning" : "success"}>{shortDate(r.warranty_expires)}</StatusBadge>
                : "—",
            },
            { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{String(r.status).replace(/_/g, " ")}</StatusBadge> },
            {
              header: "", align: "right", cell: (r: any) => (
                <div className="flex items-center justify-end gap-1">
                  <EditEquipment asset={r} onDone={() => qc.invalidateQueries()} />
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                    onClick={async () => {
                      if (!confirm("Return this equipment to stock?")) return;
                      try { await release({ data: { asset_id: r.id } }); toast.success("Returned to stock"); qc.invalidateQueries(); }
                      catch (e: any) { toast.error(e.message); }
                    }}>Release</Button>
                </div>
              ),
            },
          ] as ColumnDef<any>[]} empty={<EmptyState icon={Boxes} title="No equipment assigned" />} />

          <Card><CardContent className="p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assign from stock</h4>
            <div className="grid gap-2 md:grid-cols-4">
              <div className="space-y-1 md:col-span-2"><Label>Available asset</Label>
                <Select value={stock.asset_id} onValueChange={(v) => setStock({ ...stock, asset_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                  <SelectContent>
                    {data.pool.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{a.asset_tag ?? a.asset_type} · {[a.make, a.model].filter(Boolean).join(" ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Technician</Label>
                <Input value={stock.assigned_to} onChange={(e) => setStock({ ...stock, assigned_to: e.target.value })} /></div>
              <div className="space-y-1"><Label>Location / site</Label>
                <Input value={stock.location} onChange={(e) => setStock({ ...stock, location: e.target.value })} /></div>
              <div className="space-y-1 md:col-span-3"><Label>Handover note</Label>
                <Input value={stock.notes} onChange={(e) => setStock({ ...stock, notes: e.target.value })} /></div>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => doAssign.mutate(stock)} disabled={!stock.asset_id || doAssign.isPending}>Assign</Button>
              </div>
            </div>

            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">Or register new equipment</h4>
            <div className="grid gap-2 md:grid-cols-3">
              <Input placeholder="Type (router, ONT…)" value={nw.asset_type} onChange={(e) => setNw({ ...nw, asset_type: e.target.value })} />
              <Input placeholder="Make" value={nw.make} onChange={(e) => setNw({ ...nw, make: e.target.value })} />
              <Input placeholder="Model" value={nw.model} onChange={(e) => setNw({ ...nw, model: e.target.value })} />
              <Input placeholder="Serial number" value={nw.serial_number} onChange={(e) => setNw({ ...nw, serial_number: e.target.value })} />
              <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Installed / purchased</Label>
                <Input type="date" value={nw.purchase_date} onChange={(e) => setNw({ ...nw, purchase_date: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Warranty expires</Label>
                <Input type="date" value={nw.warranty_expires} onChange={(e) => setNw({ ...nw, warranty_expires: e.target.value })} /></div>
              <Input placeholder="Assigned technician" value={nw.assigned_to} onChange={(e) => setNw({ ...nw, assigned_to: e.target.value })} />
              <Input placeholder="Location / site" value={nw.location} onChange={(e) => setNw({ ...nw, location: e.target.value })} />
              <Input placeholder="Note" value={nw.notes} onChange={(e) => setNw({ ...nw, notes: e.target.value })} />
            </div>
            <Button onClick={() => doAssign.mutate({ ...nw, warranty_expires: nw.warranty_expires || null, purchase_date: nw.purchase_date || null })}
              disabled={!nw.asset_type || doAssign.isPending}>Register & assign</Button>
          </CardContent></Card>

          {!!data.history.length && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Assignment history</h4>
              <DataGrid rows={data.history} columns={[
                { header: "When", cell: (r: any) => shortDate(r.occurred_at) },
                { header: "Asset", cell: (r: any) => <span className="text-xs">{r.asset_label || "—"}</span> },
                { header: "Event", cell: (r: any) => <StatusBadge tone={toneForStatus(r.event_type)}>{String(r.event_type).replace(/_/g, " ")}</StatusBadge> },
                { header: "Notes", cell: (r: any) => <span className="text-xs text-muted-foreground">{r.notes ?? "—"}</span> },
              ] as ColumnDef<any>[]} />
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}


/* ------------------------------------------------------- 7. service state */

function ServiceStateWorkspace({ kind, ctx, onClose }: { kind: "suspend" | "resume" | "cancel"; ctx: WorkspaceCtx; onClose: () => void }) {
  const refresh = useRefreshAll();
  const fn = useServerFn(setServiceState);
  const subs = (ctx.subscriptions ?? []).filter((s) => s.status !== "cancelled");
  const [scope, setScope] = useState<"account" | "subscription">(subs.length ? "subscription" : "account");
  const [subId, setSubId] = useState(subs[0]?.id ?? "");
  const [reason, setReason] = useState("");

  const run = useMutation({
    mutationFn: () => fn({
      data: {
        customer_id: ctx.customerId, action: kind, scope,
        subscription_id: scope === "subscription" ? subId : undefined,
        reason,
      },
    }),
    onSuccess: () => { toast.success(`Service ${kind === "suspend" ? "suspended" : kind === "resume" ? "resumed" : "cancelled"}`); refresh(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const title = kind === "suspend" ? "Suspend service" : kind === "resume" ? "Resume service" : "Cancel service";
  return (
    <Shell open onClose={onClose} title={`${title} · ${ctx.companyName}`}
      description={scope === "account" ? "Applies to every active service on this account." : "Applies to the selected service only."}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant={kind === "resume" ? "default" : "destructive"}
            onClick={() => run.mutate()} disabled={run.isPending || (scope === "subscription" && !subId)}>
            {run.isPending ? "Working…" : title}
          </Button>
        </>
      }>
      <div className="space-y-3">
        <div className="space-y-1"><Label>Scope</Label>
          <Select value={scope} onValueChange={(v: any) => setScope(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="subscription" disabled={!subs.length}>Single service</SelectItem>
              <SelectItem value="account">Whole account (cascade)</SelectItem>
            </SelectContent>
          </Select></div>
        {scope === "subscription" && (
          <div className="space-y-1"><Label>Service</Label>
            <Select value={subId} onValueChange={setSubId}>
              <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
              <SelectContent>{subs.map((s) => <SelectItem key={s.id} value={s.id}>{s.plan_name} · {s.status}</SelectItem>)}</SelectContent>
            </Select></div>
        )}
        <div className="space-y-1"><Label>Reason</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------ 8. contract */

function ContractWorkspace({ ctx, onClose }: { ctx: WorkspaceCtx; onClose: () => void }) {
  const refresh = useRefreshAll();
  const fn = useServerFn(generateContract);
  const [form, setForm] = useState({ title: "Service Agreement", term_months: "12", start_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [doc, setDoc] = useState<any>(null);

  const run = useMutation({
    mutationFn: () => fn({
      data: {
        customer_id: ctx.customerId, title: form.title,
        term_months: Number(form.term_months) || 12,
        start_date: form.start_date, notes: form.notes,
      },
    }),
    onSuccess: (d) => { setDoc(d); toast.success("Contract generated"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  function print() {
    if (!doc) return;
    printHtml(doc.reference, `
      <h1>${form.title}</h1>
      <div class="muted">${doc.reference}</div>
      <h2>Customer</h2>
      <div>${doc.customer.company_name} (${doc.customer.account_number})<br/>${doc.customer.primary_email ?? ""}<br/>${doc.customer.billing_address ?? ""}</div>
      <h2>Term</h2>
      <div>${doc.term_months} months · ${doc.start_date} → ${doc.end_date}</div>
      <h2>Services</h2>
      ${tableHtml(["Package", "Cycle", "Amount", "Monthly equivalent"],
        doc.items.map((i: any) => [i.plan_name, i.billing_cycle, `${i.currency} ${i.amount.toFixed(2)}`, i.monthly.toFixed(2)]))}
      <h2>Totals</h2>
      <div>Monthly: ${doc.monthlyTotal.toFixed(2)} · Annual: ${doc.annualTotal.toFixed(2)}</div>
      ${doc.notes ? `<h2>Notes</h2><div>${doc.notes}</div>` : ""}
      <h2>Signatures</h2>
      <div style="margin-top:40px">_____________________________ &nbsp;&nbsp;&nbsp; _____________________________<br/>IMT Solutions &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${doc.customer.company_name}</div>
    `);
  }

  return (
    <Shell open onClose={onClose} title={`Generate contract · ${ctx.companyName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {doc && <Button variant="outline" onClick={print}><Printer className="h-4 w-4 mr-1.5" />Print / PDF</Button>}
          <Button onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? "Generating…" : "Generate"}</Button>
        </>
      }>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="space-y-1"><Label>Term (months)</Label><Input type="number" min="1" value={form.term_months} onChange={(e) => setForm({ ...form, term_months: e.target.value })} /></div>
        <div className="space-y-1"><Label>Start date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
        <div className="space-y-1 md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </div>
      {doc && (
        <Card className="mt-3"><CardContent className="p-4 text-sm space-y-1">
          <div className="font-mono font-semibold">{doc.reference}</div>
          <div>{doc.items.length} service(s) · {money(doc.monthlyTotal)}/mo · {money(doc.annualTotal)}/yr</div>
          <div className="text-muted-foreground text-xs">{doc.start_date} → {doc.end_date}</div>
        </CardContent></Card>
      )}
    </Shell>
  );
}

/* -------------------------------------------------------------- 9. refund */

function RefundWorkspace({ ctx, onClose }: { ctx: WorkspaceCtx; onClose: () => void }) {
  const refresh = useRefreshAll();
  const billing = useServerFn(getCustomerBilling);
  const fn = useServerFn(recordRefund);
  const { data } = useQuery({ queryKey: ["c360-billing", ctx.customerId], queryFn: () => billing({ data: { customer_id: ctx.customerId } }) });
  const payments = (data?.payments ?? []).filter((p: any) => p.status !== "failed");
  const [form, setForm] = useState({ payment_id: "", amount: "", method: "", reference: "", reason: "", as_credit: false });

  const selected = payments.find((p: any) => p.id === form.payment_id);

  const run = useMutation({
    mutationFn: () => fn({
      data: {
        customer_id: ctx.customerId,
        payment_id: form.payment_id || null,
        invoice_id: null,
        amount: Number(form.amount),
        currency: selected?.currency ?? "USD",
        method: form.method, reference: form.reference, reason: form.reason,
        as_credit: form.as_credit,
      },
    }),
    onSuccess: () => { toast.success("Refund recorded"); refresh(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell open onClose={onClose} title={`Refund · ${ctx.companyName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending || !Number(form.amount)}>{run.isPending ? "Saving…" : "Record refund"}</Button>
        </>
      }>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2"><Label>Against payment (optional)</Label>
          <Select value={form.payment_id || "none"} onValueChange={(v) => setForm({ ...form, payment_id: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Standalone refund</SelectItem>
              {payments.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {shortDate(p.paid_at)} · {money(p.amount, p.currency)} · {p.receipt_number ?? p.reference ?? p.method ?? ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select></div>
        <div className="space-y-1"><Label>Amount *</Label><Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        <div className="space-y-1"><Label>Method</Label><Input value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} /></div>
        <div className="space-y-1"><Label>Reference</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
        <div className="space-y-1 flex items-end gap-2">
          <input id="as-credit" type="checkbox" className="h-4 w-4" checked={form.as_credit} onChange={(e) => setForm({ ...form, as_credit: e.target.checked })} />
          <Label htmlFor="as-credit" className="mb-1">Issue as account credit</Label>
        </div>
        <div className="space-y-1 md:col-span-2"><Label>Reason</Label><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
      </div>
    </Shell>
  );
}

/* ----------------------------------------------------------- 10. statement */

function StatementWorkspace({ ctx, onClose }: { ctx: WorkspaceCtx; onClose: () => void }) {
  const fn = useServerFn(getCustomerStatement);
  const [range, setRange] = useState({
    from: new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  });
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["c360-statement", ctx.customerId, range.from, range.to],
    queryFn: () => fn({ data: { customer_id: ctx.customerId, from: range.from, to: range.to } }),
  });

  function print() {
    if (!data) return;
    printHtml(`Statement ${ctx.accountNumber}`, `
      <h1>Account statement</h1>
      <div class="muted">${data.customer.company_name} (${data.customer.account_number}) · ${data.from} → ${data.to}</div>
      <h2>Movements</h2>
      ${tableHtml(["Date", "Type", "Reference", "Description", "Debit", "Credit", "Balance"],
        data.lines.map((l: any) => [l.date, l.kind, l.ref, l.description, l.debit.toFixed(2), l.credit.toFixed(2), l.balance.toFixed(2)]))}
      <h2>Summary</h2>
      <div>Opening: ${data.opening.toFixed(2)} · Debits: ${data.totalDebit.toFixed(2)} · Credits: ${data.totalCredit.toFixed(2)} · <b>Closing: ${data.closing.toFixed(2)}</b></div>
    `);
  }

  return (
    <Shell open onClose={onClose} wide title={`Account statement · ${ctx.companyName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="outline" disabled={!data} onClick={() => data && download(
            `statement-${ctx.accountNumber}.csv`,
            csv(["Date", "Type", "Reference", "Description", "Debit", "Credit", "Balance"],
              data.lines.map((l: any) => [l.date, l.kind, l.ref, l.description, l.debit, l.credit, l.balance])),
            "text/csv",
          )}><Download className="h-4 w-4 mr-1.5" />CSV</Button>
          <Button onClick={print} disabled={!data}><Printer className="h-4 w-4 mr-1.5" />Print statement</Button>
        </>
      }>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div className="space-y-1"><Label>From</Label><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
        <div className="space-y-1"><Label>To</Label><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
        <Button variant="outline" onClick={() => refetch()}>Apply</Button>
      </div>
      {isLoading || !data ? <p className="text-sm text-muted-foreground py-8 text-center">Loading statement…</p> : (
        <>
          <KpiRow cols={4} items={[
            { icon: DollarSign, label: "Opening", value: money(data.opening), tone: "neutral" },
            { icon: Receipt, label: "Debits", value: money(data.totalDebit), tone: "warning" },
            { icon: Wallet, label: "Credits", value: money(data.totalCredit), tone: "success" },
            { icon: TrendingUp, label: "Closing", value: money(data.closing), tone: data.closing > 0 ? "danger" : "success" },
          ]} />
          <div className="mt-3">
            <DataGrid rows={data.lines.map((l: any, i: number) => ({ id: i, ...l }))} columns={[
              { header: "Date", cell: (r: any) => r.date },
              { header: "Type", cell: (r: any) => r.kind },
              { header: "Reference", cell: (r: any) => <span className="font-mono text-xs">{r.ref || "—"}</span> },
              { header: "Description", cell: (r: any) => r.description },
              { header: "Debit", align: "right", cell: (r: any) => r.debit ? r.debit.toFixed(2) : "—" },
              { header: "Credit", align: "right", cell: (r: any) => r.credit ? r.credit.toFixed(2) : "—" },
              { header: "Balance", align: "right", cell: (r: any) => <span className="font-mono">{r.balance.toFixed(2)}</span> },
            ] as ColumnDef<any>[]} empty={<EmptyState icon={FileText} title="No movements in this period" />} />
          </div>
        </>
      )}
    </Shell>
  );
}

/* -------------------------------------------------------------- 11. export */

function ProfileExportWorkspace({ ctx, onClose }: { ctx: WorkspaceCtx; onClose: () => void }) {
  const fn = useServerFn(getCustomerProfileExport);
  const { data, isLoading } = useQuery({
    queryKey: ["c360-export", ctx.customerId],
    queryFn: () => fn({ data: { customer_id: ctx.customerId } }),
  });

  const sections = useMemo(() => data ? ([
    ["Contacts", ["Name", "Role", "Type", "Email", "Phone"], data.contacts.map((c: any) => [c.name, c.role, c.contact_type, c.email, c.phone])],
    ["Subscriptions", ["Package", "Amount", "Cycle", "Status", "Next renewal"], data.subscriptions.map((s: any) => [s.plan_name, s.amount, s.billing_cycle, s.status, s.next_renewal])],
    ["Services", ["Service", "Type", "Vendor", "Plan", "Status"], data.services.map((s: any) => [s.service_name, s.service_type, s.vendor, s.plan, s.status])],
    ["Invoices", ["Invoice", "Issued", "Due", "Status", "Total"], data.invoices.map((i: any) => [i.invoice_number, i.issue_date, i.due_date, i.status, i.total])],
    ["Payments", ["Receipt", "Paid at", "Method", "Amount", "Status"], data.payments.map((p: any) => [p.receipt_number, p.paid_at, p.method, p.amount, p.status])],
    ["Tickets", ["Ticket", "Subject", "Status", "Priority"], data.tickets.map((t: any) => [t.ticket_number, t.subject, t.status, t.priority])],
    ["Assets", ["Tag", "Type", "Serial", "Status", "Warranty"], (data as any).assets?.map((a: any) => [a.asset_tag, a.asset_type, a.serial_number, a.status, a.warranty_expires]) ?? []],
  ] as [string, string[], any[][]][]) : [], [data]);

  function pdf() {
    if (!data) return;
    printHtml(`Customer profile ${ctx.accountNumber}`, `
      <h1>${data.customer.company_name}</h1>
      <div class="muted">${data.customer.account_number} · generated ${new Date(data.generated_at).toLocaleString()}</div>
      <h2>Summary</h2>
      <div>MRR ${data.summary.mrr.toFixed(2)} · ARR ${data.summary.arr.toFixed(2)} · ${data.summary.subscriptions} subscriptions · ${data.summary.services} services</div>
      ${sections.map(([t, h, r]) => r.length ? `<h2>${t}</h2>${tableHtml(h, r)}` : "").join("")}
    `);
  }

  function excel() {
    if (!data) return;
    const html = `<html><head><meta charset="utf-8"></head><body>
      <h1>${data.customer.company_name} (${data.customer.account_number})</h1>
      ${sections.map(([t, h, r]) => r.length ? `<h2>${t}</h2>${tableHtml(h, r)}` : "").join("")}
    </body></html>`;
    download(`customer-profile-${ctx.accountNumber}.xls`, html, "application/vnd.ms-excel");
  }

  return (
    <Shell open onClose={onClose} title={`Download customer profile · ${ctx.companyName}`}
      description="Full account dossier — contacts, services, billing, tickets and assets."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="outline" onClick={excel} disabled={!data}><Download className="h-4 w-4 mr-1.5" />Excel</Button>
          <Button onClick={pdf} disabled={!data}><Printer className="h-4 w-4 mr-1.5" />PDF</Button>
        </>
      }>
      {isLoading || !data ? <p className="text-sm text-muted-foreground py-8 text-center">Preparing export…</p> : (
        <div className="space-y-1 text-sm">
          {sections.map(([t, , r]) => (
            <div key={t} className="flex items-center justify-between border-b py-1.5">
              <span>{t}</span><span className="font-mono text-muted-foreground">{r.length}</span>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
