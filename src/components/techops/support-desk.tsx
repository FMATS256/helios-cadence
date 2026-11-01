import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { syncVoipAccount, recordVoipRecharge } from "@/lib/voip.functions";
import { checkStarlinkAccount } from "@/lib/starlink.functions";
import { powerProviderServer, refreshProviderServer } from "@/lib/providers.functions";
import { Link } from "@tanstack/react-router";
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
import { hostingSsoLink, hostingLifecycleAction } from "@/lib/hosting.functions";

const listeners = new Set<(id: string) => void>();
/** Open the client support panel from anywhere (global search, tickets, dashboards). */
export function openClientDesk(customerId: string) { listeners.forEach((l) => l(customerId)); }

export function ClientDeskSheet() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { const l = (x: string) => setId(x); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const fnClient = useServerFn(deskClient);
  const client = useQuery({ queryKey: ["desk_client", id], queryFn: () => fnClient({ data: { id: id! } }), enabled: !!id });
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && setId(null)}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto p-4">
        <SheetHeader><SheetTitle>Client support panel</SheetTitle></SheetHeader>
        <div className="mt-3">
          {client.isLoading && <p className="text-sm text-muted-foreground">Loading client…</p>}
          {client.error && <p className="text-sm text-destructive">{(client.error as Error).message}</p>}
          {client.data && <ClientDesk d={client.data} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 last:border-0">{children}</div>;
}

