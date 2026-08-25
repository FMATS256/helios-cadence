import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, DetailCard, StatusBadge,
  RefreshButton, EmptyState, shortDate,
} from "@/components/enterprise";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KeyRound, Lock, Unlock, Eye, ShieldAlert } from "lucide-react";
import { vaultOverview, vaultSession, requestVaultStepUp, lockVault } from "@/lib/vault.functions";
import { revealCredential } from "@/lib/credentials.functions";

export const Route = createFileRoute("/techops/vault")({
  head: () => ({
    meta: [
      { title: "Credential Vault — IMT Technical Operations" },
      { name: "description", content: "Role-gated encrypted credential vault with password step-up, rotation hygiene and a full reveal audit trail." },
      { property: "og:title", content: "Credential Vault — IMT Technical Operations" },
      { property: "og:description", content: "Encrypted secrets with step-up unlock and audited reveals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VaultPage,
});

const hygieneTone = (h: string) =>
  h === "expired" ? "danger" : h === "expiring" ? "warning" : h === "stale" ? "solar" : "success";

function VaultPage() {
  const qc = useQueryClient();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState<{ name: string; secret: string } | null>(null);

  const sessionFn = useServerFn(vaultSession);
  const overviewFn = useServerFn(vaultOverview);
  const stepUpFn = useServerFn(requestVaultStepUp);
  const lockFn = useServerFn(lockVault);
  const revealFn = useServerFn(revealCredential);

  const { data: session } = useQuery({
    queryKey: ["vault-session"],
    queryFn: async () => (await sessionFn()) as any,
    refetchInterval: 60_000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["vault-overview"],
    queryFn: async () => (await overviewFn()) as any,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["vault-overview"] });
    qc.invalidateQueries({ queryKey: ["vault-session"] });
  };

  const unlock = useMutation({
    mutationFn: () => stepUpFn({ data: { password } }),
    onSuccess: (r: any) => {
      toast.success(`Vault unlocked for ${r?.minutes ?? 10} minutes`);
      setPassword(""); setUnlockOpen(false); refresh();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const relock = useMutation({
    mutationFn: () => lockFn(),
    onSuccess: () => { toast.success("Vault locked"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const reveal = useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      revealFn({ data: { id: v.id } }).then((r: any) => ({ ...r, name: v.name })),
    onSuccess: (r: any) => { setRevealed({ name: r.name, secret: r.secret }); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const stats = data?.stats ?? { total: 0, expired: 0, expiring: 0, stale: 0, reveals7d: 0 };
  const unlocked = !!session?.stepUpActive;
  const creds = (data?.credentials ?? []) as any[];

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Technical Operations"
        title="Credential Vault"
        description={
          session?.canReveal
            ? unlocked
              ? `Unlocked until ${new Date(session.stepUpExpiresAt).toLocaleTimeString()}`
              : "Locked — re-enter your password to reveal secrets"
            : "Your role cannot reveal secret material"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {session?.canReveal && (unlocked ? (
              <Button variant="outline" onClick={() => relock.mutate()} disabled={relock.isPending}>
                <Lock className="mr-2 h-4 w-4" /> Lock vault
              </Button>
            ) : (
              <Button onClick={() => setUnlockOpen(true)}>
                <Unlock className="mr-2 h-4 w-4" /> Unlock vault
              </Button>
            ))}
            <RefreshButton onClick={refresh} loading={isFetching} />
          </div>
        }
      />

      <StatChipRow
        cols={5}
        chips={[
          { label: "Credentials", value: stats.total, color: "#4f46e5" },
          { label: "Expired", value: stats.expired, color: "#e11d48" },
          { label: "Expiring 30d", value: stats.expiring, color: "#f59e0b" },
          { label: "Stale 180d", value: stats.stale, color: "#f97316" },
          { label: "Reveals 7d", value: stats.reveals7d, color: "#0ea5e9" },
        ]}
      />

      <Tabs defaultValue="credentials">
        <TabsList>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="hygiene">Hygiene</TabsTrigger>
          <TabsTrigger value="audit">Access log</TabsTrigger>
        </TabsList>

        <TabsContent value="credentials" className="mt-4">
          <DetailCard title="Vault entries" padded={false}>
            <DataGrid
              loading={isLoading}
              rows={creds}
              columns={[
                { header: "Name", cell: (r: any) => <span className="font-medium">{r.name}</span> },
                { header: "Type", cell: (r: any) => r.credential_type ?? "—" },
                { header: "Username", cell: (r: any) => r.username ?? "—" },
                { header: "Account", cell: (r: any) => r.account_number ?? "—" },
                { header: "Hygiene", cell: (r: any) => <StatusBadge tone={hygieneTone(r.hygiene) as any}>{r.hygiene}</StatusBadge> },
                { header: "Expires", cell: (r: any) => shortDate(r.expires_at) },
                {
                  header: "", align: "right",
                  cell: (r: any) => (
                    <Button
                      size="sm" variant="outline"
                      disabled={!unlocked || reveal.isPending}
                      onClick={() => reveal.mutate({ id: r.id, name: r.name })}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" /> Reveal
                    </Button>
                  ),
                },
              ]}
              empty={<EmptyState icon={KeyRound} title="No credentials yet" description="Secrets added from Customer 360 or the credentials module appear here." />}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="hygiene" className="mt-4">
          <DetailCard title="Needs rotation" padded={false}>
            <DataGrid
              rows={creds.filter((c) => c.hygiene !== "healthy")}
              columns={[
                { header: "Name", cell: (r: any) => <span className="font-medium">{r.name}</span> },
                { header: "Issue", cell: (r: any) => <StatusBadge tone={hygieneTone(r.hygiene) as any}>{r.hygiene}</StatusBadge> },
                { header: "Age (days)", cell: (r: any) => r.ageDays },
                { header: "Expires in", cell: (r: any) => (r.expiresInDays === null ? "—" : `${r.expiresInDays} d`) },
              ]}
              empty={<EmptyState icon={ShieldAlert} title="All credentials healthy" description="Nothing expired, expiring or stale." />}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <DetailCard title="Reveal & access audit" padded={false}>
            <DataGrid
              rows={(data?.accessLog ?? []) as any[]}
              columns={[
                { header: "When", cell: (r: any) => new Date(r.created_at).toLocaleString() },
                { header: "Who", cell: (r: any) => r.actor },
                { header: "Credential", cell: (r: any) => r.credential },
                { header: "Action", cell: (r: any) => r.action },
              ]}
              empty={<EmptyState icon={Eye} title="No access recorded" description="Every reveal is logged here." />}
            />
          </DetailCard>
        </TabsContent>
      </Tabs>

      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Unlock the vault</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Your account password</Label>
            <Input
              type="password" value={password} autoFocus
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && password) unlock.mutate(); }}
            />
            <p className="text-xs text-muted-foreground">Grants a 10 minute window for revealing secrets. Every attempt is audited.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockOpen(false)}>Cancel</Button>
            <Button onClick={() => unlock.mutate()} disabled={!password || unlock.isPending}>Unlock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{revealed?.name}</DialogTitle></DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 font-mono text-sm break-all">{revealed?.secret}</div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(revealed?.secret ?? ""); toast.success("Copied"); }}
            >Copy</Button>
            <Button onClick={() => setRevealed(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
