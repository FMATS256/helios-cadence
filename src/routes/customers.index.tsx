import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { createCustomerRecord } from "@/lib/ops.functions";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

type Customer = {
  id: string; account_number: string; company_name: string; industry: string | null;
  status: string; primary_email: string | null; primary_phone: string | null; tags: string[]; created_at: string;
};

export const Route = createFileRoute("/customers/")({
  validateSearch: (s: Record<string, unknown>): { q?: string } => (typeof s.q === "string" && s.q ? { q: s.q } : {}),
  head: () => ({ meta: [{ title: "Customers — IMT Operations" }, { name: "description", content: "Customer directory with auto-assigned M-numbers." }] }),
  component: CustomersPage,
});

function CustomersPage() {
  const { q } = Route.useSearch();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createCustomer = useServerFn(createCustomerRecord);
  const [search, setSearch] = useState(q || "");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ company_name: "", industry: "", primary_email: "", primary_phone: "", website: "", status: "active", notes: "" });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").is("archived_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Customer[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("You must be signed in to add customers");
      if (!form.company_name.trim()) throw new Error("Company name is required");
      await createCustomer({ data: form });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); setOpen(false); setForm({ company_name: "", industry: "", primary_email: "", primary_phone: "", website: "", status: "active", notes: "" }); toast.success("Customer created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const v = search.toLowerCase();
    return r.company_name.toLowerCase().includes(v) || r.account_number.toLowerCase().includes(v) || (r.industry || "").toLowerCase().includes(v) || (r.primary_email || "").toLowerCase().includes(v);
  });

  return (
    <PageContainer>
      <PageHeader eyebrow="Operations" title="Customers" description="Every customer gets a permanent M-number that links everything they own across the platform."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild><Link to="/customers/new">Guided onboarding</Link></Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1.5" />Quick add</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2"><Label>Company name *</Label><Input required value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="Registered or trading name" /></div>
                    <div className="space-y-2"><Label>Industry</Label><Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Status</Label>
                      <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{["active","prospect","suspended","archived"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Primary email</Label><Input type="email" value={form.primary_email} onChange={(e) => setForm({ ...form, primary_email: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Primary phone</Label><Input value={form.primary_phone} onChange={(e) => setForm({ ...form, primary_phone: e.target.value })} /></div>
                    <div className="space-y-2 md:col-span-2"><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://company.co.zw" /></div>
                    <div className="space-y-2 md:col-span-2"><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Billing preferences, contacts, branch notes…" /></div>
                  </div>
                  <DialogFooter><Button type="submit" disabled={create.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{create.isPending ? "Creating…" : "Create customer"}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />


      <Card><CardContent className="p-0">
        <div className="flex items-center justify-between p-4 border-b gap-3">
          <form
            className="relative w-96 max-w-full"
            onSubmit={(e) => {
              e.preventDefault();
              const first = filtered[0];
              if (first) navigate({ to: "/customers/$accountNumber", params: { accountNumber: first.account_number } });
            }}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search M-number, company, industry…" className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          <p className="text-sm text-muted-foreground">{filtered.length} of {rows.length}</p>
        </div>
        {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          : rows.length === 0 ? <div className="p-12 text-center"><p className="text-sm text-muted-foreground mb-4">No customers yet. Add your first to get account number M0001.</p></div>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-[120px]">Account #</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-solar font-semibold hover:underline">{r.account_number}</Link></TableCell>
                    <TableCell className="font-semibold"><Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="hover:underline">{r.company_name}</Link></TableCell>
                    <TableCell className="text-muted-foreground">{r.industry || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.primary_email || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.primary_phone || "—"}</TableCell>
                    <TableCell><StatusPill tone={r.status === "active" ? "success" : r.status === "suspended" ? "danger" : "neutral"}>{r.status}</StatusPill></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent></Card>
    </PageContainer>
  );
}
