import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, toneForStatus, EmptyState } from "@/components/enterprise";
import { Wrench, UserCog } from "lucide-react";
import { listAssignableStaff } from "@/lib/client-actions.functions";
import { createServiceTask, listServiceTasks, updateServiceTask } from "@/lib/service-tasks.functions";
import { TASK_TYPES, SERVICE_TYPES, TASK_STATUSES } from "@/lib/service-tasks.shared";
import type { ClientContext } from "@/components/client-action-dialogs";

export function useTechnicians() {
  const fn = useServerFn(listAssignableStaff);
  return useQuery({ queryKey: ["assignable-staff"], queryFn: async () => (await fn()) as any[] });
}

export function AssignTechDialog({
  ctx, onClose, defaults,
}: {
  ctx: ClientContext;
  onClose: () => void;
  defaults?: { service_type?: string; task_type?: string; title?: string; subscription_id?: string };
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useServerFn(createServiceTask);
  const { data: staff = [] } = useTechnicians();

  const [serviceType, setServiceType] = useState(defaults?.service_type ?? "cloud");
  const [taskType, setTaskType] = useState(defaults?.task_type ?? "deployment");
  const [title, setTitle] = useState(defaults?.title ?? "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assignee, setAssignee] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [openTicket, setOpenTicket] = useState(true);

  const mut = useMutation({
    mutationFn: async () => create({
      data: {
        customer_id: ctx.customerId,
        service_type: serviceType,
        task_type: taskType,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assigned_to: assignee || null,
        due_date: dueDate || null,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        subscription_id: defaults?.subscription_id ?? null,
        open_ticket: openTicket,
      },
    }),
    onSuccess: (task: any) => {
      toast.success(assignee ? "Task assigned to the technical team" : "Task queued for the technical team");
      qc.invalidateQueries({ queryKey: ["customer-360", ctx.accountNumber] });
      qc.invalidateQueries({ queryKey: ["service-tasks"] });
      onClose();
      if (task?.id) navigate({ to: "/techops/jobs/$id", params: { id: task.id } });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create task"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />Assign Technical Team — {ctx.companyName}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Service</Label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Work type</Label>
            <Select value={taskType} onValueChange={setTaskType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Task title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Deploy 4vCPU VPS and hand over credentials" maxLength={160} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Instructions for the technician</Label>
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Specs, DID range, IP requirements, site contact, access notes…" maxLength={2000} />
          </div>
          <div className="space-y-1.5">
            <Label>Assign technician</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger><SelectValue placeholder="Leave in team queue" /></SelectTrigger>
              <SelectContent>
                {staff.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}{s.role ? ` · ${String(s.role).replace(/_/g, " ")}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["low", "normal", "high", "critical"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Scheduled for</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <Checkbox checked={openTicket} onCheckedChange={(v) => setOpenTicket(!!v)} />
            Also open a support ticket so the customer can track progress
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!title.trim() || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Assigning…" : "Assign to technical team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact list of technical work orders for a customer, with inline status control. */
export function CustomerTasksCard({ ctx }: { ctx: ClientContext }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listServiceTasks);
  const updateFn = useServerFn(updateServiceTask);
  const { data: tasks = [] } = useQuery({
    queryKey: ["service-tasks", ctx.customerId],
    queryFn: async () => (await listFn({ data: { customer_id: ctx.customerId } })) as any[],
  });

  const mut = useMutation({
    mutationFn: async (v: { id: string; status: string }) => updateFn({ data: v }),
    onSuccess: () => {
      toast.success("Task updated");
      qc.invalidateQueries({ queryKey: ["service-tasks"] });
      qc.invalidateQueries({ queryKey: ["customer-360", ctx.accountNumber] });
    },
    onError: (e: any) => toast.error(e?.message || "Update failed"),
  });

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-display uppercase tracking-wider flex items-center gap-2">
          <UserCog className="h-4 w-4" />Technical Work Orders
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {tasks.length === 0 ? (
          <EmptyState title="No technical tasks" description="Assign the technical team from the action bar above." />
        ) : (
          <div className="space-y-2">
            {tasks.map((t: any) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 justify-between rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {String(t.service_type).toUpperCase()} · {String(t.task_type).replace(/_/g, " ")} ·{" "}
                    {t.assignee ? `assigned to ${t.assignee}` : "unassigned"}
                    {t.due_date ? ` · due ${new Date(t.due_date).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={toneForStatus(t.status)}>{String(t.status).replace(/_/g, " ")}</StatusBadge>
                  <Select value={t.status} onValueChange={(v) => mut.mutate({ id: t.id, status: v })}>
                    <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
