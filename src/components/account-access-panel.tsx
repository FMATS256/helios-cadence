import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, UserPlus, ExternalLink } from "lucide-react";
import { getAccountWorkspace, sendClientPortalRecovery } from "@/lib/account-workspace.functions";
import { invitePortalUser, unlinkPortalUser } from "@/lib/portal-admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export function AccountAccessPanel({ customerId }: { customerId: string }) {
  const qc = useQueryClient();
  const get = useServerFn(getAccountWorkspace);
  const recover = useServerFn(sendClientPortalRecovery);
  const invite = useServerFn(invitePortalUser);
  const unlink = useServerFn(unlinkPortalUser);
  const { data, isPending, error } = useQuery({ queryKey: ["account-access", customerId], queryFn: () => get({ data: { customer_id: customerId } }) });
  const [target, setTarget] = useState<{ id: string; email: string | null } | null>(null);
  const [reason, setReason] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["account-access", customerId] }); qc.invalidateQueries({ queryKey: ["account-workspace"] }); qc.invalidateQueries({ queryKey: ["customer-360"] }); };
  const recovery = useMutation({ mutationFn: async () => {
    if (!target) throw new Error("Select a portal user");
    return recover({ data: { customer_id: customerId, user_id: target.id, reason } });
  }, onSuccess: () => { toast.success("Recovery email requested — client chooses their own password"); setTarget(null); setReason(""); refresh(); }, onError: (e) => toast.error(e.message) });
  const invitation = useMutation({ mutationFn: () => invite({ data: { customer_id: customerId, email, full_name: name } }), onSuccess: () => { toast.success("Portal access granted"); setInviteOpen(false); refresh(); }, onError: (e) => toast.error(e.message) });
  const revoke = useMutation({ mutationFn: (id: string) => unlink({ data: { user_id: id } }), onSuccess: () => { toast.success("Portal access revoked"); refresh(); }, onError: (e) => toast.error(e.message) });
  if (isPending) return <p className="py-6 text-sm text-muted-foreground">Loading account access…</p>;
  if (error) return <p className="py-4 text-sm text-destructive">{error.message}</p>;
  if (!data) return null;
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-info" />Client portal access</h3><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" asChild><Link to="/client"><ExternalLink className="h-4 w-4 mr-2" />Portal sign-in</Link></Button>{data.isMaster && <Button size="sm" onClick={() => setInviteOpen(true)}><UserPlus className="h-4 w-4 mr-2" />Grant access</Button>}</div></div>
    {data.users.length === 0 && <p className="text-sm text-muted-foreground py-4">No portal users linked to this account.</p>}
    <div className="divide-y divide-border">{data.users.map((user) => <div key={user.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"><div className="min-w-0"><p className="font-medium text-sm">{user.full_name || "Client user"}</p><p className="text-xs text-muted-foreground break-all">{user.email}</p><p className="text-xs text-success mt-1">{user.status || "active"} · Linked portal account</p></div><div className="flex flex-wrap gap-2">{data.canRecover && <Button size="sm" variant="outline" onClick={() => setTarget(user)}><KeyRound className="h-4 w-4 mr-2" />Send reset link</Button>}{data.isMaster && <Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => { if (confirm("Revoke this user's client portal access?")) revoke.mutate(user.id); }}>Revoke</Button>}</div></div>)}</div>
    <Dialog open={!!target} onOpenChange={(open) => { if (!open) setTarget(null); }}><DialogContent><DialogHeader><DialogTitle>Client portal password recovery</DialogTitle></DialogHeader><p className="text-sm break-all">{target?.email}</p><div className="space-y-2"><Label htmlFor="recovery-reason">Support reason / ticket reference</Label><Textarea id="recovery-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button><Button disabled={!reason.trim() || recovery.isPending} onClick={() => recovery.mutate()}>{recovery.isPending ? "Sending…" : "Send recovery email"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={inviteOpen} onOpenChange={setInviteOpen}><DialogContent><DialogHeader><DialogTitle>Grant client portal access</DialogTitle></DialogHeader><div className="space-y-2"><Label htmlFor="portal-name">Full name</Label><Input id="portal-name" value={name} onChange={(e) => setName(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="portal-invite-email">Email</Label><Input id="portal-invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div><DialogFooter><Button disabled={!email.trim() || invitation.isPending} onClick={() => invitation.mutate()}>{invitation.isPending ? "Saving…" : "Grant access"}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}