import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { listAllUsers } from "@/lib/admin.functions";
import { RULES, type Department } from "@/lib/department-access";

const COLS: Array<[Department, string]> = [["finance", "Finance"], ["sales", "Account Mgmt / Sales"], ["tech", "NOC / Tech"], ["inventory", "Inventory"], ["readonly", "Read only"]];

export function AccessMatrix() {
  const rows = RULES.filter((r) => r.prefix !== "/").sort((a, b) => a.prefix.localeCompare(b.prefix));
  const cell = (allow: (typeof RULES)[number]["allow"], d: Department) =>
    allow === "all" ? "✓" : allow === "master" ? "—" : allow.includes(d) ? "✓" : "—";
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="font-display">Who can open each page</CardTitle>
          <p className="text-sm text-muted-foreground">Operations managers open every department page. Master admins open everything. Data inside pages is also limited by department; account managers only see their own or shared clients.</p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Page</TableHead>{COLS.map(([, l]) => <TableHead key={l} className="text-center">{l}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.prefix}>
                  <TableCell className="font-mono text-xs">{r.prefix}{r.allow === "master" ? " (master admin)" : ""}</TableCell>
                  {COLS.map(([d]) => <TableCell key={d} className={`text-center ${cell(r.allow, d) === "✓" ? "text-teal font-semibold" : "text-muted-foreground"}`}>{cell(r.allow, d)}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ClientSharing />
    </div>
  );
}

function ClientSharing() {
  const qc = useQueryClient();
  const usersFn = useServerFn(listAllUsers);
  const [customer, setCustomer] = useState("");
  const [user, setUser] = useState("");
  const { data: users = [] } = useQuery({ queryKey: ["admin-users"], queryFn: () => usersFn() });
  const { data: customers = [] } = useQuery({ queryKey: ["cust-lite"], queryFn: async () => (await supabase.from("customers").select("id,account_number,company_name").is("archived_at", null).order("company_name")).data ?? [] });
  const { data: shares = [] } = useQuery({ queryKey: ["customer-shares"], queryFn: async () => ((await (supabase.from as any)("customer_shares").select("id,customer_id,user_id,created_at").order("created_at", { ascending: false })).data ?? []) as any[] });
  const name = (id: string) => { const u: any = (users as any[]).find((x: any) => x.id === id); return u?.profile?.full_name || u?.email || id.slice(0, 8); };
  const cust = (id: string) => { const c: any = customers.find((x: any) => x.id === id); return c ? `${c.company_name} (${c.account_number})` : id.slice(0, 8); };
  const add = useMutation({
    mutationFn: async () => {
      const { data: { user: me } } = await supabase.auth.getUser();
      const { error } = await (supabase.from as any)("customer_shares").insert({ customer_id: customer, user_id: user, shared_by: me?.id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customer-shares"] }); setCustomer(""); setUser(""); toast.success("Client shared"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase.from as any)("customer_shares").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer-shares"] }),
  });
  return (
    <Card>
      <CardHeader><CardTitle className="font-display">Share a client with another account manager</CardTitle>
        <p className="text-sm text-muted-foreground">Account managers see their own clients. Share a client here when someone else needs to cover it.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Select value={customer} onValueChange={setCustomer}><SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.company_name} ({c.account_number})</SelectItem>)}</SelectContent></Select>
          <Select value={user} onValueChange={setUser}><SelectTrigger><SelectValue placeholder="Staff member" /></SelectTrigger>
            <SelectContent>{(users as any[]).filter((u: any) => u.roles?.length).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.profile?.full_name || u.email}</SelectItem>)}</SelectContent></Select>
          <Button disabled={!customer || !user || add.isPending} onClick={() => add.mutate()}>Share</Button>
        </div>
        {shares.length === 0 ? <p className="text-sm text-muted-foreground">No shared clients.</p> : (
          <div className="divide-y border">
            {shares.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{cust(s.customer_id)} → <span className="font-medium">{name(s.user_id)}</span></span>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}>Remove</Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
