import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { checkHostReputation } from "@/lib/noc-tools.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const SLA_HOURS: Record<string, number> = { critical: 2, urgent: 2, high: 4, medium: 8, normal: 8, low: 24 };

const RUNBOOKS = [
  { t: "Email not sending/receiving", s: ["Check MX/SPF/DMARC in client panel", "Confirm mailbox not suspended or over quota", "Reset password and test webmail", "Check sending IP blacklist below"] },
  { t: "Starlink offline", s: ["Check kit status from client panel", "Ask client to power-cycle dish & router (2 min)", "Check obstructions/cable", "Raise onsite ticket if still down"] },
  { t: "VoIP no dial tone", s: ["Check SIP balance & recharge", "Confirm extension registered on PBX", "Reboot phone, check PoE/VLAN", "Escalate to trunk provider"] },
  { t: "VPS unreachable", s: ["Refresh server status", "Check firewall rules (Servers tab)", "Use provider console", "Reboot via Remote Actions, then snapshot"] },
  { t: "Microsoft 365 sign-in issues", s: ["Verify licence/seat assigned", "Reset password / MFA in admin centre", "Check service health", "Log ticket notes"] },
];

const ROSTER_KEY = "imt-noc-oncall";

export function NocToolkitSection() {
  const { data } = useQuery({
    queryKey: ["noc-toolkit-tickets"],
    queryFn: async () => {
      const { data } = await supabase.from("tickets").select("id,ticket_number,subject,priority,status,created_at,sla_due_at,account_number")
        .is("archived_at", null).not("status", "in", "(resolved,closed)").order("created_at").limit(100);
      return data ?? [];
    },
    refetchInterval: 60000,
  });
  const { data: customers } = useQuery({
    queryKey: ["noc-toolkit-customers"],
    queryFn: async () => (await supabase.from("customers").select("id,name:company_name,email:primary_email,account_number").limit(500)).data ?? [],
  });

  const sla = useMemo(() => (data ?? []).map((t) => {
    const due = t.sla_due_at ? new Date(t.sla_due_at) : new Date(new Date(t.created_at).getTime() + (SLA_HOURS[t.priority?.toLowerCase()] ?? 8) * 3600000);
    return { ...t, mins: Math.round((due.getTime() - Date.now()) / 60000) };
  }).sort((a, b) => a.mins - b.mins), [data]);

  const [roster, setRoster] = useState(() => (typeof window !== "undefined" && localStorage.getItem(ROSTER_KEY)) || "");
  const [msg, setMsg] = useState("We are currently investigating degraded service affecting your account. Our engineers are working on it and we will update you shortly. – IMT Solutions NOC");
  const [filter, setFilter] = useState("");
  const [host, setHost] = useState("");
  const check = useServerFn(checkHostReputation);
  const rep = useMutation({ mutationFn: (h: string) => check({ data: { host: h } }), onError: (e: Error) => toast.error(e.message) });

  const recipients = (customers ?? []).filter((c) => c.email && (!filter || `${c.name} ${c.account_number}`.toLowerCase().includes(filter.toLowerCase())));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>SLA timers</CardTitle></CardHeader><CardContent className="space-y-2 max-h-96 overflow-auto">
        {sla.length === 0 && <p className="text-sm text-muted-foreground">No open tickets.</p>}
        {sla.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-2 border-b py-1 text-sm">
            <span className="min-w-0 truncate"><b>{t.ticket_number}</b> · {t.subject} <span className="text-muted-foreground">({t.account_number})</span></span>
            <Badge variant={t.mins < 0 ? "destructive" : t.mins < 60 ? "secondary" : "outline"}>
              {t.mins < 0 ? `Breached ${Math.abs(Math.round(t.mins / 60))}h` : `${Math.floor(t.mins / 60)}h ${t.mins % 60}m left`}
            </Badge>
          </div>
        ))}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Incident broadcast</CardTitle></CardHeader><CardContent className="space-y-2">
        <Input placeholder="Filter clients by name or account number" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <p className="text-xs text-muted-foreground">{recipients.length} client(s) with an email will be BCC'd.</p>
        <Textarea rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} />
        <div className="flex gap-2">
          <Button onClick={() => { window.location.href = `mailto:?bcc=${recipients.map((c) => c.email).join(",")}&subject=${encodeURIComponent("Service advisory – IMT Solutions")}&body=${encodeURIComponent(msg)}`; }} disabled={!recipients.length}>Open advisory email</Button>
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(msg); toast.success("Copied for SMS/WhatsApp"); }}>Copy text</Button>
        </div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>IP blacklist & SSL check</CardTitle></CardHeader><CardContent className="space-y-2">
        <div className="flex gap-2">
          <Input placeholder="domain.co.zw or 1.2.3.4" value={host} onChange={(e) => setHost(e.target.value)} />
          <Button onClick={() => rep.mutate(host)} disabled={rep.isPending || !host}>{rep.isPending ? "Checking…" : "Check"}</Button>
        </div>
        {rep.data && (
          <div className="space-y-1 text-sm">
            <p>Resolved IP: <b>{rep.data.ip || "not found"}</b></p>
            {rep.data.blacklists.map((b) => <p key={b.list}>{b.list}: <Badge variant={b.listed ? "destructive" : "outline"}>{b.listed ? "LISTED" : "clean"}</Badge></p>)}
            {rep.data.ssl ? <p>SSL expires {new Date(rep.data.ssl.expires).toLocaleDateString()} ({rep.data.ssl.daysLeft} days) · {rep.data.ssl.issuer}</p>
              : <p className="text-muted-foreground">No certificate data found.</p>}
          </div>
        )}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>On-call roster</CardTitle></CardHeader><CardContent className="space-y-2">
        <Textarea rows={5} placeholder={"Mon–Fri day: Name, phone\nNights: Name, phone\nWeekend: Name, phone"} value={roster} onChange={(e) => setRoster(e.target.value)} />
        <Button variant="outline" onClick={() => { localStorage.setItem(ROSTER_KEY, roster); toast.success("Roster saved on this device"); }}>Save roster</Button>
      </CardContent></Card>

      <Card className="lg:col-span-2"><CardHeader><CardTitle>Runbooks</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {RUNBOOKS.map((r) => (
          <div key={r.t} className="rounded-md border p-3"><p className="font-medium">{r.t}</p>
            <ol className="mt-1 list-decimal pl-5 text-sm text-muted-foreground">{r.s.map((s) => <li key={s}>{s}</li>)}</ol></div>
        ))}
      </CardContent></Card>
    </div>
  );
}
