import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Search, Eye, KeyRound } from "lucide-react";
import { createCredential, revealCredential, deleteCredential } from "@/lib/credentials.functions";

const TYPES = [
  "Server","NAS","Router","Firewall","Switch","WiFi","SSH Key","API Key","VPN",
  "Database","Microsoft 365","Email","Cloud","Licence","Recovery Code","Certificate","Private Key","Other",
] as const;

export const Route = createFileRoute("/credentials")({
  head: () => ({ meta: [{ title: "Credential Vault — IMT Operations" }] }),
  component: CredentialsPage,
});

function CredentialsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ customer_id: "" as string, name: "", credential_type: "Server", username: "", url: "", notes: "", secret: "", expires_at: "" });

  const createFn = useServerFn(createCredential);
  const revealFn = useServerFn(revealCredential);
  const deleteFn = useServerFn(deleteCredential);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-min"],
    queryFn: async () => (await supabase.from("customers").select("id,account_number,company_name").is("archived_at", null).order("company_name")).data ?? [],
  });
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["credentials"],
    queryFn: async () => (await supabase.from("credentials").select("*").is("archived_at", null).order("created_at", { ascending: false })).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.secret.trim()) throw new Error("Name and secret are required");
      await createFn({ data: {
        customer_id: form.customer_id || null,
        name: form.name, credential_type: form.credential_type,
        username: form.username || undefined, url: form.url || undefined,
        notes: form.notes || undefined, secret: form.secret,
        expires_at: form.expires_at || null,
      }});
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["credentials"] }); setOpen(false); setForm({ customer_id: "", name: "", credential_type: "Server", username: "", url: "", notes: "", secret: "", expires_at: "" }); toast.success("Credential stored (encrypted)"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reveal = useMutation({
    mutationFn: async (id: string) => revealFn({ data: { id } }),
    onSuccess: (res, id) => { setRevealed((r) => ({ ...r, [id]: res.secret })); toast.success("Reveal logged"); setTimeout(() => setRevealed((r) => { const c = { ...r }; delete c[id]; return c; }), 30_000); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["credentials"] }); toast.success("Archived"); },
  });

  const filtered = rows.filter((r: any) => {
    if (!search) return true;
    const v = search.toLowerCase();
    return r.name.toLowerCase().includes(v) || r.credential_type.toLowerCase().includes(v) || (r.account_number || "").toLowerCase().includes(v) || (r.username || "").toLowerCase().includes(v);
  });

  return (
    <PageContainer>
      <PageHeader eyebrow="Operations" title="Credential Vault"
        description="AES-256-GCM encrypted store. Plaintext is never persisted; every reveal is logged with user and timestamp."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1.5" />New credential</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>New credential</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Customer (optional)</Label>
                    <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Type</Label>
                    <Select value={form.credential_type} onValueChange={(v) => setForm({ ...form, credential_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-2"><Label>Label *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. SRV01 root, Office 365 admin" /></div>
                  <div className="space-y-2"><Label>Username</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
                  <div className="space-y-2"><Label>URL / Host</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>
                  <div className="col-span-2 space-y-2"><Label>Secret *</Label><Textarea required rows={3} value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="Password, key, token…" /></div>
                  <div className="space-y-2"><Label>Expires</Label><Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></div>
                  <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                </div>
                <DialogFooter><Button type="submit" disabled={create.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{create.isPending ? "Encrypting…" : "Store credential"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card><CardContent className="p-0">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by label, type, M-number…" className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">{filtered.length} of {rows.length}</p>
        </div>
        {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          : rows.length === 0 ? <div className="p-12 text-center"><KeyRound className="h-8 w-8 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">Vault is empty. Add your first credential.</p></div>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Secret</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-semibold">{r.name}</TableCell>
                    <TableCell><StatusPill tone="info">{r.credential_type}</StatusPill></TableCell>
                    <TableCell>{r.account_number ? <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline">{r.account_number}</Link> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                    <TableCell className="text-muted-foreground">{r.username || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{revealed[r.id] ? <span className="text-foreground">{revealed[r.id]}</span> : "••••••••••••"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.expires_at ? new Date(r.expires_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => reveal.mutate(r.id)} title="Reveal (logged)"><Eye className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { if (confirm("Archive this credential?")) remove.mutate(r.id); }}>×</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent></Card>
    </PageContainer>
  );
}
