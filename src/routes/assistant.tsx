import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, Settings2, ListTodo } from "lucide-react";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getPersonalAssistant, savePersonalAssistant, assignPersonalAssistantTask } from "@/lib/personal-assistant.functions";
import { ASSISTANT_ROLES, ASSISTANT_ROLE_LABELS, type AssistantRole } from "@/lib/personal-assistant.shared";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "Personal Assistant | IMT Solutions" },
      { name: "description", content: "Your private AI assistant for email summaries, reply drafts and daily briefings." },
      { property: "og:title", content: "Personal Assistant | IMT Solutions" },
      { property: "og:description", content: "Your private AI assistant for email summaries, reply drafts and daily briefings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantPage,
});

const QUICK: { title: string; role: AssistantRole; instructions: string }[] = [
  { title: "Summarise my emails", role: "email_summary", instructions: "Summarise my email conversations from the last 3 days and highlight what needs my attention." },
  { title: "What haven't I replied to?", role: "reply_drafting", instructions: "List emails from the last 14 days still waiting for my reply and draft a short reply for each." },
  { title: "Daily briefing", role: "daily_briefing", instructions: "Give me today's briefing: unreplied emails, my open tickets and unread alerts." },
  { title: "Client follow-ups", role: "client_followups", instructions: "Review my client accounts and suggest who I should follow up with and why." },
];

const tone = (s: string) => (s === "done" ? "success" : s === "failed" ? "danger" : "info");

function AssistantPage() {
  const qc = useQueryClient();
  const load = useServerFn(getPersonalAssistant);
  const save = useServerFn(savePersonalAssistant);
  const assign = useServerFn(assignPersonalAssistantTask);
  const { data, isLoading, error } = useQuery({ queryKey: ["personal-assistant"], queryFn: () => load() });
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [role, setRole] = useState("general");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  useEffect(() => {
    if (data?.settings) { setName(data.settings.assistant_name); setPersona(data.settings.persona); setRoles(data.settings.enabled_roles); }
  }, [data?.settings]);

  async function run(t: string, i: string, r: string) {
    setBusy(true); setAnswer(null);
    try {
      const res = await assign({ data: { title: t, instructions: i, role: r } });
      setAnswer(res.summary); setTitle(""); setInstructions("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Assistant failed"); }
    finally { setBusy(false); qc.invalidateQueries({ queryKey: ["personal-assistant"] }); }
  }

  async function saveSettings() {
    try { await save({ data: { assistant_name: name, persona, enabled_roles: roles } }); toast.success("Assistant updated"); qc.invalidateQueries({ queryKey: ["personal-assistant"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
  }

  if (isLoading) return <PageContainer><Loader2 className="h-5 w-5 animate-spin" /></PageContainer>;
  if (error) return <PageContainer><p className="text-sm text-destructive">Could not load your assistant.</p></PageContainer>;

  return (
    <PageContainer>
      <PageHeader title={data?.settings.assistant_name || "Personal Assistant"} description="Private to you. Reads your emails, tickets and accounts — never sends or changes anything." />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> Ask your assistant</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {QUICK.filter((q) => roles.includes(q.role)).map((q) => (
                  <Button key={q.title} size="sm" variant="outline" disabled={busy} onClick={() => run(q.title, q.instructions, q.role)}>{q.title}</Button>
                ))}
              </div>
              <Input placeholder="Task, e.g. Summarise the Frampol thread" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Textarea placeholder="Extra instructions (optional)" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} />
              <div className="flex flex-wrap items-center gap-2">
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">All my duties</SelectItem>
                    {roles.map((r) => <SelectItem key={r} value={r}>{ASSISTANT_ROLE_LABELS[r as AssistantRole]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button disabled={busy || !title.trim()} onClick={() => run(title, instructions, role)}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Assign task
                </Button>
              </div>
              {busy ? <p className="text-sm text-muted-foreground">Working on it — this can take up to a minute…</p> : null}
              {answer ? <div className="whitespace-pre-wrap break-words border bg-muted/40 p-3 text-sm">{answer}</div> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ListTodo className="h-4 w-4" /> Past tasks</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(data?.tasks ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No tasks yet.</p> : null}
              {(data?.tasks ?? []).map((t: any) => (
                <details key={t.id} className="border p-2">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium">
                    {t.title} <StatusPill tone={tone(t.status)}>{t.status}</StatusPill>
                    <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</span>
                  </summary>
                  <div className="mt-2 whitespace-pre-wrap break-words text-sm">{t.summary ?? t.error ?? "Working…"}</div>
                </details>
              ))}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4" /> Roles & personality</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1"><Label>How it should work for you</Label><Textarea rows={4} value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="e.g. Be brief, use bullet points, prioritise clients and suppliers." /></div>
            <div className="space-y-2">
              {(Object.keys(ASSISTANT_ROLES) as AssistantRole[]).map((r) => (
                <label key={r} className="flex items-start gap-2 text-sm">
                  <Checkbox checked={roles.includes(r)} onCheckedChange={(c) => setRoles(c ? [...roles, r] : roles.filter((x) => x !== r))} />
                  <span><span className="font-medium">{ASSISTANT_ROLE_LABELS[r]}</span><br /><span className="text-muted-foreground">{ASSISTANT_ROLES[r]}</span></span>
                </label>
              ))}
            </div>
            <Button onClick={saveSettings}>Save</Button>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
