import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listServiceTasks, updateServiceTask } from "@/lib/service-tasks.functions";
import { TASK_STATUSES } from "@/lib/service-tasks.shared";
import { useTechnicians } from "@/components/assign-tech-dialog";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, StatusBadge, toneForStatus,
  EmptyState, shortDate, type ColumnDef,
} from "@/components/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Wrench, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/work-orders")({
  head: () => ({
    meta: [
      { title: "Technical Work Orders — IMT Operations" },
      { name: "description", content: "Technical deployment and provisioning tasks assigned by account managers to the IMT technical team." },
      { property: "og:title", content: "Technical Work Orders — IMT Operations" },
      { property: "og:description", content: "Track server deployments, VoIP provisioning and field work across every customer account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkOrdersPage,
});

function WorkOrdersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listServiceTasks);
  const updateFn = useServerFn(updateServiceTask);
  const { data: staff = [] } = useTechnicians();

  const [tab, setTab] = useState("open");
  const [search, setSearch] = useState("");

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["service-tasks", "all"],
    queryFn: async () => (await listFn({ data: {} })) as any[],
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["service-tasks"] });

  const mut = useMutation({
    mutationFn: async (v: { id: string; status?: string; assigned_to?: string | null }) => updateFn({ data: v }),
    onSuccess: () => { toast.success("Work order updated"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Update failed"),
  });

  const stats = useMemo(() => {
    const open = tasks.filter((t) => !["completed", "cancelled"].includes(t.status));
    return {
      open: open.length,
      unassigned: tasks.filter((t) => t.status === "pending" && !t.assigned_to).length,
      inProgress: tasks.filter((t) => t.status === "in_progress").length,
      overdue: open.filter((t) => t.due_date && new Date(t.due_date).getTime() < Date.now()).length,
      completed: tasks.filter((t) => t.status === "completed").length,
      total: tasks.length,
    };
  }, [tasks]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return tasks.filter((t) => {
      if (tab === "open" && ["completed", "cancelled"].includes(t.status)) return false;
      if (tab === "unassigned" && t.assigned_to) return false;
      if (tab === "in_progress" && t.status !== "in_progress") return false;
      if (tab === "completed" && t.status !== "completed") return false;
      if (!s) return true;
      return [t.title, t.customer?.company_name, t.account_number, t.service_type, t.task_type, t.assignee]
        .some((f) => String(f ?? "").toLowerCase().includes(s));
    });
  }, [tasks, tab, search]);

  const columns: ColumnDef<any>[] = [
    { header: "Task", cell: (r: any) => (
      <div>
        <Link to="/techops/jobs/$id" params={{ id: r.id }} className="font-medium text-primary hover:underline">
          {r.title}
        </Link>
        <div className="text-xs text-muted-foreground">
          {String(r.service_type).toUpperCase()} · {String(r.task_type).replace(/_/g, " ")} · {r.priority}
          {r.site_name ? ` · ${r.site_name}` : ""}
        </div>
      </div>
    ) },

    { header: "Customer", cell: (r: any) => r.customer?.account_number ? (
      <Link to="/customers/$accountNumber" params={{ accountNumber: r.customer.account_number }} className="text-primary hover:underline">
        {r.customer.company_name}
      </Link>
    ) : "—" },
    { header: "Technician", cell: (r: any) => (
      <Select value={r.assigned_to ?? "none"} onValueChange={(v) => mut.mutate({ id: r.id, assigned_to: v === "none" ? null : v })}>
        <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Unassigned" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
    ) },
    { header: "Due", cell: (r: any) => (r.due_date ? shortDate(r.due_date) : "—") },
    { header: "Status", cell: (r: any) => (
      <div className="flex items-center gap-2">
        <StatusBadge tone={toneForStatus(r.status)}>{String(r.status).replace(/_/g, " ")}</StatusBadge>
        <Select value={r.status} onValueChange={(v) => mut.mutate({ id: r.id, status: v })}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    ) },
  ];

  const chips = [
    { label: "OPEN", value: String(stats.open), color: "#2563eb" },
    { label: "UNASSIGNED", value: String(stats.unassigned), color: "#f59e0b" },
    { label: "IN PROGRESS", value: String(stats.inProgress), color: "#7c3aed" },
    { label: "OVERDUE", value: String(stats.overdue), color: "#dc2626" },
    { label: "COMPLETED", value: String(stats.completed), color: "#10b981" },
    { label: "TOTAL", value: String(stats.total), color: "#0891b2" },
  ];

  return (
    <PageShell>
      <SectionHeader
        title="Technical Work Orders"
        description="Deployment, provisioning and field tasks raised from customer accounts."
        actions={<Button variant="outline" onClick={refresh}><RefreshCw className="h-4 w-4 mr-1.5" />Refresh</Button>}
      />

      <StatChipRow chips={chips} cols={3} />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="open">Open</TabsTrigger>
                <TabsTrigger value="unassigned">Unassigned</TabsTrigger>
                <TabsTrigger value="in_progress">In progress</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search work orders…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {!isLoading && filtered.length === 0 ? (
            <EmptyState title="No work orders" description="Assign the technical team from a customer's 360 page." icon={Wrench} />
          ) : (
            <DataGrid rows={filtered} columns={columns} loading={isLoading} />
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