function ClientDesk({ d }: { d: any }) {
  const c = d.customer;
  const [ticket, setTicket] = useState<null | { onsite: boolean; subject: string }>(null);
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

      {d.hosting.map((h: any) => <HostingCard key={h.id} h={h} />)}

      {d.voip.length > 0 && (
        <DetailCard title="VoIP lines" padded={false}>
          {d.voip.map((v: any) => (
            <Row key={v.id}>
              <span className="flex items-center gap-2"><Phone className="h-4 w-4" /><span className="font-medium">{v.voip_number}</span><span className="text-xs text-muted-foreground">SIP {v.sip_username ?? "—"} · {v.extensions ?? 0} ext · balance ${Number(v.balance_usd ?? 0).toFixed(2)}</span></span>
              <span className="flex gap-2"><StatusBadge tone={toneForStatus(v.status)}>{v.status}</StatusBadge><VoipActions v={v} /></span>
            </Row>
          ))}
        </DetailCard>
      )}

      {d.starlink.length > 0 && (
        <DetailCard title="Starlink" padded={false}>
          {d.starlink.map((s: any) => (
            <Row key={s.id}>
              <span className="flex items-center gap-2"><Satellite className="h-4 w-4" /><span className="font-medium">{s.kit_serial ?? s.starlink_account_number}</span><span className="text-xs text-muted-foreground">{s.plan_type ?? "—"} · {s.service_address ?? ""} · checked {shortDate(s.last_checked_at)}</span></span>
              <span className="flex gap-2"><StatusBadge tone={toneForStatus(s.status)}>{s.status}</StatusBadge><Act label="Check status" fn={checkStarlinkAccount} data={{ id: s.id }} /></span>
            </Row>
          ))}
        </DetailCard>
      )}

      {d.servers.length > 0 && (
        <DetailCard title="Servers" padded={false}>
          {d.servers.map((s: any) => (
            <Row key={s.id}>
              <span className="flex items-center gap-2"><Server className="h-4 w-4" /><span className="font-medium">{s.name}</span><span className="text-xs text-muted-foreground">{s.provider} · {(s.public_ips ?? []).join?.(", ") || "no IP"} · {s.cpu_cores ?? "?"} vCPU / {s.ram_mb ? Math.round(s.ram_mb / 1024) : "?"} GB</span></span>
              <span className="flex gap-2"><StatusBadge tone={toneForStatus(s.power_state ?? s.status)}>{s.power_state ?? s.status}</StatusBadge><Act label="Refresh" fn={refreshProviderServer} data={{ server_id: s.id }} /><Act label="Reboot" confirm fn={powerProviderServer} data={{ server_id: s.id, action: "reboot" }} />{s.power_state === "stopped" || s.power_state === "off" ? <Act label="Power on" fn={powerProviderServer} data={{ server_id: s.id, action: "on" }} /> : <Act label="Power off" confirm fn={powerProviderServer} data={{ server_id: s.id, action: "off" }} />}<Link to="/cloud-ops/$id" params={{ id: s.id }}><Button size="sm" variant="ghost">Console & more</Button></Link></span>
            </Row>
          ))}
        </DetailCard>
      )}

      {d.storage.length > 0 && (
        <DetailCard title="Cloud storage" padded={false}>
          {d.storage.map((s: any) => (
            <Row key={s.id}>
              <span className="flex items-center gap-2"><HardDrive className="h-4 w-4" /><span className="font-medium">{s.name}</span><span className="text-xs text-muted-foreground">{Number(s.used_tb ?? 0).toFixed(2)} / {s.storage_tb} TB used · last backup {shortDate(s.last_backup_at)}</span></span>
              <span className="flex gap-2"><StatusBadge tone={toneForStatus(s.status)}>{s.status}</StatusBadge><Link to="/cloud-storage"><Button size="sm" variant="outline">Increase / manage</Button></Link></span>
            </Row>
          ))}
        </DetailCard>
      )}

      {(d.licenses.length > 0 || d.subscriptions.length > 0) && (
        <DetailCard title="Licences & subscriptions (e.g. Microsoft 365)" padded={false}>
          {d.licenses.map((l: any) => (
            <Row key={l.id}><span className="flex items-center gap-2"><Package className="h-4 w-4" /><span className="font-medium">{l.product}</span><span className="text-xs text-muted-foreground">{l.vendor ?? ""} · {l.assigned_seats ?? 0}/{l.seats ?? 0} seats · expires {shortDate(l.expiry_date)}</span></span><span className="flex gap-2"><StatusBadge tone={toneForStatus(l.status)}>{l.status}</StatusBadge><SeatEditor l={l} /></span></Row>
          ))}
          {d.subscriptions.map((s: any) => (
            <Row key={s.id}><span className="flex items-center gap-2"><Package className="h-4 w-4" /><span className="font-medium">{s.plan_name}</span><span className="text-xs text-muted-foreground">{s.currency} {s.amount} / {s.billing_cycle} · renews {shortDate(s.next_renewal)}</span></span><StatusBadge tone={toneForStatus(s.status)}>{s.status}</StatusBadge></Row>
          ))}
        </DetailCard>
      )}

      {d.assets.length > 0 && (
        <DetailCard title="On-site equipment (routers, CCTV, switches…)" padded={false}>
          {d.assets.map((a: any) => (
            <Row key={a.id}>
              <span className="text-sm"><span className="font-medium">{a.make} {a.model}</span> <span className="text-xs text-muted-foreground">{a.asset_type} · S/N {a.serial_number ?? "—"} · {a.site_name ?? a.location ?? ""} · warranty {shortDate(a.warranty_expires)}</span></span>
              <span className="flex gap-2"><StatusBadge tone={toneForStatus(a.status)}>{a.status}</StatusBadge><Button size="sm" variant="outline" onClick={() => setTicket({ onsite: true, subject: `On-site: ${a.make ?? ""} ${a.model ?? ""} (${a.serial_number ?? "no S/N"})` })}>Send technician</Button></span>
            </Row>
          ))}
        </DetailCard>
      )}

      <DetailCard title="Recent tickets" padded={false}>
        {d.tickets.length === 0 && <p className="p-3 text-sm text-muted-foreground">No tickets for this client.</p>}
        {d.tickets.map((t: any) => (
          <Row key={t.id}>
            <Link to="/tickets/$id" params={{ id: t.id }} className="text-sm"><span className="font-medium">{t.ticket_number}</span> {t.subject}</Link>
            <span className="flex gap-2"><StatusBadge tone={toneForStatus(t.priority)}>{t.priority}</StatusBadge><TicketStatus t={t} /></span>
          </Row>
        ))}
      </DetailCard>

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
