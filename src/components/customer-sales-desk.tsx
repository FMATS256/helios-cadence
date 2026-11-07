import { useState } from 'react';
import { invoiceOverdue } from '@/lib/customer360/account-status';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRoles } from '@/hooks/use-roles';
import { customerSalesPermissions, quoteCanConvert } from '@/lib/customer-sales.shared';
import { convertQuoteToInvoice, getQuotePdf, sendQuoteToCustomer, setQuoteOutcome } from '@/lib/quotes.functions';
import { emailInvoice, getStaffInvoicePdf } from '@/lib/finance.functions';
import { getSubmissionContext } from '@/lib/payment-submissions.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { StatusPill } from '@/components/page';
import { QuoteBuilderDialog } from '@/components/quote-builder';
import { SubmitPaymentDialog } from '@/components/submit-payment-dialog';
import { Check, CreditCard, Download, FileCheck, Mail, Pencil, Plus, Receipt } from 'lucide-react';
import { toast } from 'sonner';

const money = (value: number, currency = 'USD') => `${currency} ${Number(value || 0).toFixed(2)}`;

export function CustomerPendingPayments({ customerId }: { customerId: string }) {
  const { roles } = useRoles();
  const load = useServerFn(getSubmissionContext);
  const { data } = useQuery({ queryKey: ['submission-context', customerId], queryFn: () => load({ data: { customer_id: customerId } }), enabled: customerSalesPermissions(roles).canSubmitPayment });
  const submissions = (data?.submissions ?? []).filter((s: any) => ['pending', 'clarification'].includes(s.status));
  if (!submissions.length) return null;
  return <section className="mb-4 space-y-2 border-b border-border pb-4"><h3 className="font-semibold">Awaiting Finance verification</h3>{submissions.map((s: any) => <div key={s.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{s.payment_date} · {s.method.replace(/_/g, ' ')} · {s.reference || 'No reference'}</span><span className="font-mono">{money(s.amount, s.currency)}</span><StatusPill tone="warning">{s.status}</StatusPill></div>)}</section>;
}

function savePdf(file: { filename: string; base64: string }) {
  const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function CustomerSalesDesk({ customer, quotes = [], invoices = [], mode = 'quotes' }: {
  customer: any; quotes?: any[]; invoices?: any[]; mode?: 'quotes' | 'invoices';
}) {
  const { roles } = useRoles();
  const permissions = customerSalesPermissions(roles);
  const qc = useQueryClient();
  const [builder, setBuilder] = useState<{ id?: string } | null>(null);
  const [sending, setSending] = useState<any>(null);
  const [conversion, setConversion] = useState<any>(null);
  const [dueDays, setDueDays] = useState('14');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [paymentInvoice, setPaymentInvoice] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const send = useServerFn(sendQuoteToCustomer);
  const accept = useServerFn(setQuoteOutcome);
  const convert = useServerFn(convertQuoteToInvoice);
  const quotePdf = useServerFn(getQuotePdf);
  const invoicePdf = useServerFn(getStaffInvoicePdf);
  const sendInvoice = useServerFn(emailInvoice);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['customer-360', customer.account_number] });
    qc.invalidateQueries({ queryKey: ['quotes-overview'] });
    qc.invalidateQueries({ queryKey: ['submission-context', customer.id] });
  };
  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key);
    try { await action(); toast.success(success); refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Action failed'); }
    finally { setBusy(null); }
  }

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <h2 className="font-display text-lg font-semibold">{mode === 'quotes' ? 'Client quotations' : 'Client invoices'}</h2>
      <div className="flex flex-wrap gap-2">
        {permissions.canQuote && <Button size="sm" onClick={() => setBuilder({})}><Plus className="mr-2 h-4 w-4" />New quotation</Button>}
        {permissions.canSubmitPayment && <Button size="sm" variant="outline" onClick={() => setPaymentInvoice(null)}><CreditCard className="mr-2 h-4 w-4" />Submit cash / bank payment</Button>}
      </div>
    </div>
    {mode === 'quotes' ? <div className="divide-y divide-border">
      {!quotes.length && <p className="py-8 text-sm text-muted-foreground">No quotations on this account.</p>}
      {quotes.map(q => <article key={q.id} className="py-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-2">
          <div className="min-w-0"><p className="font-mono text-sm font-semibold">{q.quote_number}</p><p className="text-sm break-words">{q.title}</p><p className="text-xs text-muted-foreground">Valid until {q.valid_until || 'not specified'}{q.sent_at ? ` · Sent ${q.sent_at.slice(0, 10)}` : ''}</p></div>
          <div className="flex items-center gap-3"><span className="font-mono text-sm">{money(q.amount ?? q.total, q.currency)}</span><StatusPill tone={q.status === 'accepted' ? 'success' : 'neutral'}>{q.invoice_id ? 'Invoiced' : q.status}</StatusPill></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run(`pdf-${q.id}`, async () => savePdf(await quotePdf({ data: { id: q.id } })), 'Quotation PDF prepared')}><Download className="mr-1.5 h-4 w-4" />PDF</Button>
          {permissions.canQuote && !q.invoice_id && <>
            {['draft', 'sent'].includes(q.status) && <Button variant="outline" size="sm" onClick={() => setBuilder({ id: q.id })}><Pencil className="mr-1.5 h-4 w-4" />Edit</Button>}
            {!['cancelled', 'rejected', 'expired'].includes(q.status) && <Button variant="outline" size="sm" onClick={() => { setEmail(customer.primary_email || ''); setMessage(''); setSending(q); }}><Mail className="mr-1.5 h-4 w-4" />Send quotation</Button>}
            {['draft', 'sent'].includes(q.status) && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run(`accept-${q.id}`, () => accept({ data: { id: q.id, outcome: 'accepted' } }), 'Client acceptance recorded')}><Check className="mr-1.5 h-4 w-4" />Record acceptance</Button>}
            {quoteCanConvert(q) && <Button size="sm" onClick={() => { setDueDays('14'); setConversion(q); }}><FileCheck className="mr-1.5 h-4 w-4" />Convert to invoice</Button>}
          </>}
          {q.invoice_id && <Button size="sm" variant="outline" asChild><Link to="/invoices/$id" params={{ id: q.invoice_id }}><Receipt className="mr-1.5 h-4 w-4" />View invoice</Link></Button>}
        </div>
      </article>)}
    </div> : <div className="divide-y divide-border">
      {!invoices.length && <p className="py-8 text-sm text-muted-foreground">No invoices on this account.</p>}
      {invoices.map(i => <article key={i.id} className="py-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-2"><div><Link to="/invoices/$id" params={{ id: i.id }} className="font-mono text-sm font-semibold text-primary hover:underline">{i.invoice_number}</Link><p className={invoiceOverdue(i) ? "text-xs text-destructive font-semibold" : "text-xs text-muted-foreground"}>Issued {i.issue_date} · Due {i.due_date || 'not specified'}</p></div><StatusPill tone={invoiceOverdue(i) ? 'danger' : i.status === 'paid' ? 'success' : 'info'}>{invoiceOverdue(i) ? 'overdue' : i.status}</StatusPill></div>
        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3"><div>Total <strong className="font-mono">{money(i.total, i.currency)}</strong></div><div>Paid <strong className="font-mono text-success">{money(i.amount_paid, i.currency)}</strong></div><div>Outstanding <strong className="font-mono">{money(Math.max(0, Number(i.total) - Number(i.amount_paid || 0)), i.currency)}</strong></div></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run(`invoice-pdf-${i.id}`, async () => savePdf(await invoicePdf({ data: { invoice_id: i.id } })), 'Invoice PDF prepared')}><Download className="mr-1.5 h-4 w-4" />PDF</Button>
          {permissions.canQuote && !['void', 'cancelled'].includes(i.status) && <Button variant="outline" size="sm" disabled={!!busy || (i.status === 'draft' && !permissions.canRecordPayment)} onClick={() => run(`invoice-email-${i.id}`, () => sendInvoice({ data: { invoice_id: i.id } }), 'Invoice accepted by email gateway')}><Mail className="mr-1.5 h-4 w-4" />{i.status === 'draft' && !permissions.canRecordPayment ? 'Awaiting Billing issue' : 'Email invoice'}</Button>}
          {permissions.canSubmitPayment && !['void', 'cancelled', 'paid'].includes(i.status) && Number(i.total) > Number(i.amount_paid || 0) && <Button variant="outline" size="sm" onClick={() => setPaymentInvoice(i.id)}><CreditCard className="mr-1.5 h-4 w-4" />Submit payment</Button>}
        </div>
      </article>)}
    </div>}
    {builder && <QuoteBuilderDialog open onOpenChange={open => { if (!open) setBuilder(null); }} customers={[customer]} defaultCustomerId={customer.id} quoteId={builder.id} onSaved={refresh} />}
    {paymentInvoice !== undefined && <SubmitPaymentDialog open onOpenChange={open => { if (!open) setPaymentInvoice(undefined); }} customerId={customer.id} invoiceId={paymentInvoice} />}
    <Dialog open={!!sending} onOpenChange={open => { if (!open) setSending(null); }}><DialogContent><DialogHeader><DialogTitle>Send {sending?.quote_number}</DialogTitle></DialogHeader>
      <div className="space-y-3"><div><Label htmlFor="quote-recipient">Client email</Label><Input id="quote-recipient" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div><div><Label htmlFor="quote-message">Message</Label><Textarea id="quote-message" rows={4} value={message} onChange={e => setMessage(e.target.value)} /></div><p className="text-sm text-muted-foreground">{sending?.quote_number}.pdf · {money(sending?.amount, sending?.currency)}</p></div>
      <DialogFooter><Button variant="outline" onClick={() => setSending(null)}>Cancel</Button><Button disabled={!!busy || !email.trim()} onClick={() => run('send', async () => { await send({ data: { id: sending.id, email, message: message || undefined } }); setSending(null); }, 'Quotation and PDF accepted by email gateway')}><Mail className="mr-2 h-4 w-4" />{busy === 'send' ? 'Sending…' : 'Send with PDF'}</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={!!conversion} onOpenChange={open => { if (!open) setConversion(null); }}><DialogContent><DialogHeader><DialogTitle>Convert {conversion?.quote_number}</DialogTitle></DialogHeader><p className="text-sm">Agreed total: <strong>{money(conversion?.amount, conversion?.currency)}</strong></p><div><Label htmlFor="invoice-due-days">Payment terms (days)</Label><Input id="invoice-due-days" type="number" min="0" max="365" value={dueDays} onChange={e => setDueDays(e.target.value)} /></div><p className="text-sm text-muted-foreground">Draft invoice · awaiting Billing issue</p><DialogFooter><Button variant="outline" onClick={() => setConversion(null)}>Cancel</Button><Button disabled={!!busy || !dueDays || Number(dueDays) < 0 || Number(dueDays) > 365} onClick={() => run('convert', async () => { const result = await convert({ data: { id: conversion.id, due_days: Number(dueDays) } }); setConversion(null); toast.success(`${result.invoice_number} created`); }, 'Quotation linked to its invoice')}><FileCheck className="mr-2 h-4 w-4" />{busy === 'convert' ? 'Converting…' : 'Create invoice'}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}