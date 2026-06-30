import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, UserPlus, ScrollText } from "lucide-react";
import { useRoles } from "@/hooks/use-roles";
import { listAllUsers, assignRole, inviteUser, recentAuditLog, ALL_ROLES, type AppRole } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Master Admin — IMT Operations" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { isMaster } = useRoles();
  if (!isMaster) {
    return (
      <PageContainer>
        <PageHeader eyebrow="System" title="Master Admin" />
        <Card><CardContent className="p-12 text-center">
          <Shield className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Master Administrator access required.</p>
        </CardContent></Card>
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader eyebrow="System" title="Master Administrator" description="Manage users, roles, and review platform activity." />
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users"><UserPlus className="h-4 w-4 mr-1.5" />Users & Roles</TabsTrigger>
          <TabsTrigger value="audit"><ScrollText className="h-4 w-4 mr-1.5" />Audit Log</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditTab /></TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllUsers);
  const inviteFn = useServerFn(inviteUser);
  const assignFn = useServerFn(assignRole);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", initial_role: "read_only" as AppRole });

  const { data: users = [], isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: () => listFn() });
  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { email: form.email, full_name: form.full_name, initial_role: form.initial_role } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setOpen(false); setForm({ email: "", full_name: "", initial_role: "read_only" }); toast.success("Invitation sent"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (p: { user_id: string; role: AppRole; action: "add" | "remove" }) => assignFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  return (
    <Card><CardHeader className="flex flex-row items-center justify-between">
      <CardTitle className="font-display">Users</CardTitle>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><UserPlus className="h-4 w-4 mr-1.5" />Invite user</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite user</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); invite.mutate(); }} className="space-y-4">
            <div className="space-y-2"><Label>Email *</Label><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Initial role</Label>
              <Select value={form.initial_role} onValueChange={(v) => setForm({ ...form, initial_role: v as AppRole })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_ROLES.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <DialogFooter><Button type="submit" disabled={invite.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{invite.isPending ? "Sending…" : "Send invite"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </CardHeader>
    <CardContent className="p-0">
      {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>User</TableHead><TableHead>Email</TableHead><TableHead>Roles</TableHead>
            <TableHead>Last sign-in</TableHead><TableHead className="w-[180px]">Assign</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {users.map((u: any) => (
              <TableRow key={u.id}>
                <TableCell className="font-semibold">{u.profile?.full_name || u.email?.split("@")[0]}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{u.email}</TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{u.roles.length === 0 ? <span className="text-muted-foreground text-xs">none</span> : u.roles.map((r: string) => (
                  <Badge key={r} variant="secondary" className="cursor-pointer" onClick={() => toggle.mutate({ user_id: u.id, role: r as AppRole, action: "remove" })} title="Remove">{r.replace(/_/g, " ")} ×</Badge>
                ))}</div></TableCell>
                <TableCell className="text-xs text-muted-foreground">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "—"}</TableCell>
                <TableCell>
                  <Select onValueChange={(v) => toggle.mutate({ user_id: u.id, role: v as AppRole, action: "add" })}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Add role…" /></SelectTrigger>
                    <SelectContent>{ALL_ROLES.filter(r => !u.roles.includes(r)).map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent></Card>
  );
}

function AuditTab() {
  const fn = useServerFn(recentAuditLog);
  const { data = [], isLoading } = useQuery({ queryKey: ["audit-log"], queryFn: () => fn() });
  return (
    <Card><CardHeader><CardTitle className="font-display">Recent activity</CardTitle></CardHeader>
      <CardContent className="p-0">
        {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          : data.length === 0 ? <div className="p-12 text-center text-sm text-muted-foreground">No audit entries yet.</div>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Actor</TableHead><TableHead>Details</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</TableCell>
                    <TableCell><StatusPill tone="info">{e.action}</StatusPill></TableCell>
                    <TableCell className="text-xs">{e.entity_type} {e.entity_id ? `· ${e.entity_id.slice(0, 8)}` : ""}</TableCell>
                    <TableCell className="text-xs">{e.actor_email || e.actor_id?.slice(0, 8) || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-xs">{JSON.stringify(e.new_value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent>
    </Card>
  );
}
