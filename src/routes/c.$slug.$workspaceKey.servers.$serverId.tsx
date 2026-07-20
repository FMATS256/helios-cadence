import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getWorkspaceServer,
  workspaceServerPower,
  workspaceResetRootPassword,
  getWorkspaceContext,
  listWorkspaceSshKeys,
  addWorkspaceSshKey,
  removeWorkspaceSshKey,
} from "@/lib/portal.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Power, RotateCw, PowerOff, KeyRound, Terminal, ShieldCheck,
  Cpu, MemoryStick, HardDrive, Key, Trash2, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/c/$slug/$workspaceKey/servers/$serverId")({
  component: ServerDetail,
});

function ServerDetail() {
  const { slug, workspaceKey, serverId } = Route.useParams();
  const ctxFn = useServerFn(getWorkspaceContext);
  const { data: ctx } = useQuery({ queryKey: ["ws-ctx", slug, workspaceKey], queryFn: () => ctxFn({ data: { slug, workspaceKey } }) });
  const workspaceId = (ctx as any)?.workspace?.id;
  const canManage = ["owner", "admin", "developer"].includes((ctx as any)?.myRole ?? "") || (ctx as any)?.isStaff;
  const canAdmin = ["owner", "admin"].includes((ctx as any)?.myRole ?? "") || (ctx as any)?.isStaff;

  const fn = useServerFn(getWorkspaceServer);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["ws-server", workspaceId, serverId],
    queryFn: () => fn({ data: { workspaceId, serverId } }),
    enabled: !!workspaceId,
    refetchInterval: 15_000,
  });

  const powerFn = useServerFn(workspaceServerPower);
  const power = useMutation({
    mutationFn: (action: "on" | "off" | "reboot") => powerFn({ data: { workspaceId, serverId, action } }),
    onSuccess: (_r, action) => { toast.success(`Server ${action}`); qc.invalidateQueries({ queryKey: ["ws-server", workspaceId, serverId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetFn = useServerFn(workspaceResetRootPassword);
  const [reveal, setReveal] = useState<string | null>(null);
  const reset = useMutation({
    mutationFn: () => resetFn({ data: { workspaceId, serverId } }),
    onSuccess: (r: any) => { setReveal(r.password); toast.success("Root password rotated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading server…</p>;
  const s: any = (data as any).server;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs tracking-widest text-muted-foreground uppercase">Server</p>
              <h1 className="text-2xl font-display font-bold">{(data as any).display_name}</h1>
              <div className="mt-1 flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
                <Badge variant="outline">{s.image ?? "OS"}</Badge>
                <Badge variant="outline">{s.datacenter ?? "region"}</Badge>
                <Badge variant="outline" className={s.power_state === "on" ? "border-green-500/40 text-green-500" : ""}>{s.power_state}</Badge>
                <span className="font-mono">{(s.public_ips ?? [])[0] ?? "—"}</span>
              </div>
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => power.mutate("on")} disabled={s.power_state === "on" || power.isPending}><Power className="h-4 w-4 mr-1.5" />Start</Button>
                <Button size="sm" variant="outline" onClick={() => power.mutate("reboot")} disabled={power.isPending}><RotateCw className="h-4 w-4 mr-1.5" />Reboot</Button>
                <Button size="sm" variant="destructive" onClick={() => power.mutate("off")} disabled={s.power_state !== "on" || power.isPending}><PowerOff className="h-4 w-4 mr-1.5" />Stop</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Spec icon={<Cpu className="h-4 w-4" />} label="vCPU cores" value={String(s.cpu_cores ?? "?")} />
        <Spec icon={<MemoryStick className="h-4 w-4" />} label="RAM" value={`${((s.ram_mb ?? 0) / 1024).toFixed(1)} GB`} />
        <Spec icon={<HardDrive className="h-4 w-4" />} label="Storage" value={`${(s.disk_sizes_gb ?? []).reduce((a: number, b: number) => a + b, 0)} GB`} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-solar" /> Access & Security</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {canAdmin && (
              <Button variant="outline" size="sm" onClick={() => reset.mutate()} disabled={reset.isPending}>
                <KeyRound className="h-4 w-4 mr-1.5" /> {reset.isPending ? "Rotating…" : "Rotate root password"}
              </Button>
            )}
            <Button variant="outline" size="sm" disabled title="Console coming soon"><Terminal className="h-4 w-4 mr-1.5" />Browser console</Button>
          </div>
          {reveal && (
            <div className="rounded-lg border border-solar/40 bg-solar/10 p-4">
              <p className="text-xs uppercase tracking-widest text-solar mb-1">One-time reveal</p>
              <p className="font-mono text-sm break-all">{reveal}</p>
              <p className="text-xs text-muted-foreground mt-2">Saved to your credential vault. Copy it now — it will not be shown again.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Networking</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Public IPs: </span><span className="font-mono">{(s.public_ips ?? []).join(", ") || "—"}</span></div>
          <div><span className="text-muted-foreground">Private IPs: </span><span className="font-mono">{(s.private_ips ?? []).join(", ") || "—"}</span></div>
        </CardContent>
      </Card>

      <SshKeysCard workspaceId={workspaceId} canManage={canManage} canAdmin={canAdmin} />
    </div>
  );
}

function Spec({ icon, label, value }: any) {
  return (
    <Card><CardContent className="p-5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-widest">{icon}<span>{label}</span></div>
      <div className="mt-2 text-3xl font-display font-bold">{value}</div>
    </CardContent></Card>
  );
}

function SshKeysCard({ workspaceId, canManage, canAdmin }: { workspaceId?: string; canManage: boolean; canAdmin: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listWorkspaceSshKeys);
  const addFn = useServerFn(addWorkspaceSshKey);
  const removeFn = useServerFn(removeWorkspaceSshKey);
  const { data: keys, isLoading } = useQuery({
    queryKey: ["ws-ssh-keys", workspaceId],
    queryFn: () => listFn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [publicKey, setPublicKey] = useState("");

  const add = useMutation({
    mutationFn: () => addFn({ data: { workspaceId: workspaceId!, name, publicKey } }),
    onSuccess: () => {
      toast.success("SSH key added");
      setName(""); setPublicKey(""); setShowAdd(false);
      qc.invalidateQueries({ queryKey: ["ws-ssh-keys", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (keyId: string) => removeFn({ data: { workspaceId: workspaceId!, keyId } }),
    onSuccess: () => {
      toast.success("SSH key removed");
      qc.invalidateQueries({ queryKey: ["ws-ssh-keys", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Key className="h-4 w-4 text-solar" /> SSH Keys
        </CardTitle>
        {canManage && !showAdd && (
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add key
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {showAdd && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ssh-name">Key name</Label>
              <Input id="ssh-name" placeholder="e.g. My laptop" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ssh-key">Public key</Label>
              <Textarea
                id="ssh-key"
                rows={4}
                placeholder="ssh-ed25519 AAAAC3Nz... user@host"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Paste the contents of your <span className="font-mono">.pub</span> file. New keys apply to servers on next reinstall or via manual injection.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending || !name || !publicKey}>
                {add.isPending ? "Adding…" : "Add key"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setName(""); setPublicKey(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading keys…</p>
        ) : !keys || keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No SSH keys yet. Add one to enable key-based access.</p>
        ) : (
          <ul className="divide-y">
            {keys.map((k: any) => (
              <li key={k.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{k.name}</span>
                    {k.fingerprint && (
                      <Badge variant="outline" className="font-mono text-[10px]">{k.fingerprint}</Badge>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground break-all line-clamp-2">
                    {k.public_key}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Added {new Date(k.created_at).toLocaleString()}
                  </p>
                </div>
                {canAdmin && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => { if (confirm(`Remove SSH key "${k.name}"?`)) remove.mutate(k.id); }}
                    disabled={remove.isPending}
                    aria-label="Remove key"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
