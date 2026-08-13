import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/page";
import { Mail, MessageSquare, Phone, Send } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { logCommunication } from "@/lib/communications.functions";

const CHANNELS = ["email", "sms", "whatsapp", "call", "note"] as const;
const DIRECTIONS = ["outbound", "inbound"] as const;

export const Route = createFileRoute("/communications")({
  head: () => ({ meta: [{ title: "Communications — IMT Operations" }] }),
  component: CommunicationsPage,
});

function CommunicationsPage() {
  const log = useServerFn(logCommunication);
  return (
    <ModulePage
      eyebrow="Operations"
      title="Communications"
      description="Unified log of emails, SMS, WhatsApp and call notes exchanged with customers."
      table="communications"
      queryKey="communications"
      orderBy="sent_at"
      searchFields={["subject", "body", "recipient", "sender", "account_number", "channel"]}
      emptyLabel="No communications logged yet."
      createTitle="Log communication"
      createLabel="Log message"
      emptyForm={{ channel: "email", direction: "outbound", subject: "", body: "", recipient: "", sender: "", account_number: "", sent_at: new Date().toISOString().slice(0, 16), send_email: true }}
      validateForm={(f) => (!f.channel ? "Channel required" : !f.body ? "Message required" : null)}
      transformInsert={(f) => ({ ...f, sent_at: f.sent_at ? new Date(f.sent_at).toISOString() : new Date().toISOString() })}
      onCreate={async (f: any) => log({ data: { ...f, send_email: f.send_email !== false } })}
      createDescription="Outbound email is delivered through the branded IMT template and logged here automatically."
      columns={[
        { header: "When", cell: (r: any) => <span className="text-xs">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}</span> },
        { header: "Channel", cell: (r: any) => (
          <div className="flex items-center gap-1.5 capitalize">
            {r.channel === "email" ? <Mail className="h-3.5 w-3.5" /> : r.channel === "sms" || r.channel === "whatsapp" ? <MessageSquare className="h-3.5 w-3.5" /> : r.channel === "call" ? <Phone className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {r.channel}
          </div>
        ) },
        { header: "Dir", cell: (r: any) => <StatusPill tone={r.direction === "outbound" ? "info" : "warning"}>{r.direction}</StatusPill> },
        { header: "Account", cell: (r: any) => <span className="font-mono text-xs">{r.account_number || "—"}</span> },
        { header: "Subject", cell: (r: any) => <div className="max-w-[280px]"><div className="font-semibold truncate">{r.subject || "(no subject)"}</div><div className="text-xs text-muted-foreground truncate">{r.body}</div></div> },
        { header: "To / From", cell: (r: any) => <span className="text-xs">{r.direction === "outbound" ? r.recipient : r.sender}</span> },
        { header: "Status", cell: (r: any) => <StatusPill tone={r.status === "sent" || r.status === "delivered" ? "success" : r.status === "failed" ? "danger" : "warning"}>{r.status}</StatusPill> },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Channel</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm capitalize" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label>Direction</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm capitalize" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
              {DIRECTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label>Account number</Label><Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value.toUpperCase() })} placeholder="M0001" /></div>
          <div className="space-y-2"><Label>When</Label><Input type="datetime-local" value={form.sent_at} onChange={(e) => setForm({ ...form, sent_at: e.target.value })} /></div>
          <div className="space-y-2"><Label>Recipient</Label><Input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} placeholder="Email / phone" /></div>
          <div className="space-y-2"><Label>Sender</Label><Input value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
          {form.channel === "email" && form.direction === "outbound" && (
            <div className="col-span-2 flex items-center gap-2 rounded-md border border-border p-3">
              <input id="send_email" type="checkbox" className="h-4 w-4" checked={form.send_email !== false} onChange={(e) => setForm({ ...form, send_email: e.target.checked })} />
              <Label htmlFor="send_email" className="cursor-pointer">Actually send this email to the recipient</Label>
            </div>
          )}
          <div className="col-span-2 space-y-2"><Label>Message *</Label><Textarea rows={4} required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
