import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkspaceContext, listWorkspaceMembers, inviteWorkspaceMember, removeWorkspaceMember } from "@/lib/portal.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/c/$slug/$workspaceKey/team")({
  component: TeamPage,
});

function TeamPage() {
  const { slug, workspaceKey } = Route.useParams();
  const ctxFn = useServerFn(getWorkspaceContext);
  const { data: ctx } = useQuery({ queryKey: ["ws-ctx", slug, workspaceKey], queryFn: () => ctxFn({ data: { slug, workspaceKey } }) });
  const workspaceId = (ctx as any)?.workspace?.id;
  const canManage = ["owner", "admin"].includes((ctx as any)?.myRole ?? "") || (ctx as any)?.isStaff;

  const listFn = useServerFn(listWorkspaceMembers);
  const qc = useQueryClient();
  const { data: members = [] } = useQuery({
    queryKey: ["ws-members", workspaceId],
    queryFn: () => listFn({ data: { workspaceId } }),
    enabled: !!workspaceId,
  });

  const inviteFn = useServerFn(inviteWorkspaceMember);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "developer" | "viewer">("developer");
  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { workspaceId, email, role } }),
    onSuccess: () => { toast.success("Invitation sent"); setEmail(""); qc.invalidateQueries({ queryKey: ["ws-members", workspaceId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFn = useServerFn(removeWorkspaceMember);
  const remove = useMutation({
    mutationFn: (memberId: string) => removeFn({ data: { workspaceId, memberId } }),
    onSuccess: () => { toast.success("Member removed"); qc.invalidateQueries({ queryKey: ["ws-members", workspaceId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Team & Access</h1>
        <p className="text-sm text-muted-foreground">Invite teammates to collaborate. Roles: <b>Admin</b> full control · <b>Developer</b> manage servers · <b>Viewer</b> read-only.</p>
      </div>

      {canManage && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4 text-solar" /> Invite member</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={(e) => { e.preventDefault(); invite.mutate(); }} className="grid gap-3 md:grid-cols-[1fr_180px_auto] items-end">
              <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="[email protected]" /></div>
              <div><Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="developer">Developer</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={invite.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>{invite.isPending ? "Sending…" : "Send invite"}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Members ({(members as any[]).length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(members as any[]).map((m: any) => (
            <div key={m.id} className="flex items-center justify-between border-b last:border-0 py-2">
              <div>
                <div className="font-medium text-sm">{m.profile?.full_name ?? m.profile?.email ?? "Pending user"}</div>
                <div className="text-xs text-muted-foreground">{m.profile?.email ?? m.invited_email}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="capitalize">{m.role}</Badge>
                {canManage && m.role !== "owner" && (
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>
                )}
              </div>
            </div>
          ))}
          {(members as any[]).length === 0 && <p className="text-sm text-muted-foreground">No members yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
