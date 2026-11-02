import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listDnsRecords, saveDnsRecord } from "@/lib/dns-editor.functions";
import { validateDnsRecord, type DnsRecordInput } from "@/lib/dns-records";

type Draft = DnsRecordInput & { line?: number };
const blank: Draft = { type: "A", name: "@", value: "", priority: 10, ttl: 14400 };

export function DnsEditor({ hostingId, domain }: { hostingId: string; domain: string }) {
  const qc = useQueryClient();
  const fnList = useServerFn(listDnsRecords);
  const fnSave = useServerFn(saveDnsRecord);
  const [draft, setDraft] = useState<Draft>(blank);
  const key = ["dns_zone", hostingId];
  const recs = useQuery({ queryKey: key, queryFn: () => fnList({ data: { hostingId } }), retry: false });
  const save = useMutation({
    mutationFn: (v: { line?: number; remove?: boolean; record?: DnsRecordInput }) => fnSave({ data: { hostingId, ...v } }),
    onSuccess: (r) => { toast.success(r.summary); setDraft(blank); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: any) => toast.error(e.message),
  });
  const err = draft.value ? validateDnsRecord(draft) : null;
  const short = (n: string) => n.replace(/\.$/, "").replace(new RegExp(`\\.?${domain.replace(/\./g, "\\.")}$`), "") || "@";

  return (
    <div className="space-y-2 border-b p-3">
      <p className="text-xs text-muted-foreground">
        DNS zone for {domain} on our hosting server. NS records here only take effect if the domain's registrar points to our nameservers.
      </p>
      {recs.isLoading && <p className="text-sm text-muted-foreground">Loading records…</p>}
      {recs.error && <p className="text-sm text-destructive">{(recs.error as Error).message}</p>}
      {recs.data?.map((r) => (
        <div key={r.line} className="flex flex-wrap items-center justify-between gap-2 border p-2 text-sm">
          <span><span className="font-mono font-semibold">{r.type}</span> {short(r.name)} → <span className="font-mono">{r.priority != null ? `${r.priority} ` : ""}{r.value}</span> <span className="text-xs text-muted-foreground">TTL {r.ttl}</span></span>
          <span className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setDraft({ line: r.line, type: r.type, name: short(r.name), value: r.value.replace(/\.$/, ""), priority: r.priority ?? 10, ttl: r.ttl })}><Pencil className="h-3 w-3" /></Button>
            <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => { if (confirm(`Delete ${r.type} ${short(r.name)} → ${r.value}?`)) save.mutate({ line: r.line, remove: true }); }}><Trash2 className="h-3 w-3" /></Button>
          </span>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2 pt-2">
        <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as any })}>
          <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
          <SelectContent>{["A", "MX", "NS"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <Input className="w-32" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="@ or www" />
        {draft.type === "MX" && <Input className="w-20" type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} placeholder="Priority" />}
        <Input className="w-52" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder={draft.type === "A" ? "IP address" : draft.type === "MX" ? "mail server" : "ns1.example.com"} />
        <Input className="w-24" type="number" value={draft.ttl} onChange={(e) => setDraft({ ...draft, ttl: Number(e.target.value) })} placeholder="TTL" />
        <Button size="sm" disabled={!draft.value || !!err || save.isPending} onClick={() => { const { line, ...record } = draft; save.mutate({ line, record }); }}>
          {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}{draft.line ? "Save change" : "Add record"}
        </Button>
        {draft.line && <Button size="sm" variant="ghost" onClick={() => setDraft(blank)}>Cancel</Button>}
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
