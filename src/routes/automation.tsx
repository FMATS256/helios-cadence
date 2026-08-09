import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell, SectionHeader, StatChipRow, DataGrid, StatusBadge, RefreshButton, ActionBtn } from "@/components/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAutomationConsole, updateAutomationRule, runAutomationNow } from "@/lib/automation.functions";
import { Play, Save, Zap } from "lucide-react";

export const Route = createFileRoute("/automation")({
  head: () => ({
    meta: [
      { title: "Automation & Alerts — IMT Operations" },
      { name: "description", content: "Configure renewal reminders, overdue escalation, auto-suspend, monitoring and SLA alerts, and the scheduled operations digest." },
      { property: "og:title", content: "Automation & Alerts — IMT Operations" },
      { property: "og:description", content: "Rule engine for reminders, escalations and scheduled reporting." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AutomationPage,
});

function AutomationPage() {
  const qc = useQueryClient();
  const load = useServerFn(getAutomationConsole);
  const update = useServerFn(updateAutomationRule);
  const runNow = useServerFn(runAutomationNow);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const { data, isFetching, refetch } = useQuery({ queryKey: ["automation-console"], queryFn: () => load({}) });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["automation-console"] });

  const save = useMutation({
    mutationFn: (v: { rule: string; config: Record<string, any> }) => update({ data: v }),
    onSuccess: () => { toast.success("Automation rule updated"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Could not update the rule"),
  });

  const trigger = useMutation({
    mutationFn: (rule?: string) => runNow({ data: rule ? { rule } : {} }),
    onSuccess: (r: any) => {
      toast.success(`Automation finished — ${r.totals.notified} alerts, ${r.totals.emailed} emails, ${r.totals.actioned} actions`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Automation run failed"),
  });

  const rules = data?.rules ?? [];
  const runs = data?.runs ?? [];
  const enabled = rules.filter((r: any) => r.config?.enabled).length;
  const errors = runs.filter((r: any) => r.status === "error").length;
  const emails = runs.reduce((s: number, r: any) => s + Number(r.emailed || 0), 0);
  const alerts = runs.reduce((s: number, r: any) => s + Number(r.notified || 0), 0);

  const numberList = (v: any) => (Array.isArray(v) ? v.join(", ") : String(v ?? ""));
  const parseList = (s: string) => s.split(/[,\s]+/).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);

  return (
    <PageShell>
      <SectionHeader
        eyebrow="System"
        title="Automation & Alerts"
        description="Scheduled rules that chase renewals and invoices, escalate overdue accounts, alert on monitoring and SLA risk, and deliver the operations digest."
        actions={
          <div className="flex gap-2">
            <ActionBtn tone="indigo" icon={Play} label="Run all rules now" onClick={() => trigger.mutate(undefined)} disabled={trigger.isPending} />
            <RefreshButton onClick={() => void refetch()} loading={isFetching} />
          </div>
        }
      />

      <StatChipRow
        cols={4}
        chips={[
          { label: "Active rules", value: `${enabled}/${rules.length}`, color: "#0f766e" },
          { label: "Alerts raised", value: alerts, color: "#1d4ed8" },
          { label: "Emails sent", value: emails, color: "#7c3aed" },
          { label: "Failed runs", value: errors, color: errors ? "#b91c1c" : "#334155" },
        ]}
      />

      <div className="grid gap-3 md:grid-cols-2">
        {rules.map((r: any) => {
          const cfg = r.config ?? {};
          return (
            <Card key={r.key}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display font-bold">{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{r.description}</p>
                  </div>
                  <Switch
                    checked={Boolean(cfg.enabled)}
                    onCheckedChange={(v) => save.mutate({ rule: r.key, config: { enabled: v } })}
                  />
                </div>

                {r.key === "renewal_reminders" && (
                  <ConfigField
                    label="Notice days before renewal"
                    value={draft[r.key] ?? numberList(cfg.days)}
                    onChange={(v) => setDraft((d) => ({ ...d, [r.key]: v }))}
                    onSave={(v) => save.mutate({ rule: r.key, config: { days: parseList(v) } })}
                  />
                )}
                {r.key === "invoice_reminders" && (
                  <ConfigField
                    label="Reminder days before due date"
                    value={draft[r.key] ?? numberList(cfg.before_days)}
                    onChange={(v) => setDraft((d) => ({ ...d, [r.key]: v }))}
                    onSave={(v) => save.mutate({ rule: r.key, config: { before_days: parseList(v) } })}
                  />
                )}
                {r.key === "overdue_escalation" && (
                  <ConfigField
                    label="Chase on days past due"
                    value={draft[r.key] ?? numberList(cfg.chase_days)}
                    onChange={(v) => setDraft((d) => ({ ...d, [r.key]: v }))}
                    onSave={(v) => save.mutate({ rule: r.key, config: { chase_days: parseList(v) } })}
                  />
                )}
                {r.key === "auto_suspend" && (
                  <ConfigField
                    label="Grace period (days past due)"
                    value={draft[r.key] ?? String(cfg.grace_days ?? 30)}
                    onChange={(v) => setDraft((d) => ({ ...d, [r.key]: v }))}
                    onSave={(v) => save.mutate({ rule: r.key, config: { grace_days: Number(v) || 30 } })}
                  />
                )}
                {r.key === "sla_alerts" && (
                  <ConfigField
                    label="Warn this many minutes before SLA"
                    value={draft[r.key] ?? String(cfg.warn_minutes ?? 120)}
                    onChange={(v) => setDraft((d) => ({ ...d, [r.key]: v }))}
                    onSave={(v) => save.mutate({ rule: r.key, config: { warn_minutes: Number(v) || 120 } })}
                  />
                )}
                {r.key === "report_digest" && (
                  <ConfigField
                    label="Digest recipients (comma separated)"
                    value={draft[r.key] ?? (cfg.recipients ?? []).join(", ")}
                    onChange={(v) => setDraft((d) => ({ ...d, [r.key]: v }))}
                    onSave={(v) =>
                      save.mutate({
                        rule: r.key,
                        config: { recipients: v.split(/[,\s]+/).filter((x) => x.includes("@")) },
                      })
                    }
                  />
                )}

                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-muted-foreground">
                    {r.last_run
                      ? `Last run ${new Date(r.last_run.created_at).toLocaleString()} · ${r.last_run.status}`
                      : "Never run"}
                  </p>
                  <ActionBtn tone="sky" icon={Zap} label="Run now" onClick={() => trigger.mutate(r.key)} disabled={trigger.isPending} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b border-border">
            <p className="font-display font-bold">Run history</p>
            <p className="text-xs text-muted-foreground mt-0.5">Most recent automation executions and what they changed.</p>
          </div>
          <DataGrid
            rows={runs as any[]}
            loading={isFetching && !data}
            columns={[
              { header: "When", cell: (r: any) => new Date(r.created_at).toLocaleString() },
              { header: "Rule", cell: (r: any) => r.rule },
              { header: "Trigger", cell: (r: any) => r.trigger },
              { header: "Status", cell: (r: any) => <StatusBadge tone={r.status === "error" ? "danger" : r.status === "skipped" ? "neutral" : "success"}>{r.status}</StatusBadge> },
              { header: "Processed", align: "right", cell: (r: any) => r.processed },
              { header: "Alerts", align: "right", cell: (r: any) => r.notified },
              { header: "Emails", align: "right", cell: (r: any) => r.emailed },
              { header: "Actions", align: "right", cell: (r: any) => r.actioned },
              { header: "Detail", cell: (r: any) => r.error ?? "—" },
            ] as any}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}

function ConfigField({
  label, value, onChange, onSave,
}: { label: string; value: string; onChange: (v: string) => void; onSave: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
        <ActionBtn tone="emerald" icon={Save} label="Save" onClick={() => onSave(value)} />
      </div>
    </div>
  );
}
