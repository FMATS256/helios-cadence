import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRightLeft, CheckCircle2, Circle, Globe2, Plus, ServerCog } from "lucide-react";
import { DetailCard, StatusBadge, EmptyState } from "@/components/enterprise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  listMigrations, startMigration, advanceMigration, checkMigrationDns, markMigrationTargetCreated,
} from "@/lib/hosting-migration.functions";
import { provisionHostingAccount } from "@/lib/hosting.functions";
import { MIGRATION_STAGES, MIGRATION_TYPES, stageIndex, nextStage, type MigrationType } from "@/lib/hosting-migration";

export function HostingMigrationWorkbench({ customers, onChanged }: { customers: any[]; onChanged: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMigrations);
  const q = useQuery({ queryKey: ["hosting-migrations"], queryFn: () => listFn() });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["hosting-migrations"] }); onChanged(); };
  const rows = (q.data ?? []) as any[];
  const active = rows.filter((r) => r.status !== "cancelled");

  return (
    <DetailCard
      title="Migrations from other providers"
      action={<NewMigrationDialog customers={customers} onDone={refresh} />}
    >
      {active.length === 0 ? (
        <EmptyState icon={ArrowRightLeft} title="No migrations in progress"
          description="Start a migration when a client moves their website or email to IMT." />
      ) : (
        <div className="space-y-4">{active.map((r) => <MigrationCard key={r.id} row={r} onDone={refresh} />)}</div>
      )}
    </DetailCard>
  );
}

function MigrationCard({ row, onDone }: { row: any; onDone: () => void }) {
  const m = row.migration;
  const advanceFn = useServerFn(advanceMigration);
  const dnsFn = useServerFn(checkMigrationDns);
  const provFn = useServerFn(provisionHostingAccount);
  const markFn = useServerFn(markMigrationTargetCreated);
  const [note, setNote] = useState("");
  const idx = stageIndex(m.stage);
  const nxt = nextStage(m.stage);
  const done = m.stage === "completed";

  const advance = useMutation({
    mutationFn: (to?: any) => advanceFn({ data: { id: row.id, to, note: note || null } }),
    onSuccess: () => { setNote(""); toast.success("Migration updated"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const provision = useMutation({
    mutationFn: async () => { await provFn({ data: { id: row.id, plan: row.plan } }); await markFn({ data: { id: row.id } }); },
    onSuccess: () => { toast.success("cPanel account created — password saved in the Vault"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const dns = useMutation({
    mutationFn: () => dnsFn({ data: { id: row.id } }),
    onSuccess: (r) => { toast[r.points_to_imt ? "success" : "warning"](r.points_to_imt ? "Domain now points to IMT" : "Domain still points to the old host"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold flex items-center gap-2"><Globe2 className="h-4 w-4 text-primary" />{row.domain}</div>
          <div className="text-xs text-muted-foreground">
            {row.customers?.company_name ?? row.account_number} · {MIGRATION_TYPES[m.type as MigrationType]?.label} · from {m.source_provider || "other provider"}
            {row.username ? ` · cPanel user ${row.username}` : ""}
          </div>
        </div>
        <StatusBadge tone={done ? "success" : "info"}>{MIGRATION_STAGES[idx]?.label}</StatusBadge>
      </div>

      <ol className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        {MIGRATION_STAGES.map((s, i) => (
          <li key={s.key} className={`rounded-md p-2 text-xs ${i <= idx ? "bg-primary/10 text-foreground" : "bg-muted text-muted-foreground"}`}>
            <div className="flex items-center gap-1 font-medium">
              {i <= idx ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Circle className="h-3.5 w-3.5" />}{s.label}
            </div>
          </li>
        ))}
      </ol>

      {!done && (
        <>
          <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
            <div className="font-medium">{nxt ? `Next: ${MIGRATION_STAGES[idx + 1].hint}` : ""}</div>
            <ul className="list-disc pl-4 text-muted-foreground">
              {MIGRATION_TYPES[m.type as MigrationType]?.steps.map((s) => <li key={s}>{s}</li>)}
            </ul>
            {m.mailboxes?.length ? <div className="text-muted-foreground">Mailboxes: {m.mailboxes.join(", ")}</div> : null}
          </div>

          {m.dns && (
            <div className="text-xs grid sm:grid-cols-3 gap-2">
              <div><span className="text-muted-foreground">A:</span> {m.dns.a.join(", ") || "—"}</div>
              <div><span className="text-muted-foreground">MX:</span> {m.dns.mx.join(", ") || "—"}</div>
              <div><span className="text-muted-foreground">NS:</span> {m.dns.ns.join(", ") || "—"}</div>
              <div className="sm:col-span-3">
                <StatusBadge tone={m.dns.points_to_imt ? "success" : "warning"}>
                  {m.dns.points_to_imt ? "Points to IMT" : "Still on old host"}
                </StatusBadge>
                <span className="ml-2 text-muted-foreground">checked {new Date(m.dns.checked_at).toLocaleString()}</span>
              </div>
            </div>
          )}

          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for this step (optional)" className="h-9" />
          <div className="flex flex-wrap gap-2">
            {row.provisioning_status !== "whm" ? (
              <Button size="sm" onClick={() => provision.mutate()} disabled={provision.isPending}>
                <ServerCog className="h-4 w-4 mr-1" />{provision.isPending ? "Creating…" : "Create account on server"}
              </Button>
            ) : null}
            {nxt && nxt !== "target_created" && (
              <Button size="sm" variant="secondary" onClick={() => advance.mutate(undefined)} disabled={advance.isPending}>
                Mark “{MIGRATION_STAGES[idx + 1].label}” done
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => dns.mutate()} disabled={dns.isPending}>
              {dns.isPending ? "Checking…" : "Check DNS"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => advance.mutate("cancelled")} disabled={advance.isPending}>Cancel</Button>
          </div>
        </>
      )}
    </div>
  );
}

function NewMigrationDialog({ customers, onDone }: { customers: any[]; onDone: () => void }) {
  const fn = useServerFn(startMigration);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ customer_id: "", domain: "", type: "cpanel_full" as MigrationType, source_provider: "", plan: "Web Starter", mailboxes: "" });
  const m = useMutation({
    mutationFn: () => fn({ data: { ...f, mailboxes: f.mailboxes.split(/[\s,;]+/) } }),
    onSuccess: () => { setOpen(false); toast.success("Migration started"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New migration</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Move a client to IMT hosting</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Client</Label>
            <Select value={f.customer_id} onValueChange={(v) => setF({ ...f, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Choose client" /></SelectTrigger>
              <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.company_name} {c.account_number ? `(${c.account_number})` : ""}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>Domain</Label><Input value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} placeholder="client.co.zw" /></div>
          <div><Label>What are we moving?</Label>
            <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v as MigrationType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(MIGRATION_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>Current provider</Label><Input value={f.source_provider} onChange={(e) => setF({ ...f, source_provider: e.target.value })} placeholder="e.g. Web4Africa, GoDaddy" /></div>
          <div><Label>IMT package</Label>
            <Select value={f.plan} onValueChange={(v) => setF({ ...f, plan: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["Web Starter", "Web Business", "Web Pro", "Web Enterprise", "Mail Starter", "Mail Business", "Mail Pro"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>Mailboxes to move (optional)</Label><Textarea rows={2} value={f.mailboxes} onChange={(e) => setF({ ...f, mailboxes: e.target.value })} placeholder="info@client.co.zw, accounts@client.co.zw" /></div>
        </div>
        <DialogFooter><Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Starting…" : "Start migration"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
