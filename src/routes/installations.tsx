import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Progress } from "@/components/ui/progress";
import { CrudTable, type FieldDef, type ColumnDef } from "@/lib/crud-table";

export const Route = createFileRoute("/installations")({
  head: () => ({ meta: [{ title: "Installations — RoyEno CRM" }, { name: "description", content: "Track field installation jobs." }] }),
  component: InstallationsPage,
});

type Install = { id: string; client_name: string | null; system: string | null; city: string | null; crew_lead: string | null; scheduled_date: string | null; status: string; progress: number; };

const STATUSES = ["Scheduled", "In Progress", "Commissioning", "Active", "On Hold", "Cancelled"] as const;
const tone: Record<string, "info" | "warning" | "solar" | "success" | "danger" | "neutral"> = {
  Scheduled: "info", "In Progress": "warning", Commissioning: "solar", Active: "success", "On Hold": "warning", Cancelled: "danger",
};

const fields: FieldDef[] = [
  { key: "client_name", label: "Client", required: true },
  { key: "system", label: "System", placeholder: "e.g. 10kW Hybrid + 15kWh battery", colSpan: 2 },
  { key: "city", label: "City" },
  { key: "crew_lead", label: "Crew Lead" },
  { key: "scheduled_date", label: "Scheduled Date", type: "date" },
  { key: "status", label: "Status", type: "select", options: STATUSES, default: "Scheduled" },
  { key: "progress", label: "Progress (0-100)", type: "number", default: 0 },
  { key: "notes", label: "Notes", type: "textarea", colSpan: 2 },
];

const columns: ColumnDef<Install>[] = [
  { header: "Client", render: (r) => <span className="font-semibold text-sm">{r.client_name ?? "—"}</span> },
  { header: "System", render: (r) => <span className="text-sm text-muted-foreground">{r.system ?? "—"}</span> },
  { header: "City", render: (r) => r.city ?? "—" },
  { header: "Crew", render: (r) => r.crew_lead ?? "—" },
  { header: "Scheduled", render: (r) => r.scheduled_date ?? "—" },
  { header: "Progress", render: (r) => <div className="w-32"><Progress value={Number(r.progress) || 0} className="h-1.5" /><p className="text-xs text-muted-foreground mt-1">{r.progress}%</p></div> },
  { header: "Status", render: (r) => <StatusPill tone={tone[r.status] ?? "info"}>{r.status}</StatusPill> },
];

function InstallationsPage() {
  return (
    <PageContainer>
      <PageHeader eyebrow="Operations" title="Installations" description="Schedule and track field installation jobs from kickoff to commissioning." />
      <CrudTable<Install>
        table="installations" queryKey="installations" title="Installations" addLabel="Schedule Job" tourTag="add-install"
        fields={fields} columns={columns} searchKeys={["client_name", "system", "city", "crew_lead"]} orderBy="scheduled_date" orderAsc
      />
    </PageContainer>
  );
}
