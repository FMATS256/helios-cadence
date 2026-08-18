import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listEmailStudioTemplates,
  getEmailStudioTemplate,
  renderEmailStudioPreview,
  saveEmailStudioTemplate,
  resetEmailStudioTemplate,
  sendEmailStudioTest,
  getEmailTheme,
  saveEmailTheme,
  getDeliverabilityStats,
} from "@/lib/email-studio.functions";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Mail, Palette, Activity, Send, RotateCcw, Save, Upload, Monitor, Smartphone,
  CheckCircle2, AlertTriangle, XCircle, Loader2,
} from "lucide-react";

const EmailEditor = lazy(() => import("react-email-editor"));

import { EmailLogsPage } from "@/components/workspaces/email-logs-workspace";

export const Route = createFileRoute("/email-studio")({
  validateSearch: (q: Record<string, unknown>): { tab?: string } =>
    typeof q.tab === "string" ? { tab: q.tab } : {},
  head: () => ({
    meta: [
      { title: "Email Studio — IMT Operations" },
      { name: "description", content: "Design, preview and deliver transactional emails." },
    ],
  }),
  component: EmailStudioPage,
});

function EmailStudioPage() {
  const { tab } = Route.useSearch();
  const { user, loading } = useAuth();
  const { isMaster } = useRoles();

  if (loading) return <div className="p-6"><Skeleton className="h-8 w-64" /></div>;
  if (!user) return <div className="p-6 text-sm text-muted-foreground">Please sign in.</div>;
  if (!isMaster) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Restricted</CardTitle>
            <CardDescription>Email Studio is available to master admins only.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Mail className="h-5 w-5 text-primary" /> Email Studio
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Preview, design and deliver every transactional email. Changes apply system-wide.
        </p>
      </div>

      <Tabs defaultValue={tab ?? "templates"} className="space-y-6">
        <TabsList>
          <TabsTrigger value="templates"><Mail className="h-4 w-4 mr-2" />Templates</TabsTrigger>
          <TabsTrigger value="theme"><Palette className="h-4 w-4 mr-2" />Brand theme</TabsTrigger>
          <TabsTrigger value="deliverability"><Activity className="h-4 w-4 mr-2" />Deliverability</TabsTrigger>
          <TabsTrigger value="logs"><Activity className="h-4 w-4 mr-2" />Delivery logs</TabsTrigger>
        </TabsList>

        <TabsContent value="templates"><TemplatesPanel /></TabsContent>
        <TabsContent value="theme"><ThemePanel /></TabsContent>
        <TabsContent value="deliverability"><DeliverabilityPanel /></TabsContent>
        <TabsContent value="logs"><EmailLogsPage /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Templates ────────────────────────────────────────────────────

function TemplatesPanel() {
  const listFn = useServerFn(listEmailStudioTemplates);
  const list = useQuery({
    queryKey: ["email-studio", "list"],
    queryFn: () => listFn(),
  });

  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!selected && list.data && list.data.length > 0) {
      setSelected(list.data[0].template_name);
    }
  }, [list.data, selected]);

  if (list.isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">All templates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 pb-3">
          {(list.data ?? []).map((t) => {
            const active = selected === t.template_name;
            return (
              <button
                key={t.template_name}
                onClick={() => setSelected(t.template_name)}
                className={`w-full text-left rounded-md px-3 py-2 text-sm transition ${
                  active ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
              >
                <div className="font-medium">{t.display_name}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t.template_name}</span>
                  {t.override ? (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                      {t.override.mode === "code" ? "Custom subject" : t.override.mode.toUpperCase()}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] h-4 px-1">Default</Badge>
                  )}
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {selected ? <TemplateEditor key={selected} templateName={selected} /> : null}
    </div>
  );
}

function TemplateEditor({ templateName }: { templateName: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getEmailStudioTemplate);
  const renderFn = useServerFn(renderEmailStudioPreview);
  const saveFn = useServerFn(saveEmailStudioTemplate);
  const resetFn = useServerFn(resetEmailStudioTemplate);
  const testFn = useServerFn(sendEmailStudioTest);
  const { user } = useAuth();

  const detail = useQuery({
    queryKey: ["email-studio", "template", templateName],
    queryFn: () => getFn({ data: { templateName } }),
  });

  const [mode, setMode] = useState<"code" | "html" | "unlayer">("code");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [fromName, setFromName] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [sampleDataStr, setSampleDataStr] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [unlayerDesign, setUnlayerDesign] = useState<any>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [testTo, setTestTo] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const emailEditorRef = useRef<any>(null);

  // Sync state when the loaded row changes
  useEffect(() => {
    if (!detail.data) return;
    const row = detail.data.row;
    setDisplayName(detail.data.display_name);
    setMode(row?.mode ?? "code");
    setSubject(row?.subject ?? detail.data.default_subject ?? "");
    setPreviewText(row?.preview_text ?? "");
    setFromName(row?.from_name ?? "");
    setHtmlContent(row?.html_content ?? "");
    setUnlayerDesign(row?.unlayer_design ?? null);
    setSampleDataStr(
      JSON.stringify(row?.sample_data ?? detail.data.default_sample_data ?? {}, null, 2),
    );
    setTestTo(user?.email ?? "");
  }, [detail.data, user?.email]);

  const parsedSample = useMemo(() => {
    try { return JSON.parse(sampleDataStr || "{}"); } catch { return null; }
  }, [sampleDataStr]);

  // Live preview render
  useEffect(() => {
    if (!detail.data || parsedSample === null) return;
    let cancelled = false;
    renderFn({
      data: {
        templateName,
        sampleDataOverride: parsedSample,
        draft: mode === "code" ? undefined : { mode, html_content: htmlContent },
      },
    }).then((r: any) => {
      if (!cancelled) setPreviewHtml(r.html);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [templateName, mode, htmlContent, sampleDataStr, detail.data]);

  const save = useMutation({
    mutationFn: async () => {
      let designToSave = unlayerDesign;
      let htmlToSave = htmlContent;
      if (mode === "unlayer" && emailEditorRef.current?.editor) {
        await new Promise<void>((resolve) => {
          emailEditorRef.current.editor.exportHtml((d: any) => {
            designToSave = d.design;
            htmlToSave = d.html;
            resolve();
          });
        });
      }
      return saveFn({
        data: {
          templateName,
          display_name: displayName,
          subject: subject || null,
          preview_text: previewText || null,
          from_name: fromName || null,
          mode,
          html_content: mode === "code" ? null : htmlToSave,
          unlayer_design: mode === "unlayer" ? designToSave : null,
          sample_data: parsedSample,
        },
      });
    },
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["email-studio"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const reset = useMutation({
    mutationFn: () => resetFn({ data: { templateName } }),
    onSuccess: () => {
      toast.success("Reverted to code default");
      qc.invalidateQueries({ queryKey: ["email-studio"] });
    },
  });

  const sendTest = useMutation({
    mutationFn: () => testFn({
      data: { templateName, to: testTo, sampleDataOverride: parsedSample ?? undefined },
    }),
    onSuccess: (r: any) => {
      if (r?.sent) toast.success(`Test sent to ${testTo}`);
      else toast.warning(`Recipient suppressed: ${r?.reason ?? "unknown"}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Send failed"),
  });

  const onFileUpload = async (file: File) => {
    const text = await file.text();
    setHtmlContent(text);
    setMode("html");
    toast.success("HTML imported — remember to Save");
  };

  if (detail.isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-lg">{displayName}</CardTitle>
          <CardDescription>Template ID: <code>{templateName}</code></CardDescription>
        </div>
        <div className="flex gap-2">
          {detail.data?.row && (
            <Button variant="outline" size="sm" onClick={() => reset.mutate()} disabled={reset.isPending}>
              <RotateCcw className="h-4 w-4 mr-2" />Reset
            </Button>
          )}
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || parsedSample === null}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="preview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="design">Drag & drop</TabsTrigger>
            <TabsTrigger value="html">HTML</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="test">Send test</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Mode: <Badge variant="outline">{mode}</Badge></div>
              <div className="flex gap-1">
                <Button variant={device === "desktop" ? "default" : "ghost"} size="sm" onClick={() => setDevice("desktop")}>
                  <Monitor className="h-4 w-4" />
                </Button>
                <Button variant={device === "mobile" ? "default" : "ghost"} size="sm" onClick={() => setDevice("mobile")}>
                  <Smartphone className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 flex justify-center">
              <iframe
                title="preview"
                srcDoc={previewHtml}
                sandbox=""
                style={{
                  width: device === "mobile" ? 380 : "100%",
                  maxWidth: device === "mobile" ? 380 : 800,
                  height: 700,
                  background: "#fff",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="design">
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Drag blocks to build the email. Click Save above to persist and switch this template to
                drag-and-drop mode.
              </div>
              <div className="border rounded-lg overflow-hidden" style={{ height: 640 }}>
                <Suspense fallback={<div className="p-6 text-sm">Loading editor…</div>}>
                  <EmailEditor
                    ref={emailEditorRef as any}
                    onReady={() => {
                      setMode("unlayer");
                      if (unlayerDesign && emailEditorRef.current?.editor) {
                        emailEditorRef.current.editor.loadDesign(unlayerDesign);
                      }
                    }}
                    minHeight={640}
                  />
                </Suspense>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="html" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept=".html,.htm"
                id="html-upload"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFileUpload(e.target.files[0])}
              />
              <Button variant="outline" size="sm" asChild>
                <label htmlFor="html-upload" className="cursor-pointer">
                  <Upload className="h-4 w-4 mr-2" />Import .html
                </label>
              </Button>
              <div className="text-xs text-muted-foreground">
                Use <code>{"{{"}variable{"}}"}</code> and <code>{"{{"}theme.color_primary{"}}"}</code> tokens.
              </div>
            </div>
            <Textarea
              value={htmlContent}
              onChange={(e) => { setHtmlContent(e.target.value); setMode("html"); }}
              placeholder="<html>…</html>"
              className="font-mono text-xs min-h-[400px]"
            />
          </TabsContent>

          <TabsContent value="settings" className="space-y-3 max-w-2xl">
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label>Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Subject line</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)}
                  placeholder="Supports {{mustache}} tokens" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Preview text</Label>
                  <Input value={previewText} onChange={(e) => setPreviewText(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>From name (override)</Label>
                  <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="IMT Solutions" />
                </div>
              </div>
              <Separator className="my-2" />
              <div className="space-y-1.5">
                <Label>Sample data (JSON) — used for preview & test sends</Label>
                <Textarea
                  value={sampleDataStr}
                  onChange={(e) => setSampleDataStr(e.target.value)}
                  className="font-mono text-xs min-h-[260px]"
                />
                {parsedSample === null && (
                  <div className="text-xs text-destructive">Invalid JSON — fix before saving.</div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="test" className="space-y-3 max-w-md">
            <div className="space-y-1.5">
              <Label>Send test to</Label>
              <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} type="email" />
            </div>
            <Button onClick={() => sendTest.mutate()} disabled={!testTo || sendTest.isPending}>
              {sendTest.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send test email
            </Button>
            <div className="text-xs text-muted-foreground">
              Uses current sample data. Save first to test the persisted version — otherwise this sends the last saved copy.
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Theme ────────────────────────────────────────────────────────

function ThemePanel() {
  const qc = useQueryClient();
  const getFn = useServerFn(getEmailTheme);
  const saveFn = useServerFn(saveEmailTheme);
  const theme = useQuery({ queryKey: ["email-theme"], queryFn: () => getFn() });
  const [form, setForm] = useState<any>(null);

  useEffect(() => { if (theme.data) setForm(theme.data); }, [theme.data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: form }),
    onSuccess: () => {
      toast.success("Theme saved");
      qc.invalidateQueries({ queryKey: ["email-theme"] });
      qc.invalidateQueries({ queryKey: ["email-studio"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  if (!form) return <Skeleton className="h-64 w-full" />;

  const upd = (k: string, v: any) => setForm({ ...form, [k]: v });
  const Field = ({ k, label, type = "text" }: any) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={form[k] ?? ""} onChange={(e) => upd(k, e.target.value)} />
    </div>
  );
  const ColorField = ({ k, label }: any) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input type="color" value={form[k] ?? "#000000"} onChange={(e) => upd(k, e.target.value)} className="h-9 w-16 p-1" />
        <Input value={form[k] ?? ""} onChange={(e) => upd(k, e.target.value)} className="font-mono text-xs" />
      </div>
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand identity</CardTitle>
          <CardDescription>Applied to all default templates and available as <code>{"{{"}theme.*{"}}"}</code> in custom HTML.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field k="brand_name" label="Brand name" />
          <Field k="tagline" label="Tagline" />
          <Field k="logo_url" label="Logo URL (optional)" />
          <Field k="site_url" label="Website URL" />
          <Field k="font_family" label="Font family (CSS stack)" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Colors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ColorField k="color_primary" label="Primary (accent)" />
          <ColorField k="color_accent" label="Accent hover" />
          <ColorField k="color_ink" label="Ink (headings)" />
          <ColorField k="color_body" label="Body text" />
          <ColorField k="color_background" label="Page background" />
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Support contact & footer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Field k="support_email" label="Support email" />
          <Field k="support_phone" label="Support phone" />
          <Field k="address" label="Postal address" />
        </CardContent>
      </Card>

      <div className="md:col-span-2 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save theme
        </Button>
      </div>
    </div>
  );
}

// ─── Deliverability ───────────────────────────────────────────────

function DeliverabilityPanel() {
  const getFn = useServerFn(getDeliverabilityStats);
  const stats = useQuery({ queryKey: ["email-deliverability"], queryFn: () => getFn() });

  if (stats.isLoading) return <Skeleton className="h-64 w-full" />;
  const s: any = stats.data ?? {};

  const bouncePct = (s.bounce_rate * 100) || 0;
  const complaintPct = (s.complaint_rate * 100) || 0;
  const healthColor = (v: number, warn: number, bad: number) =>
    v >= bad ? "text-destructive" : v >= warn ? "text-amber-500" : "text-emerald-500";
  const Icon = (v: number, warn: number, bad: number) =>
    v >= bad ? XCircle : v >= warn ? AlertTriangle : CheckCircle2;

  const BounceIcon = Icon(bouncePct, 3, 10);
  const ComplaintIcon = Icon(complaintPct, 0.1, 0.5);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Sent (30d)" value={s.sent ?? 0} />
        <StatCard label="Bounced" value={s.bounced ?? 0} accent="text-orange-500" />
        <StatCard label="Complaints" value={s.complained ?? 0} accent="text-pink-500" />
        <StatCard label="Suppressed" value={s.suppressed ?? 0} accent="text-yellow-500" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
            <BounceIcon className={`h-4 w-4 ${healthColor(bouncePct, 3, 10)}`} />
            Bounce rate
          </CardTitle></CardHeader>
          <CardContent>
            <div className={`text-3xl font-semibold ${healthColor(bouncePct, 3, 10)}`}>{bouncePct.toFixed(2)}%</div>
            <div className="text-xs text-muted-foreground mt-1">Healthy &lt; 3%. Above 10% risks blocking.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
            <ComplaintIcon className={`h-4 w-4 ${healthColor(complaintPct, 0.1, 0.5)}`} />
            Complaint rate
          </CardTitle></CardHeader>
          <CardContent>
            <div className={`text-3xl font-semibold ${healthColor(complaintPct, 0.1, 0.5)}`}>{complaintPct.toFixed(2)}%</div>
            <div className="text-xs text-muted-foreground mt-1">Healthy &lt; 0.1%. Above 0.5% risks blocking.</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent events</CardTitle>
          <CardDescription>Latest 20 delivery events (see Email Logs for full history).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {(s.recent ?? []).map((e: any, i: number) => (
              <div key={i} className="py-2 text-sm flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="uppercase text-[10px]">{e.event_type}</Badge>
                  <span className="text-muted-foreground truncate max-w-[280px]">{e.recipient}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {e.created_at ? new Date(e.created_at).toLocaleString() : ""}
                </div>
              </div>
            ))}
            {(s.recent ?? []).length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">No events yet.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-3xl font-semibold mt-1 ${accent ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
