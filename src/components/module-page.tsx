import { ReactNode, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { PageContainer, PageHeader } from "@/components/page";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

export interface Column<T = any> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface ModulePageProps<T> {
  eyebrow: string;
  title: string;
  description: string;
  table: string;
  queryKey: string;
  orderBy?: string;
  columns: Column<T>[];
  searchFields: string[];
  emptyLabel: string;
  createTitle: string;
  createLabel?: string;
  renderForm: (form: any, setForm: (f: any) => void) => ReactNode;
  emptyForm: any;
  validateForm?: (f: any) => string | null;
  transformInsert?: (f: any) => any;
}

export function ModulePage<T extends { id: string }>({
  eyebrow, title, description, table, queryKey, orderBy = "created_at",
  columns, searchFields, emptyLabel, createTitle, createLabel = "New",
  renderForm, emptyForm, validateForm, transformInsert,
}: ModulePageProps<T>) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const q: any = supabase.from(table as any).select("*").order(orderBy, { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (validateForm) {
        const err = validateForm(form);
        if (err) throw new Error(err);
      }
      const insertData = transformInsert ? transformInsert(form) : form;
      const { error } = await supabase.from(table as any).insert(insertData as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      setOpen(false);
      setForm(emptyForm);
      toast.success("Created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = rows.filter((r: any) => {
    if (!search) return true;
    const v = search.toLowerCase();
    return searchFields.some((f) => String(r[f] ?? "").toLowerCase().includes(v));
  });

  return (
    <PageContainer>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                <Plus className="h-4 w-4 mr-1.5" />
                {createLabel}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{createTitle}</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
                {renderForm(form, setForm)}
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                    {create.isPending ? "Saving…" : "Save"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card><CardContent className="p-0">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search…" className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">{filtered.length} of {rows.length}</p>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              {columns.map((c, i) => <TableHead key={i} className={c.className}>{c.header}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((c, i) => <TableCell key={i} className={c.className}>{c.cell(row)}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </PageContainer>
  );
}

export function useCustomersLite() {
  return useQuery({
    queryKey: ["customers-min"],
    queryFn: async () => (await supabase.from("customers").select("id,account_number,company_name").is("archived_at", null).order("company_name")).data ?? [],
  });
}
