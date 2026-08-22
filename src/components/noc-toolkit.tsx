import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { DataGrid, DetailCard, StatusBadge, toneForStatus, shortDate } from "@/components/enterprise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Globe, Network, Search, ShieldAlert, Mail, Plug, Power, RotateCw, RefreshCw, Pause, Play, KeyRound, Radar,
} from "lucide-react";
import { runNetworkDiagnostic, listRemoteTargets, type DiagTool } from "@/lib/netdiag.functions";
import { powerProviderServer, refreshProviderServer } from "@/lib/providers.functions";
import { hostingLifecycleAction, syncHosting } from "@/lib/hosting.functions";
import { syncVoipAccount } from "@/lib/voip.functions";
import { checkStarlinkAccount } from "@/lib/starlink.functions";

const TOOLS: { key: DiagTool; label: string; icon: any; tone: string; hint: string }[] = [
  { key: "http", label: "Reachability", icon: Globe, tone: "#0ea5e9", hint: "HTTP/HTTPS probe with latency" },
  { key: "dns", label: "DNS Records", icon: Network, tone: "#6366f1", hint: "A, AAAA, CNAME, MX, NS, TXT" },
  { key: "tcp", label: "Port Check", icon: Plug, tone: "#0d9488", hint: "TCP connect to a port" },
  { key: "whois", label: "WHOIS / RDAP", icon: Search, tone: "#a855f7", hint: "Domain or IP registry record" },
  { key: "blacklist", label: "Blacklist", icon: ShieldAlert, tone: "#e11d48", hint: "Spamhaus, SpamCop, Barracuda, SORBS" },
  { key: "mail", label: "Mail Health", icon: Mail, tone: "#f59e0b", hint: "MX, SPF and DMARC posture" },
];

