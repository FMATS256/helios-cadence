import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Power, RotateCw, PowerOff, Camera, Undo2, HardDriveDownload, Package, Copy, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/page";
import { SERVER_APPS } from "@/lib/server-apps";
import {
  serverPower, listProviderSnapshots, takeProviderSnapshot, requestServerAction, decideServerAction,
} from "@/lib/server-tools.functions";

const LABEL: Record<string, string> = { rebuild: "Rebuild (wipe & reinstall)", restore_snapshot: "Restore snapshot", install_app: "Install app (wipes server)" };

export function ServerApprovals({ serverId }: { serverId?: string }) {
  const qc = useQueryClient();
  const decide = useServerFn(decideServerAction);
  const reqs = useQuery({
    queryKey: ["server_action_requests", serverId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("server_action_requests").select("*, cloud_servers(name)").order("created_at", { ascending: false }).limit(30);
      if (serverId) q = q.eq("server_id", serverId); else q = q.eq("status", "pending");
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });
  const run = async (id: string, decision: "approve" | "reject") => {
    try {
      const r = await decide({ data: { request_id: id, decision } });
      if (r.ok === false) toast.error(r.error); else toast.success(decision === "approve" ? "Approved and sent to the provider" : "Rejected");
    } catch (e: any) { toast.error(e.message); }
    qc.invalidateQueries({ queryKey: ["server_action_requests"] });
  };
  const rows = reqs.data ?? [];
  if (!serverId && !rows.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Requests needing manager approval</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {!rows.length && <p className="text-sm text-muted-foreground">No requests yet.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 border p-2 text-sm">
            <span className="font-medium">{LABEL[r.action]}</span>
            {r.params?.app && <span className="text-muted-foreground">· {r.params.app}</span>}
            {!serverId && <span className="text-muted-foreground">· {r.cloud_servers?.name}</span>}
            <StatusPill tone={r.status === "completed" ? "success" : r.status === "failed" || r.status === "rejected" ? "danger" : "warning"}>{r.status}</StatusPill>
            <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
            {r.reason && <span className="w-full text-xs text-muted-foreground">Reason: {r.reason}</span>}
            {r.error && <span className="w-full text-xs text-destructive">{r.error}</span>}
            {r.status === "pending" && (
              <div className="ml-auto flex gap-1">
                <Button size="sm" onClick={() => run(r.id, "approve")}><Check className="h-3.5 w-3.5 mr-1" />Approve</Button>
                <Button size="sm" variant="outline" onClick={() => run(r.id, "reject")}><X className="h-3.5 w-3.5 mr-1" />Reject</Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ServerToolsPanel({ server }: { server: any }) {
  const qc = useQueryClient();
  const power = useServerFn(serverPower);
  const listSnaps = useServerFn(listProviderSnapshots);
  const snap = useServerFn(takeProviderSnapshot);
  const request = useServerFn(requestServerAction);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [snapId, setSnapId] = useState("");
  const [app, setApp] = useState("");
  const snaps = useQuery({ queryKey: ["provider_snapshots", server.id], queryFn: () => listSnaps({ data: { server_id: server.id } }) });

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); } catch (e: any) { toast.error(e.message); }
    setBusy(null);
    qc.invalidateQueries({ queryKey: ["cloud_server", server.id] });
    qc.invalidateQueries({ queryKey: ["provider_snapshots", server.id] });
    qc.invalidateQueries({ queryKey: ["server_action_requests"] });
  };
  const ask = (action: "rebuild" | "restore_snapshot" | "install_app", params?: any) =>
    act(action, () => request({ data: { server_id: server.id, action, params, reason } }), "Request sent for manager approval");
  const selectedApp = SERVER_APPS.find((a) => a.key === app);
  const vultr = server.provider === "vultr";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Power</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("on", () => power({ data: { server_id: server.id, action: "on" } }), "Start sent")}><Power className="h-3.5 w-3.5 mr-1" />Start</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("reboot", () => power({ data: { server_id: server.id, action: "reboot" } }), "Reboot sent")}><RotateCw className="h-3.5 w-3.5 mr-1" />Reboot</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => { if (confirm("Shut this server down? Clients lose access until it is started.")) act("off", () => power({ data: { server_id: server.id, action: "off" } }), "Shutdown sent"); }}><PowerOff className="h-3.5 w-3.5 mr-1" />Shut down</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Snapshots</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!vultr && <p className="text-sm text-muted-foreground">Snapshots, rebuilds and app installs work on Vultr servers. For {server.provider}, use the provider's panel.</p>}
          <Button size="sm" disabled={!vultr || !!busy} onClick={() => act("snap", () => snap({ data: { server_id: server.id } }), "Snapshot started")}><Camera className="h-3.5 w-3.5 mr-1" />Take snapshot now</Button>
          <div className="space-y-1">
            {(snaps.data?.snapshots ?? []).map((s: any) => (
              <div key={s.id} className="flex items-center gap-2 text-sm border p-2">
                <span className="flex-1 truncate">{s.notes}</span>
                <StatusPill tone={s.status === "completed" ? "success" : "warning"}>{s.status}</StatusPill>
                <Button size="sm" variant="outline" disabled={s.status !== "completed" || !!busy} onClick={() => { setSnapId(s.id); ask("restore_snapshot", { snapshot_id: s.id }); }}><Undo2 className="h-3.5 w-3.5 mr-1" />Request restore</Button>
              </div>
            ))}
            {snaps.data && !snaps.data.snapshots.length && <p className="text-xs text-muted-foreground">No provider snapshots yet.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Rebuild & one-click apps</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">These wipe the server, so a manager must approve. Take a snapshot first.</p>
          <Input placeholder="Reason (shown to the approver)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Select value={app} onValueChange={setApp}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Choose an app" /></SelectTrigger>
              <SelectContent>{SERVER_APPS.map((a) => <SelectItem key={a.key} value={a.key}>{a.label} — {a.os}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" disabled={!vultr || !app || !!busy} onClick={() => ask("install_app", { app })}><Package className="h-3.5 w-3.5 mr-1" />Request fresh install</Button>
            <Button size="sm" variant="outline" disabled={!app} onClick={() => { navigator.clipboard.writeText(selectedApp!.script); toast.success("Script copied — run it over SSH as root"); }}><Copy className="h-3.5 w-3.5 mr-1" />Copy script (no wipe)</Button>
            <Button size="sm" variant="destructive" disabled={!vultr || !!busy} onClick={() => ask("rebuild")}><HardDriveDownload className="h-3.5 w-3.5 mr-1" />Request rebuild</Button>
          </div>
          {selectedApp && <p className="text-xs text-muted-foreground">{selectedApp.description}</p>}
          {snapId && null}
        </CardContent>
      </Card>

      <ServerApprovals serverId={server.id} />
    </div>
  );
}
