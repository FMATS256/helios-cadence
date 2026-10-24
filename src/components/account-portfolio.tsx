import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAccountWorkspace } from "@/lib/account-workspace.functions";
import { AccountAccessPanel } from "./account-access-panel";
import { CreateQuoteDialog, CreateTicketDialog, LogCommDialog, type ClientContext } from "./client-action-dialogs";
import { RequestInvoiceDialog } from "./request-invoice-dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { DataGrid, StatusBadge, shortDate, toneForStatus } from "./enterprise";
import { Users, FileText, KeyRound, LifeBuoy, Phone, Receipt, ArrowUpRight } from "lucide-react";

export function AccountPortfolio({ noc = false }: { noc?: boolean }) {
  const get = useServerFn(getAccountWorkspace);
  const { data, isPending, error, refetch } = useQuery({ queryKey: ["account-workspace"], queryFn: () => get({ data: {} }) });
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("accounts");
  const body = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<{ ctx: ClientContext; action: string } | null>(null);
  const customers = data?.customers ?? [];
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const filtered = customers.filter((c) => `${c.company_name} ${c.account_number} ${c.primary_email || ""}`.toLowerCase().includes(search.toLowerCase()));
  const ctxFor = (c: (typeof customers)[number]): ClientContext => ({ customerId: c.id, accountNumber: c.account_number, companyName: c.company_name, primaryEmail: c.primary_email });
  const go = (c: (typeof customers)[number], action: string) => setSelected({ ctx: ctxFor(c), action });
  const open360 = (id: string, targetTab?: string) => {
    const c = customerById.get(id);
    return c ? <Button asChild size="sm" variant="link"><Link to="/customers/$accountNumber" params={{ accountNumber: c.account_number }} search={targetTab ? { tab: targetTab } : {}}>{c.company_name}<ArrowUpRight className="h-3 w-3 ml-1" /></Link></Button> : "—";
  };
  if (error) return <div className="py-4 text-sm text-destructive">{error.message}<Button variant="outline" size="sm" className="ml-3" onClick={() => refetch()}>Retry</Button></div>;
  return <section className="space-y-4">
    <div className="grid grid-cols-3 gap-3 border-b border-border pb-4">{[{ label: "Client accounts", value: customers.length, icon: Users }, { label: "Portal users", value: data?.users.length ?? 0, icon: KeyRound }, { label: "Open requests", value: data?.tickets.length ?? 0, icon: LifeBuoy }].map(({ label, value, icon: Icon }) => <div key={label}><Icon className="h-4 w-4 text-info mb-2" /><p className="text-2xl font-semibold tabular-nums">{isPending ? "—" : value}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}</div>
    <div className="flex flex-col sm:flex-row gap-3 justify-between"><Tabs value={tab} onValueChange={(v) => { if (body.current) body.current.style.minHeight = `${body.current.getBoundingClientRect().height}px`; setTab(v); }}><TabsList className="flex-wrap h-auto"><TabsTrigger value="accounts">{noc ? "Client accounts" : "My accounts"}</TabsTrigger><TabsTrigger value="requests">Client requests</TabsTrigger><TabsTrigger value="renewals">Renewals</TabsTrigger></TabsList></Tabs><Input aria-label="Search client accounts" placeholder="Account number, client or email…" className="sm:max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
    <div ref={body} className="min-h-72">
    {tab === "accounts" && <DataGrid loading={isPending} rows={filtered} empty="No assigned accounts match your search." columns={[
      { header: "Client account", cell: (c: any) => <div>{open360(c.id)}<p className="text-xs text-muted-foreground px-3">{c.account_number} · {c.account_type || "Client"}</p></div> },
      { header: "Contact", cell: (c: any) => <div className="text-xs"><p>{c.primary_email || "Not recorded"}</p><p className="text-muted-foreground">{c.primary_phone || ""}</p></div> },
      { header: "Status", cell: (c: any) => <StatusBadge tone={toneForStatus(c.status)}>{c.status}</StatusBadge> },
      { header: "Portal", cell: (c: any) => <Button size="sm" variant="outline" onClick={() => go(c, "access")}><KeyRound className="h-3.5 w-3.5 mr-2" />{data?.users.filter((u) => u.customer_id === c.id).length || 0} users</Button> },
      { header: "Actions", cell: (c: any) => <div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => go(c, "ticket")}><LifeBuoy className="h-3.5 w-3.5 mr-1" />Support</Button><Button size="sm" variant="outline" onClick={() => go(c, "comm")}><Phone className="h-3.5 w-3.5 mr-1" />Log contact</Button>{!noc && <><Button size="sm" variant="outline" onClick={() => go(c, "quote")}><FileText className="h-3.5 w-3.5 mr-1" />Quote</Button><Button size="sm" variant="outline" onClick={() => go(c, "invoice")}><Receipt className="h-3.5 w-3.5 mr-1" />Request invoice</Button></>}</div> },
    ]} />}
    {tab === "requests" && <DataGrid rows={(data?.tickets ?? []).filter((t) => filtered.some((c) => c.id === t.customer_id))} loading={isPending} empty="No open client requests." columns={[
      { header: "Request", cell: (t: any) => <Button variant="link" asChild size="sm"><Link to="/tickets/$id" params={{ id: t.id }}>{t.ticket_number}</Link></Button> }, { header: "Client", cell: (t: any) => open360(t.customer_id, "tickets") }, { header: "Subject", cell: (t: any) => t.subject }, { header: "Priority", cell: (t: any) => <StatusBadge tone={toneForStatus(t.priority)}>{t.priority}</StatusBadge> }, { header: "Status", cell: (t: any) => t.status },
    ]} />}
    {tab === "renewals" && <DataGrid rows={(data?.renewals ?? []).filter((r) => filtered.some((c) => c.id === r.customer_id))} loading={isPending} empty="No active subscriptions." columns={[
      { header: "Client", cell: (r: any) => open360(r.customer_id, "subscriptions") }, { header: "Service / plan", cell: (r: any) => r.plan_name }, { header: "Renewal", cell: (r: any) => shortDate(r.next_renewal) }, { header: "Status", cell: (r: any) => r.status },
    ]} />}
    </div>
    {selected?.action === "access" && <Dialog open onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{selected.ctx.companyName} · {selected.ctx.accountNumber}</DialogTitle></DialogHeader><AccountAccessPanel customerId={selected.ctx.customerId} /></DialogContent></Dialog>}
    {selected?.action === "quote" && <CreateQuoteDialog ctx={selected.ctx} onClose={() => setSelected(null)} />}
    {selected?.action === "ticket" && <CreateTicketDialog ctx={selected.ctx} onClose={() => setSelected(null)} />}
    {selected?.action === "comm" && <LogCommDialog ctx={selected.ctx} onClose={() => setSelected(null)} />}
    {selected?.action === "invoice" && <RequestInvoiceDialog open customerId={selected.ctx.customerId} companyName={selected.ctx.companyName} onOpenChange={(open) => { if (!open) setSelected(null); }} />}
  </section>;
}