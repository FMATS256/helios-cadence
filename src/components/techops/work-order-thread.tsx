import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge, toneForStatus } from "@/components/enterprise";
import { useAuth } from "@/hooks/use-auth";
import {
  addWorkOrderUpdate, claimServiceTask, listWorkOrderUpdates, updateServiceTask,
} from "@/lib/service-tasks.functions";
import { Hand, Play, CheckCircle2, Send, Undo2, MessageSquare } from "lucide-react";

/** Ticket-style controls shared by the queue and the job page: claim, start, resolve, release. */
export function useWorkOrderActions() {
  const qc = useQueryClient();
  const claimFn = useServerFn(claimServiceTask);
  const updateFn = useServerFn(updateServiceTask);
  const done = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["service-tasks"] });
    qc.invalidateQueries({ queryKey: ["work-order-updates"] });
    qc.invalidateQueries({ queryKey: ["techops-job"] });
  };
  const claim = useMutation({
    mutationFn: (id: string) => claimFn({ data: { id } }),
    onSuccess: () => done("Job claimed — it's now in My jobs"),
    onError: (e: any) => toast.error(e?.message || "Could not claim job"),
  });
  const update = useMutation({
    mutationFn: (v: { id: string; status?: string; assigned_to?: string | null; completion_notes?: string; msg: string }) =>
      updateFn({ data: { id: v.id, status: v.status, assigned_to: v.assigned_to, completion_notes: v.completion_notes } }),
    onSuccess: (_r, v) => done(v.msg),
    onError: (e: any) => toast.error(e?.message || "Update failed"),
  });
  return { claim, update };
}

export function WorkOrderButtons({ task, size = "sm" }: { task: any; size?: "sm" | "default" }) {
  const { user } = useAuth();
  const { claim, update } = useWorkOrderActions();
  const [resolving, setResolving] = useState(false);
  const [notes, setNotes] = useState("");
  const closed = ["completed", "cancelled"].includes(task.status);
  const mine = task.assigned_to && task.assigned_to === user?.id;
  if (closed) return <StatusBadge tone={toneForStatus(task.status)}>{String(task.status).replace(/_/g, " ")}</StatusBadge>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {!task.assigned_to && (
        <Button size={size} disabled={claim.isPending} onClick={() => claim.mutate(task.id)}>
          <Hand className="h-3.5 w-3.5 mr-1" />Claim
        </Button>
      )}
      {mine && task.status !== "in_progress" && (
        <Button size={size} variant="outline" onClick={() => update.mutate({ id: task.id, status: "in_progress", msg: "Work started" })}>
          <Play className="h-3.5 w-3.5 mr-1" />Start
        </Button>
      )}
      {mine && (
        <Button size={size} variant="outline" onClick={() => setResolving(true)}>
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Close job
        </Button>
      )}
      {mine && (
        <Button size={size} variant="ghost" onClick={() => update.mutate({ id: task.id, assigned_to: null, status: "pending", msg: "Returned to team queue" })}>
          <Undo2 className="h-3.5 w-3.5 mr-1" />Release
        </Button>
      )}
      {resolving && (
        <Dialog open onOpenChange={(o) => !o && setResolving(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Close work order · {task.title}</DialogTitle></DialogHeader>
            <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000}
              placeholder="What was done, results of testing, anything the account manager should tell the client…" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setResolving(false)}>Cancel</Button>
              <Button disabled={!notes.trim() || update.isPending} onClick={() => {
                update.mutate({ id: task.id, status: "completed", completion_notes: notes, msg: "Work order closed" });
                setResolving(false);
              }}>Close job</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function WorkOrderThread({ task }: { task: any }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listWorkOrderUpdates);
  const addFn = useServerFn(addWorkOrderUpdate);
  const [body, setBody] = useState("");
  const { data: updates = [] } = useQuery({
    queryKey: ["work-order-updates", task.id],
    queryFn: async () => (await listFn({ data: { task_id: task.id } })) as any[],
  });
  const add = useMutation({
    mutationFn: () => addFn({ data: { task_id: task.id, body } }),
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["work-order-updates", task.id] }); },
    onError: (e: any) => toast.error(e?.message || "Could not post update"),
  });
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" />Work order thread</CardTitle>
        <WorkOrderButtons task={task} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">
          Raised by {task.requester ?? "staff"} · {task.assignee ? `Owner: ${task.assignee}` : "In team queue — any engineer can claim"}
        </div>
        {task.description && <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{task.description}</div>}
        <div className="space-y-2">
          {updates.length === 0 && <div className="text-sm text-muted-foreground">No updates yet.</div>}
          {updates.map((u: any) => (
            <div key={u.id} className={u.kind === "comment" ? "rounded-md border p-3" : "rounded-md bg-muted/50 px-3 py-2"}>
              <div className="text-xs text-muted-foreground">{u.author} · {new Date(u.created_at).toLocaleString()}</div>
              <div className={u.kind === "comment" ? "text-sm whitespace-pre-wrap mt-1" : "text-xs font-medium whitespace-pre-wrap mt-0.5"}>{u.body}</div>
            </div>
          ))}
        </div>
        {!["completed", "cancelled"].includes(task.status) && (
          <div className="space-y-2">
            <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} placeholder="Post an update or question…" />
            <div className="flex justify-end">
              <Button size="sm" disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>
                <Send className="h-3.5 w-3.5 mr-1" />Post update
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
