import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { LayoutDashboard, FileText, CreditCard, Server, LifeBuoy, LogOut, ArrowUpRight, Plus, Upload, ShieldCheck, Send, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getClientAccount, getClientPortalData, submitClientPayment, createClientTicket, getClientTicket, replyClientTicket, clientAccessDirectory, linkClientLogin } from "@/lib/client-portal.functions";
import { toast } from "sonner";
import { startClientPayment, checkClientPayment } from "@/lib/client-pay.functions";
import imtLogo from "@/assets/imt-logo.png.asset.json";
import { ServiceRequestDialog, ServiceDetailDialog, type ServiceRequestMode } from "@/components/client-service-request";

const sections = [
  { title: "Overview", to: "/client", icon: LayoutDashboard },
  { title: "Invoices", to: "/client/invoices", icon: FileText },
  { title: "Payments", to: "/client/payments", icon: CreditCard },
  { title: "Services", to: "/client/services", icon: Server },
  { title: "Support", to: "/client/support", icon: LifeBuoy },
] as const;

export const portalHead = (title: string, description: string) => ({ meta: [
  { title: `${title} — IMT Client Portal` }, { name: "description", content: description },
  { property: "og:title", content: `${title} — IMT Client Portal` }, { property: "og:description", content: description },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
] });

function useAccount() {
  const { user } = useAuth();
  const fn = useServerFn(getClientAccount);
  return useQuery({ queryKey: ["client-account", user?.id], queryFn: () => fn(), enabled: !!user, retry: false });
}

