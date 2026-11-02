import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { syncVoipAccount, recordVoipRecharge } from "@/lib/voip.functions";
import { checkStarlinkAccount } from "@/lib/starlink.functions";
import { powerProviderServer, refreshProviderServer, getServerConsoleUrl } from "@/lib/providers.functions";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { DetailCard, StatusBadge, toneForStatus, shortDate } from "@/components/enterprise";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Phone, Satellite, Server, HardDrive, Globe, Package, KeyRound, LifeBuoy, Truck, Activity, ExternalLink, Loader2, Copy } from "lucide-react";
import { deskClient, deskMailboxes, deskMailboxAction, deskEmailHealth, deskOpenTicket } from "@/lib/support-desk.functions";
import { splitByPackage } from "@/lib/package-billing";
import { hostingSsoLink, hostingLifecycleAction, storageLifecycleAction } from "@/lib/hosting.functions";

const listeners = new Set<(id: string) => void>();
/** Open the client support panel from anywhere (global search, tickets, dashboards). */
export function openClientDesk(customerId: string) { listeners.forEach((l) => l(customerId)); }

/** Opening a client from anywhere now navigates to their full Customer 360 page (Service desk tab). */
export function ClientDeskSheet() {
  const navigate = useNavigate();
  useEffect(() => {
    const l = async (x: string) => {
      const { data } = await supabase.from("customers").select("account_number").eq("id", x).maybeSingle();
      if (data?.account_number) navigate({ to: "/customers/$accountNumber", params: { accountNumber: data.account_number }, search: { tab: "desk" } as any });
      else toast.error("Client not found");
    };
    listeners.add(l); return () => { listeners.delete(l); };
  }, [navigate]);
  return null;
}

/** Inline per-service support workspace used inside Customer 360. */
export function ClientServiceDesk({ customerId }: { customerId: string }) {
  const fnClient = useServerFn(deskClient);
  const client = useQuery({ queryKey: ["desk_client", customerId], queryFn: () => fnClient({ data: { id: customerId } }) });
  if (client.isLoading) return <p className="text-sm text-muted-foreground">Loading services…</p>;
  if (client.error) return <p className="text-sm text-destructive">{(client.error as Error).message}</p>;
  return client.data ? <ClientDesk d={client.data} /> : null;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 last:border-0">{children}</div>;
}