export function DiagnosticsPanel() {
  const runFn = useServerFn(runNetworkDiagnostic);
  const [target, setTarget] = useState("");
  const [port, setPort] = useState("443");
  const [tool, setTool] = useState<DiagTool>("http");
  const [result, setResult] = useState<any | null>(null);

  const run = useMutation({
    mutationFn: (t: DiagTool) => runFn({ data: { tool: t, target, port: Number(port) || 443 } }) as Promise<any>,
    onSuccess: (r) => { setResult(r); r.ok ? toast.success(r.summary) : toast.warning(r.summary); },
    onError: (e: any) => toast.error(e?.message || "Diagnostic failed"),
  });

  const go = (t: DiagTool) => {
    if (!target.trim()) return toast.info("Enter a hostname, domain or IP first");
    setTool(t);
    run.mutate(t);
  };

  return (
    <div className="space-y-4">
      <DetailCard title="Network Diagnostics Toolkit">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label>Target host, domain, URL or IP</Label>
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go(tool)}
              placeholder="imtsolutions.co.zw or 41.79.x.x or https://portal.example.com"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5 sm:w-32">
            <Label>Port</Label>
            <Input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" className="h-11" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={run.isPending}
              onClick={() => go(t.key)}
              className="group rounded-xl border p-3 text-left transition hover:shadow-md disabled:opacity-60"
              style={{ borderColor: `${t.tone}44`, background: `${t.tone}0f` }}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${t.tone}22`, color: t.tone }}>
                  <t.icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold">{t.label}</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{t.hint}</p>
            </button>
          ))}
        </div>
      </DetailCard>

      <DetailCard title={run.isPending ? "Running…" : result ? `Result — ${result.tool} · ${result.target}` : "Result"}>
        {!result && !run.isPending && (
          <p className="text-sm text-muted-foreground">Pick a tool above to run a live check from the platform edge.</p>
        )}
        {run.isPending && <p className="text-sm text-muted-foreground">Probing {target}…</p>}
        {result && !run.isPending && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={result.ok ? "success" : "danger"}>{result.ok ? "pass" : "attention"}</StatusBadge>
              <span className="text-sm">{result.summary}</span>
            </div>
            {result.rows?.length > 0 && (
              <div className="overflow-hidden rounded-lg border">
                {result.rows.map((r: any, i: number) => (
                  <div key={i} className="flex gap-3 border-b px-3 py-2 text-sm last:border-b-0 odd:bg-muted/30">
                    <span className="w-40 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{r.label}</span>
                    <span className="break-all font-mono text-xs">{r.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DetailCard>
    </div>
  );
}

function ActionButtons({ items }: { items: { label: string; icon: any; onClick: () => void; disabled?: boolean; tone?: string }[] }) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {items.map((a) => (
        <Button key={a.label} size="sm" variant="outline" disabled={a.disabled} onClick={a.onClick} className="h-7 gap-1 px-2 text-xs">
          <a.icon className="h-3.5 w-3.5" style={a.tone ? { color: a.tone } : undefined} />
          {a.label}
        </Button>
      ))}
    </div>
  );
}

export function RemoteActionsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listRemoteTargets);
  const powerFn = useServerFn(powerProviderServer);
  const refreshSrvFn = useServerFn(refreshProviderServer);
  const hostingFn = useServerFn(hostingLifecycleAction);
  const hostingSyncFn = useServerFn(syncHosting);
  const voipSyncFn = useServerFn(syncVoipAccount);
  const starlinkFn = useServerFn(checkStarlinkAccount);

  const { data, isLoading } = useQuery({
    queryKey: ["noc-remote-targets"],
    queryFn: async () => (await listFn()) as any,
    refetchInterval: 120_000,
  });

  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["noc-remote-targets"] });
    qc.invalidateQueries({ queryKey: ["noc-overview"] });
  };

  const act = async (key: string, label: string, fn: () => Promise<any>) => {
    setBusy(key);
    try {
      await fn();
      toast.success(`${label} completed`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || `${label} failed`);
    } finally {
      setBusy(null);
    }
  };

  const servers: any[] = data?.servers ?? [];
  const hosting: any[] = data?.hosting ?? [];
  const voip: any[] = data?.voip ?? [];
  const starlink: any[] = data?.starlink ?? [];

  return (
    <div className="space-y-4">
      <DetailCard title="Cloud Servers — power & sync" padded={false}>
        <DataGrid
          rows={servers}
          loading={isLoading}
          empty="No cloud servers on record."
          columns={[
            { header: "Server", cell: (s: any) => <span className="font-medium">{s.name}</span> },
            { header: "Customer", cell: (s: any) => s.customers?.company_name ?? "—" },
            { header: "Provider", cell: (s: any) => s.provider ?? "—" },
            { header: "IP", cell: (s: any) => (s.public_ips?.[0] ?? "—") },
            { header: "Power", cell: (s: any) => <StatusBadge tone={toneForStatus(s.power_state ?? s.status)}>{s.power_state ?? s.status ?? "unknown"}</StatusBadge> },
            {
              header: "", align: "right",
              cell: (s: any) => (
                <ActionButtons
                  items={[
                    { label: "Start", icon: Play, tone: "#15803d", disabled: busy === s.id, onClick: () => act(s.id, "Power on", () => powerFn({ data: { server_id: s.id, action: "on" } })) },
                    { label: "Reboot", icon: RotateCw, tone: "#b45309", disabled: busy === s.id, onClick: () => act(s.id, "Reboot", () => powerFn({ data: { server_id: s.id, action: "reboot" } })) },
                    { label: "Stop", icon: Power, tone: "#b91c1c", disabled: busy === s.id, onClick: () => act(s.id, "Power off", () => powerFn({ data: { server_id: s.id, action: "off" } })) },
                    { label: "Sync", icon: RefreshCw, tone: "#1d4ed8", disabled: busy === s.id, onClick: () => act(s.id, "Provider sync", () => refreshSrvFn({ data: { server_id: s.id } })) },
                  ]}
                />
              ),
            },
          ]}
        />
      </DetailCard>

      <DetailCard title="Hosting Accounts — suspend, reset & sync" padded={false}>
        <DataGrid
          rows={hosting}
          loading={isLoading}
          empty="No hosting accounts on record."
          columns={[
            { header: "Domain", cell: (h: any) => <span className="font-medium">{h.domain}</span> },
            { header: "Customer", cell: (h: any) => h.customers?.company_name ?? "—" },
            { header: "Plan", cell: (h: any) => h.plan ?? "—" },
            { header: "Status", cell: (h: any) => <StatusBadge tone={toneForStatus(h.status)}>{h.status ?? "unknown"}</StatusBadge> },
            { header: "Synced", cell: (h: any) => shortDate(h.last_sync_at) },
            {
              header: "", align: "right",
              cell: (h: any) => (
                <ActionButtons
                  items={[
                    h.status === "suspended"
                      ? { label: "Unsuspend", icon: Play, tone: "#15803d", disabled: busy === h.id, onClick: () => act(h.id, "Unsuspend", () => hostingFn({ data: { id: h.id, action: "unsuspend" } })) }
                      : { label: "Suspend", icon: Pause, tone: "#b45309", disabled: busy === h.id, onClick: () => act(h.id, "Suspend", () => hostingFn({ data: { id: h.id, action: "suspend", reason: "NOC action" } })) },
                    { label: "Reset PW", icon: KeyRound, tone: "#7c3aed", disabled: busy === h.id, onClick: () => act(h.id, "Password reset", () => hostingFn({ data: { id: h.id, action: "reset_password" } })) },
                    { label: "Sync", icon: RefreshCw, tone: "#1d4ed8", disabled: busy === h.id, onClick: () => act(h.id, "WHM sync", () => hostingSyncFn({ data: { id: h.id } })) },
                  ]}
                />
              ),
            },
          ]}
        />
      </DetailCard>

      <DetailCard title="VoIP Accounts — balance sync" padded={false}>
        <DataGrid
          rows={voip}
          loading={isLoading}
          empty="No VoIP accounts on record."
          columns={[
            { header: "Number", cell: (v: any) => <span className="font-medium">{v.voip_number}</span> },
            { header: "Customer", cell: (v: any) => v.customers?.company_name ?? "—" },
            { header: "Balance", align: "right", cell: (v: any) => (v.balance_usd != null ? `$${Number(v.balance_usd).toFixed(2)}` : "—") },
            { header: "Status", cell: (v: any) => <StatusBadge tone={toneForStatus(v.status)}>{v.status ?? "unknown"}</StatusBadge> },
            { header: "Synced", cell: (v: any) => shortDate(v.last_synced_at) },
            {
              header: "", align: "right",
              cell: (v: any) => (
                <ActionButtons
                  items={[{ label: "Sync balance", icon: RefreshCw, tone: "#0d9488", disabled: busy === v.id, onClick: () => act(v.id, "VoIP sync", () => voipSyncFn({ data: { id: v.id } })) }]}
                />
              ),
            },
          ]}
        />
      </DetailCard>

      <DetailCard title="Starlink Terminals — status check" padded={false}>
        <DataGrid
          rows={starlink}
          loading={isLoading}
          empty="No Starlink accounts on record."
          columns={[
            { header: "Account", cell: (s: any) => <span className="font-medium">{s.starlink_account_number ?? s.account_number}</span> },
            { header: "Customer", cell: (s: any) => s.customers?.company_name ?? "—" },
            { header: "Kit", cell: (s: any) => s.kit_serial ?? "—" },
            { header: "Plan", cell: (s: any) => s.plan_type ?? "—" },
            { header: "Status", cell: (s: any) => <StatusBadge tone={toneForStatus(s.status)}>{s.status ?? "unknown"}</StatusBadge> },
            { header: "Checked", cell: (s: any) => shortDate(s.last_checked_at) },
            {
              header: "", align: "right",
              cell: (s: any) => (
                <ActionButtons
                  items={[{ label: "Check now", icon: Radar, tone: "#4338ca", disabled: busy === s.id, onClick: () => act(s.id, "Starlink check", () => starlinkFn({ data: { id: s.id } })) }]}
                />
              ),
            },
          ]}
        />
      </DetailCard>
    </div>
  );
}

export function DiagToolPicker({ value, onChange }: { value: DiagTool; onChange: (v: DiagTool) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DiagTool)}>
      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
      <SelectContent>
        {TOOLS.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
