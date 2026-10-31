import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Check, X, Loader2, Settings2, ListTodo, Mail, RefreshCw } from "lucide-react";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getFinanceAgent, saveFinanceAgentSettings, assignFinanceAgentTask, reviewFinanceProposal, refreshFinanceMailbox,
} from "@/lib/finance-agent.functions";
import { FINANCE_AGENT_ROLES, ROLE_LABELS, type FinanceAgentRole } from "@/lib/finance-agent.shared";

export const Route = createFileRoute("/finance-agent")({
  head: () => ({
    meta: [
      { title: "Finance AI Agent | IMT Solutions" },
      { name: "description", content: "Assign Finance tasks to the AI agent and approve its proposals." },
      { property: "og:title", content: "Finance AI Agent | IMT Solutions" },
      { property: "og:description", content: "Assign Finance tasks to the AI agent and approve its proposals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceAgentPage,
});

const QUICK_TASKS: { title: string; role: FinanceAgentRole; instructions: string }[] = [
  { title: "Chase overdue invoices", role: "invoice_reminders", instructions: "Draft reminders for every overdue invoice." },
  { title: "Match new payments", role: "payment_matching", instructions: "Match all unlinked pending payment submissions to invoices." },
  { title: "Review pending expenses", role: "expense_review", instructions: "Review all pending expenses; flag ones without receipts." },
];

const tone = (s: string) =>
  s === "done" || s === "applied" ? "success" : s === "failed" || s === "rejected" ? "danger" : s === "running" || s === "applying" ? "info" : "warning";

function FinanceAgentPage() {
  const qc = useQueryClient();
  const load = useServerFn(getFinanceAgent);
  const save = useServerFn(saveFinanceAgentSettings);
  const assign = useServerFn(assignFinanceAgentTask);
  const review = useServerFn(reviewFinanceProposal);
  const sync = useServerFn(refreshFinanceMailbox);
  const [syncing, setSyncing] = useState(false);
  const { data, error, isLoading } = useQuery({ queryKey: ["finance-agent"], queryFn: () => load() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["finance-agent"] });

  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  useEffect(() => {
    if (data?.settings) { setName(data.settings.agent_name); setPersona(data.settings.persona); setRoles(data.settings.enabled_roles); }
  }, [data?.settings]);

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [role, setRole] = useState("general");
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (t: { title: string; instructions: string; role: string }) => {
    setRunning(true);
    try { await assign({ data: t }); toast.success("Agent finished – review its proposals"); setTitle(""); setInstructions(""); }
    catch (e: any) { toast.error(e.message); }
    finally { setRunning(false); refresh(); }
  };
  const decide = async (id: string, decision: "approve" | "reject") => {
    setBusyId(id);
    try { const r: any = await review({ data: { id, decision } }); toast.success(r.result ?? "Rejected"); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); refresh(); }
  };

  if (isLoading) return <PageContainer><Loader2 className="animate-spin" /></PageContainer>;
  if (error) return <PageContainer><p className="text-destructive">{(error as Error).message}</p></PageContainer>;

  if (!data) return null;
  const pending = data.proposals.filter((p: any) => p.status === "pending");
  const history = data.proposals.filter((p: any) => p.status !== "pending").slice(0, 20);

  return (
    <PageContainer>
      <PageHeader eyebrow="Finance" title={data.settings?.agent_name ?? "Finance Agent"}
        description="billing@imtsolutions.co.zw" />

      <section className="border-b border-border pb-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-2 items-center"><h2 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4" />Billing inbox ({data.messages.length})</h2><Button variant="outline" size="sm" disabled={syncing} onClick={async () => { setSyncing(true); try { const r = await sync(); toast.success(`Billing mailbox checked: ${r.imported} new messages`); refresh(); } catch (e: any) { toast.error(e.message); } finally { setSyncing(false); } }}><RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Refresh mailbox</Button></div>
        {data.messages.length === 0 && <p className="text-sm text-muted-foreground">No received billing emails.</p>}
        {data.messages.map((m: any) => <div key={m.id} className="border-b border-border pb-2"><Button asChild variant="link" className="px-0"><Link to="/inbox" search={{ enquiry: m.email_enquiries.id, quote: undefined }}>{m.subject}</Link></Button><p className="text-xs text-muted-foreground">{m.from_address} · {new Date(m.created_at).toLocaleString()}</p><p className="text-sm whitespace-pre-wrap break-words">{m.body_text?.slice(0, 400)}</p></div>)}
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-none lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><ListTodo className="h-5 w-5" />Assign a task</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {QUICK_TASKS.filter((q) => roles.includes(q.role)).map((q) => (
                <Button key={q.title} variant="outline" size="sm" disabled={running} onClick={() => run(q)}>{q.title}</Button>
              ))}
            </div>
            <Input placeholder="Task title, e.g. Chase UK2AFRICA balance" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder="Instructions (optional)" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["general", ...roles] as (FinanceAgentRole | "general")[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button disabled={running || !title.trim()} onClick={() => run({ title, instructions, role })}>
                {running ? <><Loader2 className="h-4 w-4 animate-spin" />Agent working…</> : <><Bot className="h-4 w-4" />Run task</>}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-none">
          <CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" />Agent roles</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Agent name" />
            <Textarea value={persona} onChange={(e) => setPersona(e.target.value)} aria-label="Personality and rules" rows={3} />
            {(Object.keys(FINANCE_AGENT_ROLES) as FinanceAgentRole[]).map((r) => (
              <Label key={r} className="flex items-start gap-2 font-normal">
                <Checkbox checked={roles.includes(r)} onCheckedChange={(v) => setRoles(v ? [...roles, r] : roles.filter((x) => x !== r))} />
                <span><b>{ROLE_LABELS[r]}</b><br /><span className="text-muted-foreground text-xs">{FINANCE_AGENT_ROLES[r]}</span></span>
              </Label>
            ))}
            <Button size="sm" onClick={async () => {
              try { await save({ data: { agent_name: name, persona, enabled_roles: roles } }); toast.success("Saved"); refresh(); }
              catch (e: any) { toast.error(e.message); }
            }}>Save roles</Button>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-none">
        <CardHeader><CardTitle>Waiting for Finance approval ({pending.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 && <p className="text-muted-foreground text-sm">Nothing to approve.</p>}
          {pending.map((p: any) => (
            <div key={p.id} className="border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{p.title}</p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busyId === p.id} onClick={() => decide(p.id, "approve")}><Check className="h-4 w-4" />{p.kind === "payment_reminder" ? "Approve & send" : p.kind === "email_payment" ? "Submit to Finance" : "Approve"}</Button>
                  <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => decide(p.id, "reject")}><X className="h-4 w-4" />Reject</Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{p.rationale}</p>
              {p.kind === "email_payment" && <div className="bg-muted p-3 text-sm"><b>{p.payload.currency} {p.payload.amount}</b> · {p.payload.reference} · {p.payload.payment_date}<p className="text-muted-foreground">Unverified client claim · pending Finance verification</p></div>}
              {p.kind === "payment_reminder" && (
                <div className="bg-muted p-3 text-sm whitespace-pre-wrap"><b>To:</b> {p.payload.to}<br /><b>Subject:</b> {p.payload.subject}<br /><br />{p.payload.body}</div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-none">
          <CardHeader><CardTitle>Task history</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.tasks.length === 0 && <p className="text-muted-foreground text-sm">No tasks yet.</p>}
            {data.tasks.map((t: any) => (
              <div key={t.id} className="border-b border-border pb-2">
                <div className="flex justify-between gap-2"><p className="font-medium">{t.title}</p><StatusPill tone={tone(t.status)}>{t.status}</StatusPill></div>
                {(t.summary || t.error) && <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{t.error ?? t.summary}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="rounded-none">
          <CardHeader><CardTitle>Reviewed proposals</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {history.length === 0 && <p className="text-muted-foreground text-sm">None yet.</p>}
            {history.map((p: any) => (
              <div key={p.id} className="flex justify-between gap-2 text-sm border-b border-border pb-2">
                <span>{p.title}{p.apply_result && <span className="block text-muted-foreground">{p.apply_result}</span>}</span>
                <StatusPill tone={tone(p.status)}>{p.status}</StatusPill>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
