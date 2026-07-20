import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCatalog, upsertCatalogItem, deleteCatalogItem } from "@/lib/catalog.functions";
import { useRoles } from "@/hooks/use-roles";
import { can } from "@/lib/rbac";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Archive, Search } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/catalog")({
  head: () => ({ meta: [{ title: "Service catalog — IMT Operations" }] }),
  component: CatalogPage,
});

type Item = { id: string; code: string; name: string; category: string; description: string | null; unit_price: number; currency: string; billing_cycle: string; is_active: boolean };

const CYCLES = ["monthly", "quarterly", "annual", "one-time"];
const CATEGORIES = ["connectivity", "cloud", "hosting", "productivity", "security", "backup", "support", "hardware", "licensing", "general"];

function CatalogPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCatalog);
  const upsertFn = useServerFn(upsertCatalogItem);
  const deleteFn = useServerFn(deleteCatalogItem);
  const { roles } = useRoles();
  const canManage = can(roles, "catalog.manage");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState({ code: "", name: "", category: "general", description: "", unit_price: 0, billing_cycle: "monthly", is_active: true });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["catalog"],
    queryFn: async () => (await listFn()) as Item[],
  });

  const openNew = () => { setEditing(null); setForm({ code: "", name: "", category: "general", description: "", unit_price: 0, billing_cycle: "monthly", is_active: true }); setOpen(true); };
  const openEdit = (it: Item) => { setEditing(it); setForm({ code: it.code, name: it.name, category: it.category, description: it.description || "", unit_price: Number(it.unit_price), billing_cycle: it.billing_cycle, is_active: it.is_active }); setOpen(true); };

  const save = useMutation({
    mutationFn: () => upsertFn({ data: { id: editing?.id, ...form } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["catalog"] }); setOpen(false); toast.success(editing ? "Item updated" : "Item created"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const archive = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["catalog"] }); toast.success("Item archived"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Products & services"
        title="Service catalog"
        description="Reusable services you can assign to clients during onboarding — Starlink, VPS, M365, hosting, retainers…"
        actions={canManage && (
          <Button onClick={openNew} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
            <Plus className="h-4 w-4 mr-1.5" />New item
          </Button>
        )}
      />

      <Card><CardContent className="p-0">
        {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div> : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No catalog items yet.</div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-[140px]">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Cycle</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className="w-[100px]" />}
            </TableRow></TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-mono text-xs">{it.code}</TableCell>
                  <TableCell><div className="font-semibold">{it.name}</div>{it.description && <div className="text-xs text-muted-foreground max-w-md truncate">{it.description}</div>}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{it.category}</TableCell>
                  <TableCell className="text-muted-foreground">{it.billing_cycle}</TableCell>
                  <TableCell className="text-right font-mono">${Number(it.unit_price).toFixed(2)}</TableCell>
                  <TableCell><StatusPill tone={it.is_active ? "success" : "neutral"}>{it.is_active ? "active" : "archived"}</StatusPill></TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(it)}><Pencil className="h-3.5 w-3.5" /></Button>
                        {it.is_active && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => archive.mutate(it.id)}><Archive className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit catalog item" : "New catalog item"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Code *</Label><Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="STARLINK-RES" /></div>
              <div className="space-y-2"><Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2"><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-2 col-span-2"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="space-y-2"><Label>Unit price (USD)</Label><Input type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label>Billing cycle</Label>
                <Select value={form.billing_cycle} onValueChange={(v) => setForm({ ...form, billing_cycle: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CYCLES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={save.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{save.isPending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