function ClientDesk({ d }: { d: any }) {
  const c = d.customer;
  const [ticket, setTicket] = useState<null | { onsite: boolean; subject: string }>(null);
  const [view, setView] = useState("all");
  const show = (k: string) => view === "all" || view === k;
  const svcTabs: [string, string, number][] = [
    ["all", "All services", -1], ["hosting", "Email & hosting", d.hosting.length], ["voip", "VoIP", d.voip.length],
    ["starlink", "Starlink", d.starlink.length], ["servers", "Servers", d.servers.length], ["storage", "Storage", d.storage.length],
    ["licences", "Microsoft 365 & licences", d.licenses.length + d.subscriptions.length], ["equipment", "Equipment", d.assets.length], ["tickets", "Tickets", d.tickets.length], ["billing", "Billing & portal", -1],
  ];
  const counts = [
    ["Hosting & email", d.hosting.length], ["VoIP", d.voip.length], ["Starlink", d.starlink.length], ["Servers", d.servers.length],
    ["Storage", d.storage.length], ["Licences", d.licenses.length], ["Equipment", d.assets.length], ["Open tickets", d.tickets.filter((t: any) => !["resolved", "closed"].includes(t.status)).length],
  ];
  return (
    <div className="space-y-4">
      <div className="border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{c.company_name}</h2>
            <p className="text-sm text-muted-foreground">{c.account_number} · {c.primary_phone ?? "no phone"} · {c.primary_email ?? "no email"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge tone={toneForStatus(c.status)}>{c.status}</StatusBadge>
              <StatusBadge tone={d.standing === "Good standing" ? "success" : "warning"}>{d.standing}</StatusBadge>
              {d.manager && <span className="text-xs text-muted-foreground">Account manager: {d.manager.full_name} {d.manager.phone ? `· ${d.manager.phone}` : ""}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setTicket({ onsite: false, subject: "" })}><LifeBuoy className="h-4 w-4 mr-1.5" />Log call / ticket</Button>
            <Button size="sm" variant="outline" onClick={() => setTicket({ onsite: true, subject: "On-site support visit" })}><Truck className="h-4 w-4 mr-1.5" />Send technician</Button>
            <Link to="/reset-password"><Button size="sm" variant="outline"><KeyRound className="h-4 w-4 mr-1.5" />Portal password</Button></Link>
            <Link to="/customers/$accountNumber" params={{ accountNumber: c.account_number }}><Button size="sm" variant="outline">Customer 360</Button></Link>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {counts.map(([l, v]) => <div key={l as string} className="border p-2"><p className="text-[11px] text-muted-foreground">{l}</p><p className="text-lg font-semibold">{v}</p></div>)}
        </div>
        {d.contacts.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">Contacts: {d.contacts.map((x: any) => `${x.name}${x.phone ? ` (${x.phone})` : ""}`).join(" · ")}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 border bg-card p-1.5" role="tablist">
        {svcTabs.filter(([, , n]) => n !== 0).map(([k, l, n]) => (
          <Button key={k} size="sm" role="tab" aria-selected={view === k} variant={view === k ? "default" : "ghost"} onClick={() => setView(k)}>{l}{n > 0 ? ` (${n})` : ""}</Button>
        ))}
      </div>

      <BillingPanel customerId={c.id} full={view === "billing"} />

      {show("hosting") && d.hosting.map((h: any) => <HostingCard key={h.id} h={h} />)}

      {show("voip") && d.voip.length > 0 && (
        <DetailCard title="VoIP lines" padded={false}>
          {d.voip.map((v: any) => (
            <Row key={v.id}>
              <span className="flex items-center gap-2"><Phone className="h-4 w-4" /><span className="font-medium">{v.voip_number}</span><span className="text-xs text-muted-foreground">SIP {v.sip_username ?? "—"} · {v.extensions ?? 0} ext · balance ${Number(v.balance_usd ?? 0).toFixed(2)}</span></span>
              <span className="flex gap-2"><StatusBadge tone={toneForStatus(v.status)}>{v.status}</StatusBadge><VoipActions v={v} /></span>
            </Row>
          ))}
        </DetailCard>
      )}

      {show("starlink") && d.starlink.length > 0 && (
        <DetailCard title="Starlink" padded={false}>
          {d.starlink.map((s: any) => (
            <Row key={s.id}>
              <span className="flex items-center gap-2"><Satellite className="h-4 w-4" /><span className="font-medium">{s.kit_serial ?? s.starlink_account_number}</span><span className="text-xs text-muted-foreground">{s.plan_type ?? "—"} · {s.service_address ?? ""} · checked {shortDate(s.last_checked_at)}</span></span>
              <span className="flex gap-2"><StatusBadge tone={toneForStatus(s.status)}>{s.status}</StatusBadge><Act label="Check status" fn={checkStarlinkAccount} data={{ id: s.id }} /></span>
            </Row>
          ))}
        </DetailCard>
      )}

      {show("servers") && d.servers.length > 0 && (
        <DetailCard title="Servers" padded={false}>
          {d.servers.map((s: any) => (
            <Row key={s.id}>
              <span className="flex items-center gap-2"><Server className="h-4 w-4" /><span className="font-medium">{s.name}</span><span className="text-xs text-muted-foreground">{s.provider} · {(s.public_ips ?? []).join?.(", ") || "no IP"} · {s.cpu_cores ?? "?"} vCPU / {s.ram_mb ? Math.round(s.ram_mb / 1024) : "?"} GB</span></span>
              <span className="flex gap-2"><StatusBadge tone={toneForStatus(s.power_state ?? s.status)}>{s.power_state ?? s.status}</StatusBadge><Act label="Refresh" fn={refreshProviderServer} data={{ server_id: s.id }} /><Act label="Reboot" confirm fn={powerProviderServer} data={{ server_id: s.id, action: "reboot" }} />{s.power_state === "stopped" || s.power_state === "off" ? <Act label="Power on" fn={powerProviderServer} data={{ server_id: s.id, action: "on" }} /> : <Act label="Power off" confirm fn={powerProviderServer} data={{ server_id: s.id, action: "off" }} />}<ConsoleButton serverId={s.id} /></span>
            </Row>
          ))}
        </DetailCard>
      )}

      {show("storage") && d.storage.length > 0 && (
        <DetailCard title="Cloud storage" padded={false}>
          {d.storage.map((s: any) => (
            <Row key={s.id}>
              <span className="flex items-center gap-2"><HardDrive className="h-4 w-4" /><span className="font-medium">{s.name}</span><span className="text-xs text-muted-foreground">{Number(s.used_tb ?? 0).toFixed(2)} / {s.storage_tb} TB used · last backup {shortDate(s.last_backup_at)}</span></span>
              <span className="flex gap-2"><StatusBadge tone={toneForStatus(s.status)}>{s.status}</StatusBadge><StorageActions s={s} /></span>
            </Row>
          ))}
        </DetailCard>
      )}

      {show("licences") && (d.licenses.length > 0 || d.subscriptions.length > 0) && (
        <DetailCard title="Licences & subscriptions (e.g. Microsoft 365)" padded={false}>
          {d.licenses.map((l: any) => (
            <Row key={l.id}><span className="flex items-center gap-2"><Package className="h-4 w-4" /><span className="font-medium">{l.product}</span><span className="text-xs text-muted-foreground">{l.vendor ?? ""} · {l.assigned_seats ?? 0}/{l.seats ?? 0} seats · expires {shortDate(l.expiry_date)}</span></span><span className="flex gap-2"><StatusBadge tone={toneForStatus(l.status)}>{l.status}</StatusBadge><SeatEditor l={l} /></span></Row>
          ))}
          {d.subscriptions.map((s: any) => (
            <Row key={s.id}><span className="flex items-center gap-2"><Package className="h-4 w-4" /><span className="font-medium">{s.plan_name}</span><span className="text-xs text-muted-foreground">{s.currency} {s.amount} / {s.billing_cycle} · renews {shortDate(s.next_renewal)}</span></span><StatusBadge tone={toneForStatus(s.status)}>{s.status}</StatusBadge></Row>
          ))}
        </DetailCard>
      )}

      {show("equipment") && d.assets.length > 0 && (
        <DetailCard title="On-site equipment (routers, CCTV, switches…)" padded={false}>
          {d.assets.map((a: any) => (
            <Row key={a.id}>
              <span className="text-sm"><span className="font-medium">{a.make} {a.model}</span> <span className="text-xs text-muted-foreground">{a.asset_type} · S/N {a.serial_number ?? "—"} · {a.site_name ?? a.location ?? ""} · warranty {shortDate(a.warranty_expires)}</span></span>
              <span className="flex gap-2"><StatusBadge tone={toneForStatus(a.status)}>{a.status}</StatusBadge><Button size="sm" variant="outline" onClick={() => setTicket({ onsite: true, subject: `On-site: ${a.make ?? ""} ${a.model ?? ""} (${a.serial_number ?? "no S/N"})` })}>Send technician</Button></span>
            </Row>
          ))}
        </DetailCard>
      )}

      {show("tickets") && <DetailCard title="Recent tickets" padded={false}>
        {d.tickets.length === 0 && <p className="p-3 text-sm text-muted-foreground">No tickets for this client.</p>}
        {d.tickets.map((t: any) => (
          <Row key={t.id}>
            <Link to="/tickets/$id" params={{ id: t.id }} className="text-sm"><span className="font-medium">{t.ticket_number}</span> {t.subject}</Link>
            <span className="flex gap-2"><StatusBadge tone={toneForStatus(t.priority)}>{t.priority}</StatusBadge><TicketStatus t={t} /></span>
          </Row>
        ))}
      </DetailCard>}

      {ticket && <TicketDialog customerId={c.id} init={ticket} onClose={() => setTicket(null)} />}
    </div>
  );
}

function HostingCard({ h }: { h: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const [newBox, setNewBox] = useState({ user: "", quota: "1024" });
  const fnList = useServerFn(deskMailboxes);
  const fnAct = useServerFn(deskMailboxAction);
  const fnHealth = useServerFn(deskEmailHealth);
  const fnSso = useServerFn(hostingSsoLink);
  const fnLife = useServerFn(hostingLifecycleAction);
  const connected = h.provisioning_status === "whm" && !!h.username;
  const boxes = useQuery({ queryKey: ["desk_mail", h.id], queryFn: () => fnList({ data: { hostingId: h.id } }), enabled: open && connected, retry: false });
  const health = useMutation({ mutationFn: () => fnHealth({ data: { domain: h.domain } }) });
  const act = useMutation({
    mutationFn: (v: { email: string; action: any; quotaMb?: number }) => fnAct({ data: { hostingId: h.id, ...v } }),
    onSuccess: (r, v) => {
      if (r.password) setSecret({ email: v.email, password: r.password });
      else toast.success("Done");
      qc.invalidateQueries({ queryKey: ["desk_mail", h.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DetailCard title={`Email & web hosting — ${h.domain}`} padded={false}>
      <Row>
        <span className="flex items-center gap-2"><Globe className="h-4 w-4" /><span className="text-xs text-muted-foreground">{h.plan ?? "—"} · disk {Math.round(Number(h.disk_used_mb ?? 0))} MB / {h.disk_quota_gb ?? "?"} GB · {h.email_accounts ?? 0} mailboxes · SSL {h.ssl_status ?? "—"}{connected ? "" : " · not connected to WHM"}</span></span>
        <span className="flex flex-wrap gap-2">
          <StatusBadge tone={toneForStatus(h.status)}>{h.status}</StatusBadge>
          <Button size="sm" variant="outline" onClick={() => health.mutate()} disabled={health.isPending}>{health.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Activity className="h-4 w-4 mr-1" />}Is email working?</Button>
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}><Mail className="h-4 w-4 mr-1" />Mailboxes</Button>
          {connected && <Button size="sm" variant="outline" onClick={async () => { try { const r = await fnSso({ data: { id: h.id } }); window.open(r.url, "_blank", "noopener"); } catch (e: any) { toast.error(e.message); } }}><ExternalLink className="h-4 w-4 mr-1" />cPanel</Button>}
          {h.status === "suspended" && <Button size="sm" onClick={async () => { try { await fnLife({ data: { id: h.id, action: "unsuspend" } }); toast.success("Restored"); } catch (e: any) { toast.error(e.message); } }}>Unsuspend</Button>}
        </span>
      </Row>
      {health.data && (
        <div className="grid gap-2 border-b p-3 text-xs sm:grid-cols-4">
          <Check ok={health.data.mx.length > 0} label="MX records" detail={health.data.mx.join(", ") || "missing — mail can't arrive"} />
          <Check ok={!!health.data.spf} label="SPF" detail={health.data.spf ?? "missing — mail may go to spam"} />
          <Check ok={!!health.data.dmarc} label="DMARC" detail={health.data.dmarc ?? "missing"} />
          <Check ok={health.data.webmail.ok} label="Webmail" detail={health.data.webmail.ok ? `reachable in ${health.data.webmail.ms} ms` : "not reachable"} />
        </div>
      )}
      {open && (
        <div className="p-3 space-y-2">
          {!connected && <p className="text-sm text-muted-foreground">Mailbox tools need this account linked to a WHM server (set up under Web Hosting).</p>}
          {boxes.isLoading && <p className="text-sm text-muted-foreground">Loading mailboxes…</p>}
          {boxes.error && <p className="text-sm text-destructive">{(boxes.error as Error).message}</p>}
          {boxes.data?.map((m: any) => (
            <div key={m.email} className="flex flex-wrap items-center justify-between gap-2 border p-2">
              <span className="text-sm"><span className="font-medium">{m.email}</span> <span className="text-xs text-muted-foreground">{m.usedMb.toFixed(0)} MB / {m.quotaMb ? `${m.quotaMb} MB` : "unlimited"}{m.quotaMb && m.usedMb / m.quotaMb > 0.9 ? " · nearly full" : ""}</span></span>
              <span className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ email: m.email, action: "reset_password" })}>Reset password</Button>
                <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => { const v = prompt(`New quota for ${m.email} in MB (0 = unlimited)`, String((m.quotaMb ?? 1024) * 2)); if (v != null) act.mutate({ email: m.email, action: "set_quota", quotaMb: Number(v) }); }}>Change quota</Button>
                <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ email: m.email, action: m.suspended ? "unsuspend" : "suspend" })}>{m.suspended ? "Allow login" : "Block login"}</Button>
              </span>
            </div>
          ))}
          {connected && (
            <div className="flex flex-wrap items-end gap-2 pt-2">
              <div><Label className="text-xs">New mailbox</Label><div className="flex items-center gap-1"><Input className="w-40" value={newBox.user} onChange={(e) => setNewBox({ ...newBox, user: e.target.value })} placeholder="name" /><span className="text-sm">@{h.domain}</span></div></div>
              <div><Label className="text-xs">Quota MB</Label><Input className="w-24" value={newBox.quota} onChange={(e) => setNewBox({ ...newBox, quota: e.target.value })} /></div>
              <Button size="sm" disabled={!newBox.user || act.isPending} onClick={() => act.mutate({ email: `${newBox.user}@${h.domain}`, action: "create", quotaMb: Number(newBox.quota) })}>Create</Button>
            </div>
          )}
        </div>
      )}
      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>New password for {secret?.email}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Read it to the client now; it won't be shown again.</p>
          <div className="flex items-center gap-2 border p-3 font-mono text-sm">{secret?.password}<Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(secret!.password); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button></div>
        </DialogContent>
      </Dialog>
    </DetailCard>
  );
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return <div className="border p-2"><StatusBadge tone={ok ? "success" : "danger"}>{ok ? "OK" : "Problem"}</StatusBadge> <span className="font-medium">{label}</span><p className="mt-1 break-all text-muted-foreground">{detail}</p></div>;
}

