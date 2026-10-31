import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listFirewallRules, addFirewallRules, removeFirewallRule } from "@/lib/firewall.functions";
import { WORKLOAD_GUIDES, workloadGuide } from "@/lib/server-config-guides";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, ShieldAlert, Wand2 } from "lucide-react";

export function FirewallManager({ server }: { server: { id: string; name: string; image?: string | null; notes?: string | null } }) {
  const qc = useQueryClient();
  const fnList = useServerFn(listFirewallRules);
  const fnAdd = useServerFn(addFirewallRules);
  const fnRemove = useServerFn(removeFirewallRule);
  const key = ["firewall", server.id];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => fnList({ data: { server_id: server.id } }) });
  const [form, setForm] = useState({ protocol: "tcp" as "tcp" | "udp" | "icmp", port: "", source: "0.0.0.0/0", notes: "" });
  const [trusted, setTrusted] = useState("");
  const [guideKey, setGuideKey] = useState(workloadGuide(`${server.name} ${server.image ?? ""} ${server.notes ?? ""}`)?.key ?? "");

  const add = useMutation({
    mutationFn: (rules: any[]) => fnAdd({ data: { server_id: server.id, rules } }),
    onSuccess: (r) => { toast.success(`Opened ${r.added} rule(s)`); setForm({ ...form, port: "", notes: "" }); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (rule_id: string) => fnRemove({ data: { server_id: server.id, rule_id } }),
    onSuccess: () => { toast.success("Port closed"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-1" />Loading firewall…</p>;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!data?.supported) return (
    <p className="text-sm text-muted-foreground"><ShieldAlert className="inline h-4 w-4 mr-1" />
      {data?.provider} does not offer a firewall control we can use from here. Set ports on the server itself (for example firewalld or Windows Firewall) using the setup guide.</p>
  );

  const guide = WORKLOAD_GUIDES.find((g) => g.key === guideKey);
  function applyGuide() {
    if (!guide) return;
    const needsTrusted = guide.rules.some((r) => r.restrict);
    if (needsTrusted && !trusted.trim()) return toast.error("Enter the trusted office/VPN IP range for restricted ports");
    const existing = new Set(data!.rules.map((r) => `${r.protocol}|${r.port}`));
    const rules = guide.rules.filter((r) => !existing.has(`${r.protocol}|${r.port}`))
      .map((r) => ({ protocol: r.protocol, port: r.port, source: r.restrict ? trusted.trim() : "0.0.0.0/0", notes: `${guide.label}: ${r.notes}` }));
    if (!rules.length) return toast.info("All ports from this guide are already open");
    if (confirm(`Open ${rules.length} port rule(s) for ${guide.label}?`)) add.mutate(rules);
  }

  return (
    <div className="space-y-4">
      {data.unprotected && <p className="text-sm text-warning">No firewall yet — all ports are open. Adding a rule creates one and blocks everything else.</p>}
      <Table>
        <TableHeader><TableRow><TableHead>Protocol</TableHead><TableHead>Port</TableHead><TableHead>Allowed from</TableHead><TableHead>Note</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {data.rules.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No open ports.</TableCell></TableRow>}
          {data.rules.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="uppercase">{r.protocol}</TableCell>
              <TableCell className="font-mono">{r.port || "all"}</TableCell>
              <TableCell className="font-mono">{r.source === "0.0.0.0/0" ? "Anywhere" : r.source}</TableCell>
              <TableCell className="text-xs">{r.notes}</TableCell>
              <TableCell className="text-right">
                <Button size="icon" variant="ghost" title="Close port" disabled={remove.isPending}
                  onClick={() => confirm(`Close ${r.protocol.toUpperCase()} ${r.port}?`) && remove.mutate(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        <Select value={form.protocol} onValueChange={(v: any) => setForm({ ...form, protocol: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="tcp">TCP</SelectItem><SelectItem value="udp">UDP</SelectItem><SelectItem value="icmp">Ping (ICMP)</SelectItem></SelectContent>
        </Select>
        <Input placeholder="Port e.g. 443 or 9000:10999" value={form.port} disabled={form.protocol === "icmp"} onChange={(e) => setForm({ ...form, port: e.target.value })} />
        <Input placeholder="From e.g. 0.0.0.0/0" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
        <Input placeholder="Note" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <Button onClick={() => add.mutate([form])} disabled={add.isPending}><Plus className="h-4 w-4 mr-1" />Open port</Button>
      </div>

      <div className="border-t pt-3 grid md:grid-cols-3 gap-2 items-end">
        <Select value={guideKey} onValueChange={setGuideKey}>
          <SelectTrigger><SelectValue placeholder="Apply a setup guide…" /></SelectTrigger>
          <SelectContent>{WORKLOAD_GUIDES.map((g) => <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="Trusted office/VPN range e.g. 41.57.0.0/16" value={trusted} onChange={(e) => setTrusted(e.target.value)} />
        <Button variant="outline" onClick={applyGuide} disabled={!guide || add.isPending}><Wand2 className="h-4 w-4 mr-1" />Apply guide ports</Button>
        {guide && <p className="md:col-span-3 text-xs text-muted-foreground">
          {guide.rules.map((r) => `${r.protocol.toUpperCase()} ${r.port}${r.restrict ? " (trusted only)" : ""}`).join(" · ")}</p>}
      </div>
    </div>
  );
}
