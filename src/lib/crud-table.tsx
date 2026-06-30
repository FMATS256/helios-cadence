import { ReactNode, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select" | "email";
  options?: readonly string[];
  required?: boolean;
  placeholder?: string;
  colSpan?: 1 | 2;
  default?: any;
};

export type ColumnDef<T> = {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

export function CrudTable<T extends { id: string }>({
  table, queryKey, title, description, addLabel = "Add", fields, columns,
  searchKeys = [], orderBy = "created_at", orderAsc = false, tourTag,
}: {
  table: string;
  queryKey: string;
  title: string;
  description?: string;
  addLabel?: string;
  fields: FieldDef[];
  columns: ColumnDef<T>[];
  searchKeys?: (keyof T & string)[];
  orderBy?: string;
  orderAsc?: boolean;
  tourTag?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<T | null>(null);
  const [open, setOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const { data, error } = await supabase.from(table as any).select("*").order(orderBy, { ascending: orderAsc });
      if (error) throw error;
      return data as unknown as T[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (form: Partial<T>) => {
      if (!user) throw new Error("Not signed in");
      const payload: any = { ...form, user_id: user.id };
      for (const f of fields) if (f.type === "number") payload[f.key] = Number(payload[f.key] ?? 0);
      if ((form as any).id) {
        const { error } = await supabase.from(table as any).update(payload).eq("id", (form as any).id); if (error) throw error;
      } else {
        const { error } = await supabase.from(table as any).insert(payload); if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); setOpen(false); setEditing(null); toast.success("Saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from(table as any).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); toast.success("Deleted"); },
  });

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return searchKeys.some((k) => String((r as any)[k] ?? "").toLowerCase().includes(q));
  });

  return (
    <Card><CardContent className="p-0">
      <div className="flex items-center justify-between p-4 border-b gap-3">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={`Search ${title.toLowerCase()}…`} className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button data-tour={tourTag} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              <Plus className="h-4 w-4 mr-1.5" />{addLabel}
            </Button>
          </DialogTrigger>
          <EntityForm key={editing?.id ?? "new"} initial={editing} fields={fields} title={title} onSubmit={(d) => upsert.mutate(d)} busy={upsert.isPending} />
        </Dialog>
      </div>
      {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        : rows.length === 0 ? <div className="p-12 text-center"><p className="text-sm text-muted-foreground mb-4">{description ?? "No records yet."}</p>
            <Button onClick={() => { setEditing(null); setOpen(true); }} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1.5" />{addLabel}</Button></div>
        : (
        <Table>
          <TableHeader><TableRow>
            {columns.map((c, i) => <TableHead key={i} className={c.className}>{c.header}</TableHead>)}
            <TableHead className="w-[100px] text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                {columns.map((c, i) => <TableCell key={i} className={c.className}>{c.render(r)}</TableCell>)}
                <TableCell><div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate(r.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent></Card>
  );
}

function EntityForm<T>({ initial, fields, title, onSubmit, busy }: {
  initial: T | null; fields: FieldDef[]; title: string;
  onSubmit: (d: Partial<T>) => void; busy: boolean;
}) {
  const init: any = initial ?? Object.fromEntries(fields.filter(f => f.default !== undefined).map(f => [f.key, f.default]));
  const [form, setForm] = useState<any>(init);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    for (const f of fields) {
      if (f.required && !String(form[f.key] ?? "").trim()) return toast.error(`${f.label} is required`);
    }
    onSubmit({ ...form, ...(initial ? { id: (initial as any).id } : {}) });
  };
  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{initial ? `Edit ${title.replace(/s$/, "")}` : `Add new ${title.replace(/s$/, "").toLowerCase()}`}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.key} className={`space-y-2 ${f.colSpan === 2 ? "col-span-2" : ""}`}>
              <Label>{f.label}{f.required && " *"}</Label>
              {f.type === "textarea" ? (
                <Textarea rows={3} value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
              ) : f.type === "select" ? (
                <Select value={form[f.key] ?? ""} onValueChange={(v) => set(f.key, v)}>
                  <SelectTrigger><SelectValue placeholder={f.placeholder ?? "Select…"} /></SelectTrigger>
                  <SelectContent>{f.options?.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : "text"}
                  value={form[f.key] ?? (f.type === "number" ? 0 : "")}
                  onChange={(e) => set(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}
                  placeholder={f.placeholder} required={f.required}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter><Button type="submit" disabled={busy} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{busy ? "Saving…" : initial ? "Save changes" : "Create"}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