function TicketDialog({ customerId, init, onClose }: { customerId: string; init: { onsite: boolean; subject: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(deskOpenTicket);
  const [f, setF] = useState({ subject: init.subject, description: "", priority: "medium", category: "email", onsite: init.onsite });
  const m = useMutation({
    mutationFn: () => fn({ data: { customerId, ...f } }),
    onSuccess: (t: any) => { toast.success(`Ticket ${t?.ticket_number ?? ""} logged`); qc.invalidateQueries({ queryKey: ["desk_client"] }); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{f.onsite ? "Send a technician" : "Log support call"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Problem</Label><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="e.g. Email not receiving" /></div>
          <div><Label>Notes</Label><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Service</Label><Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["email", "hosting", "voip", "starlink", "server", "storage", "microsoft_365", "hardware", "cctv", "network", "other"].map((x) => <SelectItem key={x} value={x}>{x.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Priority</Label><Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["low", "medium", "high", "critical"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.onsite} onChange={(e) => setF({ ...f, onsite: e.target.checked })} />On-site visit needed (goes to Field TechOps)</label>
        </div>
        <DialogFooter><Button onClick={() => m.mutate()} disabled={m.isPending || !f.subject.trim()}>{m.isPending ? "Saving…" : "Save ticket"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Act({ label, fn, data, confirm }: { label: string; fn: any; data: any; confirm?: boolean }) {
  const qc = useQueryClient();
  const f = useServerFn(fn) as any;
  const m = useMutation({
    mutationFn: () => f({ data }),
    onSuccess: () => { toast.success(`${label}: done`); qc.invalidateQueries({ queryKey: ["desk_client"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => { if (!confirm || window.confirm(`${label}?`)) m.mutate(); }}>{m.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}{label}</Button>;
}

function ConsoleButton({ serverId }: { serverId: string }) {
  const f = useServerFn(getServerConsoleUrl);
  const [busy, setBusy] = useState(false);
  return <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
    const w = window.open("about:blank", "_blank");
    setBusy(true);
    try { const { url } = await f({ data: { server_id: serverId } }); if (w) w.location.href = url; else window.location.href = url; }
    catch (e: any) { w?.close(); toast.error(e.message); }
    finally { setBusy(false); }
  }}>{busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ExternalLink className="h-3 w-3 mr-1" />}Console</Button>;
}

function StorageActions({ s }: { s: any }) {
  const qc = useQueryClient();
  const fn = useServerFn(storageLifecycleAction);
  const [open, setOpen] = useState(false);
  const [tb, setTb] = useState(String(s.storage_tb ?? ""));
  const [used, setUsed] = useState(String(s.used_tb ?? ""));
  const m = useMutation({
    mutationFn: (d: any) => fn({ data: { id: s.id, ...d } }),
    onSuccess: () => { toast.success("Storage updated"); setOpen(false); qc.invalidateQueries({ queryKey: ["desk_client"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const sizes = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10];
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Manage space</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Manage storage — {s.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Capacity</Label>
            <Select value={tb} onValueChange={setTb}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{sizes.map((x) => <SelectItem key={x} value={String(x)}>{x < 1 ? `${x * 1000} GB` : `${x} TB`} — ${(x * 13.5).toFixed(2)}/mo</SelectItem>)}</SelectContent></Select>
            <Button className="mt-2" size="sm" disabled={m.isPending || Number(tb) === Number(s.storage_tb)} onClick={() => m.mutate({ action: "resize", storage_tb: Number(tb) })}>Change capacity</Button>
          </div>
          <div><Label>Used (TB)</Label><Input type="number" step="0.01" value={used} onChange={(e) => setUsed(e.target.value)} />
            <Button className="mt-2" size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ action: "record_usage", used_tb: Number(used) })}>Save usage</Button>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {s.status === "suspended"
            ? <Button variant="outline" disabled={m.isPending} onClick={() => m.mutate({ action: "resume" })}>Resume</Button>
            : <Button variant="outline" disabled={m.isPending} onClick={() => window.confirm("Suspend this storage?") && m.mutate({ action: "suspend", reason: "Suspended from Service desk" })}>Suspend</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function VoipActions({ v }: { v: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(""); const [ref, setRef] = useState("");
  const fn = useServerFn(recordVoipRecharge);
  const m = useMutation({
    mutationFn: () => fn({ data: { voip_account_id: v.id, amount_usd: Number(amt), payment_reference: ref || undefined, payment_method: "support_desk" } }),
    onSuccess: () => { toast.success("Recharge recorded"); setOpen(false); setAmt(""); setRef(""); qc.invalidateQueries({ queryKey: ["desk_client"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <>
      <Act label="Sync balance" fn={syncVoipAccount} data={{ id: v.id }} />
      <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>Recharge</Button>
      {open && (
        <span className="flex w-full flex-wrap items-center gap-2 pt-2">
          <Input className="w-24" placeholder="USD" value={amt} onChange={(e) => setAmt(e.target.value)} />
          <Input className="w-40" placeholder="Payment reference" value={ref} onChange={(e) => setRef(e.target.value)} />
          <Button size="sm" disabled={!(Number(amt) > 0) || m.isPending} onClick={() => m.mutate()}>Save recharge</Button>
        </span>
      )}
    </>
  );
}

function SeatEditor({ l }: { l: any }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (patch: any) => { const { error } = await (supabase as any).from("licenses").update(patch).eq("id", l.id); if (error) throw error; },
    onSuccess: () => { toast.success("Licence updated"); qc.invalidateQueries({ queryKey: ["desk_client"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => {
      const seats = prompt(`Total seats for ${l.product}`, String(l.seats ?? 0)); if (seats == null) return;
      const used = prompt("Seats assigned to users", String(l.assigned_seats ?? 0)); if (used == null) return;
      if (Number(used) > Number(seats)) return toast.error("Assigned seats can't exceed total seats");
      m.mutate({ seats: Number(seats), assigned_seats: Number(used) });
    }}>Change seats</Button>
  );
}

function TicketStatus({ t }: { t: any }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await (supabase as any).from("tickets").update({ status, ...(status === "resolved" ? { resolved_at: new Date().toISOString() } : {}) }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Ticket updated"); qc.invalidateQueries({ queryKey: ["desk_client"] }); qc.invalidateQueries({ queryKey: ["noc"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Select value={t.status} onValueChange={(v) => m.mutate(v)}>
      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
      <SelectContent>{["open", "in_progress", "pending", "resolved", "closed"].map((x) => <SelectItem key={x} value={x}>{x.replace("_", " ")}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/** Account billing, payments and portal access shown on every service tab (summary) and the Billing tab (full). */
function BillingPanel({ customerId, full }: { customerId: string; full: boolean }) {
  const q = useQuery({
    queryKey: ["desk_billing", customerId],
    queryFn: async () => {
      const [inv, pay, prof] = await Promise.all([
        supabase.from("invoices").select("id,invoice_number,issue_date,due_date,total,amount_paid,currency,status").eq("customer_id", customerId).is("archived_at", null).order("issue_date", { ascending: false }).limit(full ? 50 : 10),
        supabase.from("payments").select("id,amount,currency,method,reference,receipt_number,paid_at,status,service_context").eq("customer_id", customerId).order("paid_at", { ascending: false }).limit(full ? 50 : 5),
        supabase.from("profiles").select("id,email").eq("customer_id", customerId),
      ]);
      const ids = (inv.data ?? []).map((i: any) => i.id);
      const [lines, allocs, cat] = ids.length ? await Promise.all([
        supabase.from("invoice_line_items").select("invoice_id,description,item_code,line_total").in("invoice_id", ids),
        supabase.from("payment_allocations").select("invoice_id,amount,payments(paid_at)").in("invoice_id", ids),
        supabase.from("service_catalog").select("code,name"),
      ]) : [{ data: [] }, { data: [] }, { data: [] }] as any[];
      const names = Object.fromEntries(((cat.data ?? []) as any[]).map((c) => [c.code, c.name]));
      const packages = splitByPackage(inv.data as any ?? [], (lines.data ?? []) as any, ((allocs.data ?? []) as any[]).map((a) => ({ invoice_id: a.invoice_id, amount: Number(a.amount), paid_at: a.payments?.paid_at ?? null })), names);
      return { inv: inv.data ?? [], pay: pay.data ?? [], portal: prof.data ?? [], packages };
    },
  });
  if (!q.data) return null;
  const { inv, pay, portal, packages } = q.data;
  const owed = inv.reduce((a: number, i: any) => a + Math.max(0, Number(i.total) - Number(i.amount_paid)), 0);
  const overdue = inv.filter((i: any) => Number(i.total) > Number(i.amount_paid) && i.due_date && i.due_date < new Date().toISOString().slice(0, 10)).length;
  const last = pay[0];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 border bg-card p-3 sm:grid-cols-4">
        <div><p className="text-[11px] text-muted-foreground">Outstanding</p><p className="text-lg font-semibold">${owed.toFixed(2)}</p></div>
        <div><p className="text-[11px] text-muted-foreground">Overdue invoices</p><p className={`text-lg font-semibold ${overdue ? "text-destructive" : ""}`}>{overdue}</p></div>
        <div><p className="text-[11px] text-muted-foreground">Last payment</p><p className="text-sm font-semibold">{last ? `${last.currency} ${Number(last.amount).toFixed(2)} · ${shortDate(last.paid_at)}` : "None"}</p></div>
        <div><p className="text-[11px] text-muted-foreground">Client portal</p><p className="text-sm font-semibold">{portal.length ? `${portal.length} login(s) active` : "No portal login"}</p></div>
      </div>
      {full && <>
        <DetailCard title="By package" padded={false}>
          {packages.length === 0 && <p className="p-3 text-sm text-muted-foreground">No invoiced packages yet.</p>}
          {packages.map((k) => <Row key={k.key}><span className="text-sm"><span className="font-medium">{k.name}</span> <span className="text-xs text-muted-foreground">{k.invoices} invoice(s) · billed {k.currency} {k.billed.toFixed(2)} · paid {k.paid.toFixed(2)} · last paid {k.lastPaidAt ? shortDate(k.lastPaidAt) : "—"}</span></span><StatusBadge tone={toneForStatus(k.outstanding > 0 ? "overdue" : "paid")}>{k.outstanding > 0 ? `${k.currency} ${k.outstanding.toFixed(2)} due` : "paid"}</StatusBadge></Row>)}
        </DetailCard>
        <DetailCard title="Invoices" padded={false}>
          {inv.length === 0 && <p className="p-3 text-sm text-muted-foreground">No invoices.</p>}
          {inv.map((i: any) => <Row key={i.id}><span className="text-sm"><span className="font-medium">{i.invoice_number}</span> <span className="text-xs text-muted-foreground">issued {shortDate(i.issue_date)} · due {shortDate(i.due_date)} · {i.currency} {Number(i.amount_paid).toFixed(2)} / {Number(i.total).toFixed(2)} paid</span></span><StatusBadge tone={toneForStatus(i.status)}>{i.status}</StatusBadge></Row>)}
        </DetailCard>
        <DetailCard title="Payments" padded={false}>
          {pay.length === 0 && <p className="p-3 text-sm text-muted-foreground">No payments.</p>}
          {pay.map((p: any) => <Row key={p.id}><span className="text-sm"><span className="font-medium">{p.currency} {Number(p.amount).toFixed(2)}</span> <span className="text-xs text-muted-foreground">{shortDate(p.paid_at)} · {p.method ?? "—"} · ref {p.reference ?? "—"} · receipt {p.receipt_number ?? "—"}{p.service_context ? ` · ${p.service_context}` : ""}</span></span><StatusBadge tone={toneForStatus(p.status)}>{p.status}</StatusBadge></Row>)}
        </DetailCard>
        <DetailCard title="Client portal access" padded={false}>
          {portal.length === 0 && <p className="p-3 text-sm text-muted-foreground">This client has no portal login yet. An administrator links one from Permissions.</p>}
          {portal.map((u: any) => <Row key={u.id}><span className="text-sm">{u.email}</span><Link to="/reset-password"><Button size="sm" variant="outline"><KeyRound className="h-4 w-4 mr-1.5" />Reset portal password</Button></Link></Row>)}
        </DetailCard>
      </>}
    </div>
  );
}
