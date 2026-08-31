import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { composeClientEmail, listEmailRecipients } from "@/lib/communications.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Mail, Search, Send } from "lucide-react";

interface Props {
  /** Pre-select a customer (e.g. from Customer 360). */
  accountNumber?: string;
  trigger?: React.ReactNode;
}

const QUICK_TEMPLATES: { label: string; subject: string; body: string }[] = [
  {
    label: "Service update",
    subject: "Update on your service",
    body: "Good day,\n\nWe are writing to update you on your service with IMT Solutions.\n\n[Add details here]\n\nPlease reply to this email if you have any questions.",
  },
  {
    label: "Scheduled maintenance",
    subject: "Scheduled maintenance notification",
    body: "Good day,\n\nWe will be performing scheduled maintenance on [date] between [time].\n\nNo action is required from your side. We apologise for any inconvenience.",
  },
  {
    label: "Payment follow-up",
    subject: "Account balance reminder",
    body: "Good day,\n\nThis is a friendly reminder regarding the outstanding balance on your account.\n\nKindly arrange settlement at your earliest convenience or reply to this email to discuss payment arrangements.",
  },
];

export function ComposeEmailDialog({ accountNumber, trigger }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [account, setAccount] = useState<string | undefined>(accountNumber);
  const [selected, setSelected] = useState<string[]>([]);
  const [manual, setManual] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const recipientsFn = useServerFn(listEmailRecipients);
  const sendFn = useServerFn(composeClientEmail);

  const customers = useQuery({
    queryKey: ["compose-customers"],
    enabled: open && !accountNumber,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, account_number, company_name, primary_email, status")
        .is("archived_at", null)
        .order("company_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const recipients = useQuery({
    queryKey: ["compose-recipients", account],
    enabled: open && !!account,
    queryFn: () => recipientsFn({ data: { account_number: account } }),
  });

  useEffect(() => {
    if (recipients.data?.recipients?.length) {
      setSelected([recipients.data.recipients[0].email]);
    }
  }, [recipients.data]);

  const filtered = useMemo(() => {
    const list = (customers.data ?? []) as any[];
    if (!search.trim()) return list.slice(0, 25);
    const v = search.toLowerCase();
    return list
      .filter((c) =>
        [c.company_name, c.account_number, c.primary_email]
          .some((f) => String(f ?? "").toLowerCase().includes(v)),
      )
      .slice(0, 25);
  }, [customers.data, search]);

  const allTo = useMemo(() => {
    const extra = manual
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => /@/.test(s));
    return Array.from(new Set([...selected, ...extra]));
  }, [selected, manual]);

  const reset = () => {
    setSubject("");
    setBody("");
    setManual("");
    setSelected([]);
    setSearch("");
    if (!accountNumber) setAccount(undefined);
  };

  const send = useMutation({
    mutationFn: () =>
      sendFn({ data: { account_number: account, to: allTo, subject, body } }),
    onSuccess: (r: any) => {
      const suppressed = (r?.results ?? []).filter((x: any) => x.status !== "sent");
      if (r?.sent) toast.success(`Email sent to ${r.sent} recipient(s)`);
      if (suppressed.length)
        toast.warning(`${suppressed.length} not delivered: ${suppressed.map((s: any) => `${s.email} (${s.status})`).join(", ")}`);
      qc.invalidateQueries({ queryKey: ["communications"] });
      qc.invalidateQueries({ queryKey: ["customer360"] });
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (email: string) =>
    setSelected((s) => (s.includes(email) ? s.filter((e) => e !== email) : [...s, email]));

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Mail className="mr-1.5 h-4 w-4" />
            Compose email
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Compose client email
          </DialogTitle>
          <DialogDescription>
            Sent through the branded IMT template, logged against the account and
            replies come back to you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!accountNumber && (
            <div className="space-y-2">
              <Label>Client</Label>
              {account ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{account}</span>
                  <Button variant="ghost" size="sm" onClick={() => { setAccount(undefined); setSelected([]); }}>
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search by name, account number or email…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                    {customers.isLoading && <div className="p-3 text-sm text-muted-foreground">Loading…</div>}
                    {filtered.map((c: any) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setAccount(c.account_number)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span className="truncate">
                          <span className="font-medium">{c.company_name}</span>
                          <span className="ml-2 font-mono text-xs text-muted-foreground">{c.account_number}</span>
                        </span>
                        <span className="ml-3 truncate text-xs text-muted-foreground">{c.primary_email || "no email"}</span>
                      </button>
                    ))}
                    {!customers.isLoading && !filtered.length && (
                      <div className="p-3 text-sm text-muted-foreground">No matching clients.</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {account && (
            <div className="space-y-2">
              <Label>Recipients</Label>
              <div className="flex flex-wrap gap-2">
                {(recipients.data?.recipients ?? []).map((r: any) => (
                  <button key={r.email} type="button" onClick={() => toggle(r.email)}>
                    <Badge variant={selected.includes(r.email) ? "default" : "outline"} className="cursor-pointer">
                      {r.name} · {r.email}
                    </Badge>
                  </button>
                ))}
                {recipients.isLoading && <span className="text-sm text-muted-foreground">Loading contacts…</span>}
                {!recipients.isLoading && !(recipients.data?.recipients ?? []).length && (
                  <span className="text-sm text-muted-foreground">No stored contact emails — add one below.</span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Additional emails</Label>
            <Input
              placeholder="extra@client.co.zw, another@client.co.zw"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Quick start</Label>
            <div className="flex flex-wrap gap-2">
              {QUICK_TEMPLATES.map((t) => (
                <Button
                  key={t.label}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => { setSubject(t.subject); setBody(t.body); }}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Subject *</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" />
          </div>

          <div className="space-y-2">
            <Label>Message *</Label>
            <Textarea
              rows={9}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message… blank lines start a new paragraph."
            />
            <p className="text-xs text-muted-foreground">
              {allTo.length} recipient(s) selected. Each person receives their own copy.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending || !allTo.length || !subject.trim() || !body.trim()}
          >
            {send.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Send email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
