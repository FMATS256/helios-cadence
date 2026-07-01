import { createFileRoute, Link } from "@tanstack/react-router";
import { ModulePage, useCustomersLite } from "@/components/module-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/page";

const STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"];
const PRIORITIES = ["low", "medium", "high", "critical"];

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "Projects — IMT Operations" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data: customers = [] } = useCustomersLite();
  return (
    <ModulePage
      eyebrow="Services"
      title="Projects"
      description="Customer engagements — timelines, owners and delivery status."
      table="projects"
      queryKey="projects"
      searchFields={["name", "project_code", "account_number", "status"]}
      emptyLabel="No projects yet."
      createTitle="New project"
      createLabel="New project"
      emptyForm={{ customer_id: "", project_code: "", name: "", description: "", status: "planning", priority: "medium", start_date: "", due_date: "", budget: 0 }}
      validateForm={(f) => (!f.customer_id ? "Customer required" : !f.name ? "Name required" : null)}
      transformInsert={(f) => ({ ...f, start_date: f.start_date || null, due_date: f.due_date || null, budget: Number(f.budget) || null })}
      columns={[
        { header: "Project", cell: (r: any) => <div><div className="font-semibold">{r.name}</div><div className="text-xs text-muted-foreground font-mono">{r.project_code || "—"}</div></div> },
        { header: "Customer", cell: (r: any) => <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono text-xs text-solar hover:underline">{r.account_number}</Link> },
        { header: "Status", cell: (r: any) => <StatusPill tone={r.status === "completed" ? "success" : r.status === "active" ? "info" : r.status === "cancelled" ? "danger" : "neutral"}>{r.status.replace(/_/g, " ")}</StatusPill> },
        { header: "Priority", cell: (r: any) => <StatusPill tone={r.priority === "critical" ? "danger" : r.priority === "high" ? "warning" : "neutral"}>{r.priority}</StatusPill> },
        { header: "Start", cell: (r: any) => r.start_date ? new Date(r.start_date).toLocaleDateString() : "—" },
        { header: "Due", cell: (r: any) => r.due_date ? new Date(r.due_date).toLocaleDateString() : "—" },
        { header: "Budget", cell: (r: any) => r.budget ? <span className="font-mono">${Number(r.budget).toLocaleString()}</span> : "—" },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2"><Label>Customer *</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Project code</Label><Input value={form.project_code} onChange={(e) => setForm({ ...form, project_code: e.target.value })} placeholder="PRJ-001" /></div>
          <div className="space-y-2"><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Start date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="space-y-2"><Label>Due date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          <div className="space-y-2"><Label>Budget</Label><Input type="number" step="0.01" min="0" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