export function ClientPortalLayout() {
  const { user, loading } = useAuth();
  const account = useAccount();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => {
    await queryClient.cancelQueries(); queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/client", replace: true });
  };
  return <div className="min-h-screen bg-background">
    <header className="border-b border-border bg-card">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 h-20 flex items-center justify-between gap-3">
        <Link to="/client" className="flex items-center gap-3 min-w-0"><img src={imtLogo.url} alt="IMT Solutions" className="h-11 w-11 object-contain" /><div><div className="font-display text-lg font-bold">IMT Solutions</div><div className="text-xs text-muted-foreground">Client portal</div></div></Link>
        {user ? <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-2" />Sign out</Button> : <ShieldCheck className="h-5 w-5 text-teal" />}
      </div>
    </header>
    {loading ? <p className="p-12 text-center text-muted-foreground">Checking your session…</p> : !user ? <ClientSignIn /> : <>
      <nav className="bg-card border-b border-border"><div className="max-w-6xl mx-auto px-4 sm:px-8 flex gap-1 overflow-x-auto py-2">{sections.map((s) => <Button key={s.to} asChild variant={pathname === s.to ? "secondary" : "ghost"} className={pathname === s.to ? "text-solar shrink-0" : "text-muted-foreground shrink-0"}><Link to={s.to} resetScroll={false}><s.icon className="h-4 w-4 mr-2" />{s.title}</Link></Button>)}</div></nav>
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-7 sm:py-10 min-w-0">
        {account.isPending ? <p>Loading your account…</p> : account.error ? <div className="space-y-3"><p role="alert">{account.error.message}</p><Button onClick={() => account.refetch()}>Retry</Button></div> : !account.data ? <div className="border-l-4 border-solar pl-5 py-3 space-y-3"><h1 className="text-2xl font-bold">Your client account</h1><p className="text-muted-foreground">Your sign-in is not linked to an IMT account yet. Contact your account manager to arrange access.</p><Button variant="outline" asChild><Link to="/client/access"><ShieldCheck className="h-4 w-4 mr-2" />Client access</Link></Button>{pathname === "/client/access" && <Outlet />}</div> : <><div className="flex flex-wrap items-center gap-2 mb-7 text-sm"><span className="font-medium">{account.data.company_name}</span><span className="text-muted-foreground">/</span><span className="font-mono text-muted-foreground">{account.data.account_number}</span><Badge variant="outline" className="ml-auto capitalize text-teal border-teal/30">{account.data.status}</Badge></div><Outlet /></>}
      </main>
    </>}
    <footer className="max-w-6xl mx-auto px-4 sm:px-8 py-6 border-t border-border flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>IMT Solutions · Client accounts</span><span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-teal" />Secure account access</span></footer>
  </div>;
}

function ClientSignIn() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false);
  return <main className="max-w-md mx-auto px-5 py-16 sm:py-24"><p className="text-sm font-semibold text-teal mb-3">WELCOME BACK</p><h1 className="text-3xl font-bold mb-7">Your IMT account</h1><form className="space-y-5" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; } catch { toast.error("Unable to sign in. Check your email and password."); } finally { setBusy(false); } }}><div className="space-y-2"><Label htmlFor="client-email">Email address</Label><Input id="client-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" /></div><div className="space-y-2"><Label htmlFor="client-password">Password</Label><Input id="client-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" /></div><Button className="w-full h-12" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowUpRight className="h-4 w-4 ml-2" /></Button><Button type="button" variant="link" className="px-0" onClick={async () => { if (!email) return toast.error("Enter your email address first"); const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth` }); if (error) toast.error("Reset email could not be sent"); else toast.success("Check your email for a reset link"); }}>Forgot password?</Button></form></main>;
}

const money = (amount: number, currency = "USD") => `${currency} ${Number(amount).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
function Status({ value }: { value: string }) { return <Badge variant="outline" className={`capitalize whitespace-nowrap ${["active", "paid", "approved", "resolved"].includes(value) ? "text-teal border-teal/30 bg-teal/5" : ["rejected", "overdue", "urgent"].includes(value) ? "text-destructive border-destructive/30" : "text-amber border-amber/30 bg-amber/5"}`}>{value.replaceAll("_", " ")}</Badge>; }
function Empty({ text }: { text: string }) { return <p className="py-12 text-sm text-center text-muted-foreground border-y border-border">{text}</p>; }

export function ClientPortalView({ section }: { section: "overview" | "invoices" | "payments" | "services" | "support" }) {
  const { user } = useAuth(); const account = useAccount();
  const fn = useServerFn(getClientPortalData);
  const query = useQuery({ queryKey: ["client-portal-data", user?.id], queryFn: () => fn(), enabled: !!account.data, retry: false });
  const [payment, setPayment] = useState(false); const [newTicket, setNewTicket] = useState(false); const [ticket, setTicket] = useState<any>(null);
  const [search, setSearch] = useState(""); const [payNow, setPayNow] = useState(false); const [preset, setPreset] = useState<string | undefined>();
  const [detail, setDetail] = useState<Detail | null>(null); const [mode, setMode] = useState<ServiceRequestMode>(null);
  if (query.isPending) return <p className="py-12 text-muted-foreground">Loading account activity…</p>;
  if (query.error || !query.data) return <div className="py-12 space-y-3"><p role="alert">{query.error?.message ?? "Account unavailable"}</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div>;
  const data = query.data;
  const invoices = data.invoices.filter((i) => String(i.invoice_number).toLowerCase().includes(search.toLowerCase()));
  const outstanding = new Map<string, number>();
  for (const i of data.invoices) outstanding.set(i.currency, (outstanding.get(i.currency) ?? 0) + i.balance);
  const openTickets = data.tickets.filter((t) => !["closed", "resolved"].includes(t.status));
  const title = { overview: "Account overview", invoices: "Your invoices", payments: "Payments & receipts", services: "Your services", support: "Support requests" }[section];
  return <div className="min-h-[520px] space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold text-teal uppercase mb-2">{section === "overview" ? "MY ACCOUNT" : section}</p><h1 className="text-2xl sm:text-3xl font-bold">{title}</h1></div><div className="flex flex-wrap gap-2">{section !== "support" && <Button onClick={() => setPayNow(true)}><CreditCard className="h-4 w-4 mr-2" />Pay now</Button>}<Button variant={section === "support" ? "default" : "outline"} onClick={() => section === "support" ? setNewTicket(true) : setPayment(true)}><Plus className="h-4 w-4 mr-2" />{section === "support" ? "New request" : "Submit payment proof"}</Button></div></div>
    {section === "overview" && <>
      <ManagerCard manager={data.manager} account={data.profile} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[["Starlink kits", data.starlink.length], ["Microsoft 365 seats", data.licenses.reduce((t: number, l: any) => t + (Number(l.seats) || 0), 0)], ["Hosting", data.hosting.length], ["Installed systems", data.assets.length]].map(([k, v]) => <Link key={k as string} to="/client/services" className="border border-border rounded-lg p-4 bg-card hover:border-teal"><p className="text-xs text-muted-foreground">{k}</p><p className="text-2xl font-bold mt-1">{v}</p></Link>)}</div>
      <div className="grid sm:grid-cols-3 border-y border-border divide-y sm:divide-y-0 sm:divide-x divide-border">
        <div className="py-6 sm:pr-6"><div className="text-sm text-muted-foreground mb-3">Outstanding balance</div>{outstanding.size ? [...outstanding].map(([currency, value]) => <div key={currency} className="font-display text-2xl font-bold">{money(value, currency)}</div>) : <div className="text-2xl font-bold">{money(0)}</div>}<Button variant="link" className="px-0 text-solar mt-2" asChild><Link to="/client/invoices">View invoices<ChevronRight className="h-4 w-4 ml-1" /></Link></Button></div>
        <div className="py-6 sm:px-6"><div className="text-sm text-muted-foreground mb-3">Active services</div><div className="text-3xl font-bold">{data.services.filter((s) => s.status === "active").length}</div><Button variant="link" className="px-0 text-teal mt-2" asChild><Link to="/client/services">View services<ChevronRight className="h-4 w-4 ml-1" /></Link></Button></div>
        <div className="py-6 sm:pl-6"><div className="text-sm text-muted-foreground mb-3">Open support requests</div><div className="text-3xl font-bold">{openTickets.length}</div><Button variant="link" className="px-0 text-amber mt-2" asChild><Link to="/client/support">View requests<ChevronRight className="h-4 w-4 ml-1" /></Link></Button></div>
      </div>
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-10"><section><div className="flex justify-between items-center mb-4"><h2 className="text-lg font-bold">Recent invoices</h2><Button asChild variant="ghost" size="sm"><Link to="/client/invoices">View all<ArrowUpRight className="h-4 w-4 ml-2" /></Link></Button></div><InvoiceList rows={data.invoices.slice(0, 4)} /></section><section><h2 className="text-lg font-bold mb-4">Payment verification</h2>{data.submissions.length ? data.submissions.slice(0, 4).map((p: any) => <div key={p.id} className="py-4 border-b border-border flex items-center justify-between gap-3"><div><p className="font-semibold">{money(p.amount, p.currency)}</p><p className="text-xs text-muted-foreground mt-1 break-all">{p.reference}</p></div><Status value={p.status} /></div>) : <Empty text="No payments awaiting verification." />}</section></div>
      <div className="bg-teal/5 border-l-4 border-teal px-5 py-5 flex items-center justify-between gap-4"><div><h2 className="font-semibold">Need assistance?</h2><p className="text-sm text-muted-foreground mt-1">Contact the IMT support team.</p></div><Button asChild variant="outline"><Link to="/client/support"><LifeBuoy className="h-4 w-4 mr-2" />Support</Link></Button></div>
    </>}
    {section === "invoices" && <><Input aria-label="Search invoices" placeholder="Search invoice number" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" /><InvoiceList rows={invoices} /></>}
    {section === "payments" && <><section><h2 className="font-bold text-lg mb-4">Submitted payment proof</h2>{!data.submissions.length ? <Empty text="No payment proof submitted yet." /> : data.submissions.map((p: any) => <div key={p.id} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 py-5 border-b border-border"><div><p className="font-semibold">{money(p.amount, p.currency)}</p><p className="text-xs text-muted-foreground mt-1">{date(p.payment_date)}</p></div><div className="text-sm break-all">{p.reference}{(p.review_notes || p.rejection_reason) && <p className="text-muted-foreground mt-1">{p.rejection_reason || p.review_notes}</p>}</div><div><Status value={p.status} /></div></div>)}</section><section><h2 className="font-bold text-lg mb-4">Recorded payments</h2>{!data.payments.length ? <Empty text="No recorded payments yet." /> : data.payments.map((p: any) => <div key={p.id} className="flex flex-wrap gap-4 justify-between py-4 border-b border-border"><div><p className="font-semibold">{p.receipt_number || "Payment"}</p><p className="text-sm text-muted-foreground">{date(p.paid_at)} · {p.method.replaceAll("_", " ")}</p></div><p className="font-semibold">{money(p.amount, p.currency)}</p></div>)}</section></>}
    {section === "services" && <ServiceIdentity data={data} onOpen={setDetail} onMode={setMode} />}
    <ServiceDetailDialog detail={detail} onClose={() => setDetail(null)} onUpgrade={() => { const d = detail!; setDetail(null); setMode({ type: "upgrade", category: d.category, current: d.title }); }} onSupport={() => { const d = detail!; setDetail(null); setPreset(`Support: ${d.kind} — ${d.title}`); setNewTicket(true); }} />
    <ServiceRequestDialog mode={mode} onClose={() => setMode(null)} />
    {section === "services" && <InstalledSystems rows={data.assets ?? []} onRequest={(subject) => { setPreset(subject); setNewTicket(true); }} />}
    {section === "services" && (data.services.length ? <div className="grid md:grid-cols-2 gap-4">{data.services.map((s: any) => <article key={s.id} className="border border-border bg-card rounded-lg p-6"><div className="flex items-start justify-between gap-3"><Server className="h-7 w-7 text-teal" /><Status value={s.status} /></div><h2 className="font-bold text-lg mt-5">{s.plan_name}</h2>{s.description && <p className="text-sm text-muted-foreground mt-2">{s.description}</p>}<div className="mt-6 flex justify-between gap-3 text-sm border-t border-border pt-4"><span>{money(s.amount, s.currency)} / {s.billing_cycle}</span><span className="text-muted-foreground">Renews {date(s.next_renewal)}</span></div></article>)}</div> : <Empty text="No subscribed services on this account yet." />)}
    {section === "support" && <ManagerCard manager={data.manager} account={data.profile} showProfile />}
    {section === "support" && (data.tickets.length ? <div>{data.tickets.map((t: any) => <Button key={t.id} variant="ghost" onClick={() => setTicket(t)} className="h-auto w-full justify-between rounded-none border-b border-border py-5 px-0 text-left whitespace-normal"><div className="min-w-0"><p className="text-xs text-muted-foreground mb-1">{t.ticket_number} · {date(t.created_at)}</p><p className="font-semibold break-words">{t.subject}</p></div><div className="flex items-center gap-3 ml-3"><Status value={t.status} /><ChevronRight className="h-4 w-4 shrink-0" /></div></Button>)}</div> : <Empty text="No support requests yet." />)}
    <PaymentDialog open={payment} onOpenChange={setPayment} invoices={data.invoices} />
    <PayNowDialog open={payNow} onOpenChange={setPayNow} data={data} />
    <NewTicketDialog open={newTicket} onOpenChange={(v) => { setNewTicket(v); if (!v) setPreset(undefined); }} preset={preset} />
    <TicketDialog ticket={ticket} onClose={() => setTicket(null)} />
  </div>;
}

function InvoiceList({ rows }: { rows: any[] }) {
  const [selected, setSelected] = useState<any>(null);
  return <>{!rows.length ? <Empty text="No invoices on this account." /> : rows.map((i) => <Button key={i.id} variant="ghost" onClick={() => setSelected(i)} className="w-full h-auto rounded-none border-b border-border py-5 px-0 justify-between gap-3 text-left whitespace-normal"><div><p className="font-semibold">{i.invoice_number}</p><p className="text-xs text-muted-foreground mt-1">Due {date(i.due_date)}</p></div><div className="text-right"><p className="font-semibold">{money(i.balance, i.currency)}</p><p className="text-xs text-muted-foreground mt-1">{i.balance > 0 ? "Outstanding" : "Paid"}</p></div></Button>)}<Dialog open={!!selected} onOpenChange={() => setSelected(null)}><DialogContent><DialogHeader><DialogTitle>{selected?.invoice_number}</DialogTitle></DialogHeader>{selected && <dl className="space-y-4">{[["Issued", date(selected.issue_date)], ["Due", date(selected.due_date)], ["Invoice total", money(selected.total, selected.currency)], ["Paid", money(selected.paid, selected.currency)], ["Outstanding", money(selected.balance, selected.currency)]].map(([label, value]) => <div key={label} className="flex justify-between gap-3 border-b border-border pb-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>}</DialogContent></Dialog></>;
}

function PaymentDialog({ open, onOpenChange, invoices }: { open: boolean; onOpenChange: (v: boolean) => void; invoices: any[] }) {
  const account = useAccount(); const { user } = useAuth(); const cache = useQueryClient(); const send = useServerFn(submitClientPayment);
  const [busy, setBusy] = useState(false); const [file, setFile] = useState<File | null>(null);
  const [invoice, setInvoice] = useState("none"); const [currency, setCurrency] = useState("USD"); const [method, setMethod] = useState("bank_transfer");
  const request = useRef<string | null>(null); const uploaded = useRef<string | null>(null);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Submit payment proof</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Your payment is credited after Finance verifies it.</p><form className="space-y-4" onSubmit={async (e) => {
    e.preventDefault(); if (!file || !account.data || !user) return toast.error("Attach a PDF, JPG or PNG payment proof");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size > 10485760) return toast.error("Use a PDF, JPG or PNG up to 10 MB");
    const form = new FormData(e.currentTarget); setBusy(true);
    try {
      request.current ??= crypto.randomUUID();
      if (!uploaded.current) { const path = `${account.data.id}/portal/${user.id}/${request.current}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`; const { error } = await supabase.storage.from("customer-documents").upload(path, file, { upsert: false }); if (error) throw new Error("Payment proof upload failed. Please retry."); uploaded.current = path; }
      await send({ data: { request_id: request.current, invoice_id: invoice === "none" ? null : invoice, amount: Number(form.get("amount")), currency: currency as "USD" | "ZWG" | "ZAR", method: method as "bank_transfer" | "ecocash" | "cash" | "card", payment_date: String(form.get("payment_date")), reference: String(form.get("reference")), proof: { path: uploaded.current, name: file.name, type: file.type as "application/pdf" | "image/jpeg" | "image/png", size: file.size } } });
      await cache.invalidateQueries({ queryKey: ["client-portal-data"] }); toast.success("Payment proof submitted — awaiting Finance verification"); onOpenChange(false); request.current = null; uploaded.current = null; setFile(null);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Payment could not be submitted"); } finally { setBusy(false); }
  }}><div className="space-y-2"><Label>Invoice</Label><Select value={invoice} onValueChange={(v) => { setInvoice(v); const selected = invoices.find((i) => i.id === v); if (selected) { setCurrency(selected.currency); const el = document.getElementById("payment-amount") as HTMLInputElement | null; if (el) el.value = String(selected.balance); } }}><SelectTrigger aria-label="Invoice"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Account payment</SelectItem>{invoices.filter((i) => i.balance > 0).map((i) => <SelectItem key={i.id} value={i.id}>{i.invoice_number} · {money(i.balance, i.currency)}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="payment-amount">Amount</Label><Input id="payment-amount" name="amount" type="number" min="0.01" max="10000000" step="0.01" required /></div><div className="space-y-2"><Label>Currency</Label><Select value={currency} onValueChange={setCurrency} disabled={invoice !== "none"}><SelectTrigger aria-label="Currency"><SelectValue /></SelectTrigger><SelectContent>{["USD", "ZWG", "ZAR"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div></div><div className="space-y-2"><Label>Payment method</Label><Select value={method} onValueChange={setMethod}><SelectTrigger aria-label="Payment method"><SelectValue /></SelectTrigger><SelectContent>{[["bank_transfer", "Bank transfer"], ["ecocash", "EcoCash"], ["cash", "Cash"], ["card", "Card"]].map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="payment-date">Payment date</Label><Input id="payment-date" type="date" name="payment_date" required defaultValue={new Date().toISOString().slice(0, 10)} /></div><div className="space-y-2"><Label htmlFor="payment-reference">Transaction reference</Label><Input id="payment-reference" name="reference" required maxLength={200} /></div><label className="block border border-dashed border-teal/40 bg-teal/5 rounded-md p-4 cursor-pointer"><span className="flex gap-2 items-center text-sm font-medium"><Upload className="h-4 w-4 text-teal" />{file ? file.name : "Attach payment proof"}</span><span className="block text-xs text-muted-foreground mt-2">PDF, JPG or PNG · up to 10 MB</span><input aria-label="Payment proof" type="file" accept="application/pdf,image/jpeg,image/png" className="block w-full mt-3 text-xs" disabled={busy || !!uploaded.current} onChange={(e) => { setFile(e.target.files?.[0] ?? null); request.current = null; }} /></label><Button type="submit" className="w-full" disabled={busy}><Upload className="h-4 w-4 mr-2" />{busy ? "Submitting…" : "Submit for verification"}</Button></form></DialogContent></Dialog>;
}

function NewTicketDialog({ open, onOpenChange, preset }: { open: boolean; onOpenChange: (v: boolean) => void; preset?: string }) {
  const send = useServerFn(createClientTicket); const cache = useQueryClient(); const [busy, setBusy] = useState(false); const [priority, setPriority] = useState("normal");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>New support request</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); try { const result = await send({ data: { subject: String(form.get("subject")), description: String(form.get("description")), priority: priority as "normal" | "high" | "urgent" } }); await cache.invalidateQueries({ queryKey: ["client-portal-data"] }); toast.success(`Request ${result.ticket_number} submitted`); onOpenChange(false); } catch (err) { toast.error(err instanceof Error ? err.message : "Request could not be submitted"); } finally { setBusy(false); } }}><div className="space-y-2"><Label htmlFor="support-subject">Subject</Label><Input key={preset ?? "blank"} defaultValue={preset} id="support-subject" name="subject" minLength={3} maxLength={200} required /></div><div className="space-y-2"><Label htmlFor="support-description">Details</Label><Textarea id="support-description" name="description" rows={5} minLength={5} maxLength={10000} required /></div><Select value={priority} onValueChange={setPriority}><SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger><SelectContent>{["normal", "high", "urgent"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select><Button type="submit" disabled={busy} className="w-full"><Send className="h-4 w-4 mr-2" />{busy ? "Submitting…" : "Submit request"}</Button></form></DialogContent></Dialog>;
}

function TicketDialog({ ticket, onClose }: { ticket: any; onClose: () => void }) {
  const { user } = useAuth(); const get = useServerFn(getClientTicket); const send = useServerFn(replyClientTicket); const cache = useQueryClient(); const [body, setBody] = useState(""); const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ["client-ticket", user?.id, ticket?.id], queryFn: () => get({ data: { id: ticket.id } }), enabled: !!ticket, retry: false });
  return <Dialog open={!!ticket} onOpenChange={onClose}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{ticket?.ticket_number} · {ticket?.subject}</DialogTitle></DialogHeader><p className="text-sm whitespace-pre-wrap">{ticket?.description}</p>{query.isPending ? <p>Loading replies…</p> : query.error ? <p role="alert">{query.error.message}</p> : query.data?.map((m) => <div key={m.id} className="border-l-2 border-teal pl-3 py-2"><p className="text-xs text-muted-foreground mb-1">{m.author_id === user?.id ? "You" : "IMT Support"} · {date(m.created_at)}</p><p className="text-sm whitespace-pre-wrap">{m.body}</p></div>)}<form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await send({ data: { id: ticket.id, body } }); setBody(""); await cache.invalidateQueries({ queryKey: ["client-ticket"] }); } catch (err) { toast.error(err instanceof Error ? err.message : "Reply could not be sent"); } finally { setBusy(false); } }}><Textarea aria-label="Your reply" placeholder="Your reply" required value={body} onChange={(e) => setBody(e.target.value)} /><Button disabled={busy}><Send className="h-4 w-4 mr-2" />{busy ? "Sending…" : "Send reply"}</Button></form></DialogContent></Dialog>;
}

export function ClientAccessView() {
  const fn = useServerFn(clientAccessDirectory); const link = useServerFn(linkClientLogin); const cache = useQueryClient();
  const query = useQuery({ queryKey: ["client-access"], queryFn: () => fn(), retry: false }); const [userId, setUserId] = useState(""); const [customerId, setCustomerId] = useState(""); const [busy, setBusy] = useState(false);
  if (query.isPending) return <p>Checking administrator access…</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (!query.data) return <p className="text-muted-foreground">Only your IMT administrator can manage client sign-in access.</p>;
  return <section className="space-y-5 mt-6"><div className="flex items-center gap-3"><Button asChild variant="ghost" size="icon"><Link to="/"><ArrowLeft className="h-4 w-4" /><span className="sr-only">Staff dashboard</span></Link></Button><h1 className="text-2xl font-bold">Client access</h1></div><div className="grid sm:grid-cols-2 gap-4"><Select value={userId} onValueChange={setUserId}><SelectTrigger aria-label="Client sign-in"><SelectValue placeholder="Select an existing sign-in" /></SelectTrigger><SelectContent>{query.data.users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email} · {u.email}</SelectItem>)}</SelectContent></Select><Select value={customerId} onValueChange={setCustomerId}><SelectTrigger aria-label="Client account"><SelectValue placeholder="Select client account" /></SelectTrigger><SelectContent><SelectItem value="unlink">Remove account link</SelectItem>{query.data.customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent></Select></div><Button disabled={!userId || !customerId || busy} onClick={async () => { setBusy(true); try { await link({ data: { user_id: userId, customer_id: customerId === "unlink" ? null : customerId } }); await cache.invalidateQueries({ queryKey: ["client-access"] }); await cache.invalidateQueries({ queryKey: ["client-account"] }); toast.success("Client access updated"); } catch (err) { toast.error(err instanceof Error ? err.message : "Unable to update access"); } finally { setBusy(false); } }}><ShieldCheck className="h-4 w-4 mr-2" />{busy ? "Saving…" : "Save account link"}</Button><h2 className="font-semibold">Linked sign-ins</h2>{query.data.users.filter((u) => u.customer_id).map((u) => <div key={u.id} className="border-b border-border py-3 text-sm"><p className="font-semibold">{u.full_name} · {u.email}</p><p className="text-muted-foreground">{query.data?.customers.find((c) => c.id === u.customer_id)?.account_number}</p></div>)}</section>;
}
function InstalledSystems({ rows, onRequest }: { rows: any[]; onRequest: (subject: string) => void }) {
  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Installed equipment &amp; security systems</h2><Button variant="outline" size="sm" onClick={() => onRequest("Quotation request: add or upgrade equipment")}><Plus className="h-4 w-4 mr-2" />Request quotation</Button></div>
    {!rows.length ? <Empty text="No installed equipment recorded on this account yet." /> : <div className="grid md:grid-cols-2 gap-4">{rows.map((a) => {
      const label = [a.make, a.model].filter(Boolean).join(" ") || a.asset_type;
      const warrantyOk = a.warranty_expires && new Date(a.warranty_expires) >= new Date();
      return <article key={a.id} className="border border-border bg-card rounded-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase text-teal">{a.asset_type}</p><h3 className="font-bold text-lg mt-1 break-words">{label}</h3>{(a.site_name || a.location) && <p className="text-sm text-muted-foreground mt-1">{[a.site_name, a.location].filter(Boolean).join(" · ")}</p>}</div><Status value={a.status === "in_service" ? "active" : a.status} /></div>
        <dl className="grid grid-cols-2 gap-3 text-sm border-t border-border pt-4">
          {a.camera_count != null && <div><dt className="text-muted-foreground text-xs">Cameras</dt><dd className="font-semibold">{a.camera_count}{a.channel_capacity ? ` of ${a.channel_capacity} channels` : ""}</dd></div>}
          {a.storage_capacity && <div><dt className="text-muted-foreground text-xs">Recording storage</dt><dd className="font-semibold">{a.storage_capacity}</dd></div>}
          {a.serial_number && <div><dt className="text-muted-foreground text-xs">Serial</dt><dd className="font-mono text-xs break-all">{a.serial_number}</dd></div>}
          {a.installed_on && <div><dt className="text-muted-foreground text-xs">Installed</dt><dd>{date(a.installed_on)}</dd></div>}
          <div><dt className="text-muted-foreground text-xs">Warranty</dt><dd className={warrantyOk ? "text-teal font-semibold" : "text-muted-foreground"}>{a.warranty_expires ? `${warrantyOk ? "Until" : "Expired"} ${date(a.warranty_expires)}` : "—"}</dd></div>
          {a.next_maintenance && <div><dt className="text-muted-foreground text-xs">Next maintenance</dt><dd>{date(a.next_maintenance)}</dd></div>}
        </dl>
        <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => onRequest(`Service call-out: ${label}${a.site_name ? ` (${a.site_name})` : ""}`)}><LifeBuoy className="h-4 w-4 mr-2" />Request service</Button><Button size="sm" variant="outline" onClick={() => onRequest(`Footage assistance: ${label}`)}>Footage help</Button></div>
      </article>; })}</div>}
  </section>;
}

function ManagerCard({ manager, account, showProfile }: { manager: any; account: any; showProfile?: boolean }) {
  return <div className="grid md:grid-cols-2 gap-4">
    <section className="border border-border rounded-lg p-5 bg-card"><p className="text-xs font-semibold uppercase text-teal">Your account manager</p>{manager ? <><h2 className="font-bold text-lg mt-2">{manager.full_name}</h2><div className="flex flex-wrap gap-2 mt-4">{manager.email && <Button size="sm" asChild><a href={`mailto:${manager.email}`}>Email</a></Button>}{manager.phone && <Button size="sm" variant="outline" asChild><a href={`tel:${manager.phone}`}>Call {manager.phone}</a></Button>}</div></> : <p className="text-sm text-muted-foreground mt-2">An account manager will be assigned shortly.</p>}</section>
    {showProfile && account && <section className="border border-border rounded-lg p-5 bg-card"><p className="text-xs font-semibold uppercase text-teal">Company profile</p><h2 className="font-bold text-lg mt-2">{account.company_name}</h2><p className="text-sm text-muted-foreground font-mono">{account.account_number}</p><dl className="text-sm mt-3 space-y-1"><div>{account.primary_email || "—"}</div><div>{account.primary_phone || "—"}</div>{account.billing_address && <div className="text-muted-foreground">{account.billing_address}</div>}</dl></section>}
  </div>;
}

type Detail = { kind: string; title: string; status: string; rows: Array<[string, any]>; category?: string };
function ServiceIdentity({ data, onOpen, onMode }: { data: any; onOpen: (d: Detail) => void; onMode: (m: ServiceRequestMode) => void }) {
  const Card = (d: Detail) => <button type="button" onClick={() => onOpen(d)} className="text-left border border-border bg-card rounded-lg p-5 space-y-4 hover:border-primary/50 transition-colors"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase text-teal">{d.kind}</p><h3 className="font-bold text-lg mt-1 break-words">{d.title}</h3></div><Status value={d.status || "active"} /></div><dl className="grid grid-cols-2 gap-3 text-sm border-t border-border pt-4">{d.rows.slice(0, 4).filter(([, v]) => v != null && v !== "").map(([k, v]) => <div key={k}><dt className="text-muted-foreground text-xs">{k}</dt><dd className="font-semibold break-words">{v}</dd></div>)}</dl><span className="flex items-center text-sm text-primary font-medium">View details & upgrade<ChevronRight className="h-4 w-4 ml-1" /></span></button>;
  const none = !data.starlink.length && !data.licenses.length && !data.hosting.length && !data.storage.length;
  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">My services</h2><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => onMode({ type: "add" })}><Plus className="h-4 w-4 mr-2" />Add service</Button><Button size="sm" variant="outline" onClick={() => onMode({ type: "quote" })}>Request quotation</Button></div></div>
    {none ? <Empty text="No Starlink, Microsoft 365, hosting or storage services recorded yet." /> : <div className="grid md:grid-cols-2 gap-4">
      {data.starlink.map((s: any) => <Card key={s.id} kind="Starlink" category="connectivity" title={s.plan_type ? `Starlink ${s.plan_type}` : "Starlink service"} status={s.status} rows={[["Kit number", s.kit_serial], ["Package", s.plan_type], ["Starlink account", s.starlink_account_number], ["Site", s.service_address], ["Monthly rate", s.monthly_price != null ? money(s.monthly_price) : null]]} />)}
      {data.licenses.map((l: any) => <Card key={l.id} kind={l.vendor || l.category || "Licence"} category={l.category || "m365"} title={l.product} status={l.status} rows={[["Package", l.product], ["Users", l.assigned_seats != null ? `${l.assigned_seats} of ${l.seats} assigned` : l.seats], ["Renews", date(l.expiry_date)], ["Auto-renew", l.auto_renew ? "Yes" : "No"], ["Vendor", l.vendor]]} />)}
      {data.hosting.map((h: any) => <Card key={h.id} kind="Web hosting & email" category="hosting" title={h.domain} status={h.status} rows={[["Plan", h.plan], ["Storage", h.disk_quota_gb ? `${h.disk_quota_gb} GB` : null], ["Mailboxes", h.email_accounts], ["Renews", date(h.renewal_date)], ["Domain", h.domain]]} />)}
      {data.storage.map((c: any) => <Card key={c.id} kind="Cloud storage" category="cloud-storage" title={c.name} status={c.status} rows={[["Provider", c.provider], ["Capacity", c.storage_tb ? `${c.used_tb ?? 0} of ${c.storage_tb} TB used` : null], ["Renews", date(c.renewal_date)]]} />)}
    </div>}
  </section>;
}

function PayNowDialog({ open, onOpenChange, data }: { open: boolean; onOpenChange: (v: boolean) => void; data: any }) {
  const start = useServerFn(startClientPayment); const check = useServerFn(checkClientPayment); const cache = useQueryClient();
  const services: Array<{ key: string; label: string; amount: number }> = [
    ...data.services.filter((s: any) => s.status === "active").map((s: any) => ({ key: `sub-${s.id}`, label: `${s.plan_name} renewal`, amount: Number(s.amount) || 0 })),
    ...data.starlink.map((s: any) => ({ key: `sl-${s.id}`, label: `Starlink ${s.plan_type ?? ""} · kit ${s.kit_serial ?? ""}`.trim(), amount: Number(s.monthly_price) || 0 })),
    ...data.licenses.map((l: any) => ({ key: `li-${l.id}`, label: `${l.product} renewal`, amount: 0 })),
    ...data.hosting.map((h: any) => ({ key: `wh-${h.id}`, label: `Hosting ${h.domain} renewal`, amount: 0 })),
  ];
  const [invoice, setInvoice] = useState("none"); const [picked, setPicked] = useState<string[]>([]);
  const [amount, setAmount] = useState(""); const [currency, setCurrency] = useState<"USD" | "ZWG">("USD");
  const [method, setMethod] = useState<"ECOCASH" | "OMARI" | "INNBUCKS">("ECOCASH"); const [phone, setPhone] = useState("");
  const [state, setState] = useState<{ ref: string; status: string } | null>(null); const [busy, setBusy] = useState(false);
  const totalFor = (inv: string, keys: string[]) => (Number(data.invoices.find((i: any) => i.id === inv)?.balance) || 0) + services.filter((s) => keys.includes(s.key)).reduce((t, s) => t + s.amount, 0);
  const recalc = (inv: string, keys: string[]) => { const t = totalFor(inv, keys); setAmount(t > 0 ? t.toFixed(2) : ""); };
  const locked = totalFor(invoice, picked) > 0;
  const toggle = (k: string) => { const next = picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k]; setPicked(next); recalc(invoice, next); };
  const poll = async (ref: string) => {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      try { const r = await check({ data: { reference: ref } }); setState({ ref, status: r.status }); if (["SUCCESS", "FAILED", "CANCELLED"].includes(r.status)) { if (r.status === "SUCCESS") { toast.success("Payment received — Finance will confirm it shortly"); cache.invalidateQueries({ queryKey: ["client-portal-data"] }); } return; } } catch { /* keep polling */ }
    }
  };
  const close = (v: boolean) => { if (!v) { setState(null); setPicked([]); setAmount(""); setInvoice("none"); } onOpenChange(v); };
  return <Dialog open={open} onOpenChange={close}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Pay now</DialogTitle></DialogHeader>
    {state ? <div className="space-y-4 py-2"><p className="text-sm text-muted-foreground">Reference <span className="font-mono">{state.ref}</span></p>
      {state.status === "SUCCESS" ? <p className="font-semibold text-teal">Payment successful. Finance will approve it and your receipt will appear under Payments.</p> : ["FAILED", "CANCELLED"].includes(state.status) ? <p className="font-semibold text-destructive">Payment {state.status.toLowerCase()}. No money was taken.</p> : <p className="font-semibold">{method === "INNBUCKS" ? "Complete the payment in your InnBucks app." : "Approve the payment prompt on your phone…"}</p>}
      <Button variant="outline" className="w-full" onClick={() => close(false)}>Close</Button></div>
    : <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); const value = Number(amount); if (!(value > 0)) return toast.error("Enter the amount to pay");
      const inv = data.invoices.find((i: any) => i.id === invoice);
      const items = [...(inv ? [`Invoice ${inv.invoice_number}`] : []), ...services.filter((s) => picked.includes(s.key)).map((s) => s.label)];
      if (!items.length) return toast.error("Choose an invoice or the services you are paying for");
      setBusy(true);
      try { const r = await start({ data: { amount: value, currency, method, phone: method === "INNBUCKS" ? undefined : phone.replace(/\s/g, ""), invoice_id: inv ? inv.id : null, items } }); setState({ ref: r.reference, status: r.status }); void poll(r.reference); }
      catch (err) { toast.error(err instanceof Error ? err.message : "Payment could not be started"); } finally { setBusy(false); }
    }}>
      <div className="space-y-2"><Label>Invoice</Label><Select value={invoice} onValueChange={(v) => { setInvoice(v); recalc(v, picked); const i = data.invoices.find((x: any) => x.id === v); if (i && (i.currency === "USD" || i.currency === "ZWG")) setCurrency(i.currency); }}><SelectTrigger aria-label="Invoice"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No invoice — pay for services</SelectItem>{data.invoices.filter((i: any) => i.balance > 0).map((i: any) => <SelectItem key={i.id} value={i.id}>{i.invoice_number} · {money(i.balance, i.currency)}</SelectItem>)}</SelectContent></Select></div>
      {services.length > 0 && <fieldset className="space-y-2"><legend className="text-sm font-medium mb-1">Services paid for / renewed</legend>{services.map((s) => <label key={s.key} className="flex items-center justify-between gap-3 text-sm border border-border rounded-md px-3 py-2"><span className="flex items-center gap-2"><input type="checkbox" checked={picked.includes(s.key)} onChange={() => toggle(s.key)} />{s.label}</span>{s.amount > 0 && <span className="text-muted-foreground">{money(s.amount)}</span>}</label>)}</fieldset>}
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="pay-amount">{locked ? "Total to pay" : "Amount"}</Label><Input id="pay-amount" type="number" step="0.01" min="0.01" value={amount} readOnly={locked} className={locked ? "font-semibold bg-muted" : ""} onChange={(e) => setAmount(e.target.value)} required />{locked && <p className="text-xs text-muted-foreground">Calculated from your selection</p>}</div><div className="space-y-2"><Label>Currency</Label><Select value={currency} onValueChange={(v) => setCurrency(v as "USD" | "ZWG")}><SelectTrigger aria-label="Currency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="ZWG">ZWG</SelectItem></SelectContent></Select></div></div>
      <MethodPicker value={method} onChange={setMethod} />
      {method !== "INNBUCKS" && <div className="space-y-2"><Label htmlFor="pay-phone">{method === "ECOCASH" ? "EcoCash" : "O'mari"} Phone Number</Label><Input id="pay-phone" className="h-12 text-base" inputMode="tel" placeholder="Type your number, e.g. 0771234567" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>}
      <p className="text-xs text-muted-foreground">For bank transfers, use Submit payment proof.</p>
      <Button type="submit" disabled={busy} className="w-full">{busy ? "Starting…" : "Pay"}</Button>
    </form>}
  </DialogContent></Dialog>;
}

const METHODS = [
  { id: "ECOCASH", name: "EcoCash", hint: "PIN prompt on your phone — no redirect" },
  { id: "OMARI", name: "O'mari", hint: "Approve in your O'mari wallet — no redirect" },
  { id: "INNBUCKS", name: "InnBucks", hint: "Pay with the InnBucks app code" },
  { id: "CARD", name: "Visa / Mastercard", hint: "Secure Pesepay checkout page — coming soon" },
] as const;

function MethodLogo({ id }: { id: string }) {
  if (id === "ECOCASH") return <span className="font-display text-2xl font-bold tracking-tight"><span className="text-brand-ecocash-blue">Eco</span><span className="text-brand-ecocash-red">Cash</span></span>;
  if (id === "OMARI") return <span className="font-display text-3xl font-bold tracking-tight text-brand-omari">omari</span>;
  if (id === "INNBUCKS") return <span className="grid grid-cols-2 gap-1" aria-hidden>{["bg-brand-innbucks-yellow", "bg-brand-innbucks-purple", "bg-brand-innbucks-green", "bg-brand-innbucks-red"].map((c) => <span key={c} className={`h-6 w-6 rounded-full ${c}`} />)}</span>;
  return <span className="flex items-center gap-2"><span className="font-display text-xl font-black italic text-brand-visa">VISA</span><span className="relative flex" aria-hidden><span className="h-7 w-7 rounded-full bg-brand-mc-red" /><span className="-ml-3 h-7 w-7 rounded-full bg-brand-mc-orange mix-blend-multiply" /></span></span>;
}

function MethodPicker({ value, onChange }: { value: string; onChange: (v: "ECOCASH" | "OMARI" | "INNBUCKS") => void }) {
  return <fieldset className="space-y-3"><legend className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-3">Choose how to pay</legend>
    {METHODS.map((m) => { const active = value === m.id; const disabled = m.id === "CARD";
      return <button key={m.id} type="button" role="radio" aria-checked={active} disabled={disabled} onClick={() => !disabled && onChange(m.id as "ECOCASH" | "OMARI" | "INNBUCKS")}
        className={`w-full flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}>
        <span className="w-24 shrink-0 flex justify-center"><MethodLogo id={m.id} /></span>
        <span className="flex-1 min-w-0"><span className="block font-semibold">{m.name}</span><span className="block text-sm text-muted-foreground">{m.hint}</span></span>
        <span className={`h-7 w-7 shrink-0 rounded-full border-2 flex items-center justify-center ${active ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{active && <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3.5 8.5l3 3 6-7" /></svg>}</span>
      </button>; })}
  </fieldset>;
}
