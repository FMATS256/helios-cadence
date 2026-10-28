import { EmbeddedPageContext } from "@/components/enterprise";
import { WorkOrdersPage } from "@/components/techops/work-orders-section";
import { EquipmentPage } from "@/components/techops/equipment-section";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, DetailCard, StatusBadge,
  toneForStatus, RefreshButton, EmptyState, shortDate,
} from "@/components/enterprise";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Wrench, Siren, LifeBuoy, PackageCheck, CalendarClock, AlertTriangle } from "lucide-react";
import { technicianDashboard } from "@/lib/techops.functions";

export const Route = createFileRoute("/techops/dashboard")({
  head: () => ({
    meta: [
      { title: "Technician Dashboard — IMT Technical Operations" },
      { name: "description", content: "Assigned jobs, critical alerts, upcoming installations, allocated equipment and infrastructure needing attention." },
      { property: "og:title", content: "Technician Dashboard — IMT Technical Operations" },
      { property: "og:description", content: "Live technical operations workload: jobs, alerts, tickets and equipment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ tab: typeof s.tab === "string" ? s.tab : undefined }),
  component: TechDashboard,
});

function TechDashboard() {
  const { tab } = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const dashFn = useServerFn(technicianDashboard);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["techops-dashboard", scope],
    queryFn: async () => (await dashFn({ data: { scope } })) as any,
    refetchInterval: 60_000,
  });

  const s = data?.stats ?? {};
  const chips = [
    { label: "Open Jobs", value: s.my_jobs ?? 0, color: "#4f46e5" },
    { label: "In Progress", value: s.in_progress ?? 0, color: "#0ea5e9" },
    { label: "Next 7 Days", value: s.scheduled_7d ?? 0, color: "#0891b2" },
    { label: "Unassigned", value: s.unassigned ?? 0, color: "#f59e0b", text: "#3b2600" },
    { label: "Critical Alerts", value: s.critical_alerts ?? 0, color: "#dc2626" },
    { label: "Open Alerts", value: s.open_alerts ?? 0, color: "#e11d48" },
    { label: "Checks Down", value: `${s.checks_down ?? 0}/${s.checks_total ?? 0}`, color: "#be123c" },
    { label: "Servers Attention", value: `${s.servers_attention ?? 0}/${s.servers_total ?? 0}`, color: "#7c3aed" },
    { label: "Open Tickets", value: s.open_tickets ?? 0, color: "#059669" },
    { label: "Equipment Out", value: s.equipment_out ?? 0, color: "#0f766e" },
    { label: "Incidents", value: s.open_incidents ?? 0, color: "#b45309" },
    { label: "Failed Jobs", value: s.failed_jobs ?? 0, color: "#475569" },
  ];

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Technical Operations"
        title="Technician Dashboard"
        description="Everything assigned to you right now — jobs, alerts, tickets, equipment and infrastructure needing attention."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={scope === "mine" ? "default" : "outline"}
              size="sm"
              onClick={() => setScope("mine")}
            >
              My Work
            </Button>
            <Button
              variant={scope === "team" ? "default" : "outline"}
              size="sm"
              onClick={() => setScope("team")}
            >
              Whole Team
            </Button>
            <RefreshButton loading={isFetching} onClick={() => qc.invalidateQueries({ queryKey: ["techops-dashboard"] })} />
          </div>
        }
      />

      <StatChipRow chips={chips} cols={6} />

      <Tabs defaultValue={tab ?? "jobs"} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="jobs"><Wrench className="h-3.5 w-3.5 mr-1.5" />Jobs</TabsTrigger>
          <TabsTrigger value="workorders"><Wrench className="h-3.5 w-3.5 mr-1.5" />Work Orders</TabsTrigger>
          <TabsTrigger value="upcoming"><CalendarClock className="h-3.5 w-3.5 mr-1.5" />Upcoming</TabsTrigger>
          <TabsTrigger value="alerts"><Siren className="h-3.5 w-3.5 mr-1.5" />Alerts</TabsTrigger>
          <TabsTrigger value="tickets"><LifeBuoy className="h-3.5 w-3.5 mr-1.5" />Tickets</TabsTrigger>
          <TabsTrigger value="equipment"><PackageCheck className="h-3.5 w-3.5 mr-1.5" />Equipment</TabsTrigger>
          <TabsTrigger value="failures"><AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Failures</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="mt-4 space-y-4">
          <DetailCard title="Assigned jobs" padded={false}>
            <DataGrid
              loading={isLoading}
              rows={(data?.jobs ?? []) as any[]}
              onRowClick={(r: any) => navigate({ to: "/techops/jobs/$id", params: { id: r.id } })}
              empty={<EmptyState title="No open jobs" description="Nothing is currently assigned to this scope." />}
              columns={[
                { header: "Job", cell: (r: any) => <span className="font-medium">{r.title}</span> },
                { header: "Customer", cell: (r: any) => r.customer?.company_name ?? "—" },
                { header: "Type", cell: (r: any) => <span className="capitalize">{String(r.task_type).replace(/_/g, " ")}</span> },
                { header: "Priority", cell: (r: any) => <StatusBadge tone={toneForStatus(r.priority)}>{r.priority}</StatusBadge> },
                { header: "Scheduled", cell: (r: any) => shortDate(r.scheduled_at) },
                { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{String(r.status).replace(/_/g, " ")}</StatusBadge> },
              ]}
            />
          </DetailCard>
          {!!data?.unassigned?.length && (
            <DetailCard title="Unassigned queue" padded={false}>
              <DataGrid
                rows={data.unassigned as any[]}
                onRowClick={(r: any) => navigate({ to: "/techops/jobs/$id", params: { id: r.id } })}
                columns={[
                  { header: "Job", cell: (r: any) => r.title },
                  { header: "Customer", cell: (r: any) => r.customer?.company_name ?? "—" },
                  { header: "Priority", cell: (r: any) => <StatusBadge tone={toneForStatus(r.priority)}>{r.priority}</StatusBadge> },
                  { header: "Created", cell: (r: any) => shortDate(r.created_at) },
                ]}
              />
            </DetailCard>
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4">
          <DetailCard title="Scheduled in the next 7 days" padded={false}>
            <DataGrid
              rows={(data?.upcoming ?? []) as any[]}
              onRowClick={(r: any) => navigate({ to: "/techops/jobs/$id", params: { id: r.id } })}
              empty={<EmptyState title="Nothing scheduled" description="No installations or visits booked for the coming week." />}
              columns={[
                { header: "When", cell: (r: any) => shortDate(r.scheduled_at) },
                { header: "Job", cell: (r: any) => r.title },
                { header: "Site", cell: (r: any) => r.site_name || r.site_address || "—" },
                { header: "Customer", cell: (r: any) => r.customer?.company_name ?? "—" },
                { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{String(r.status).replace(/_/g, " ")}</StatusBadge> },
              ]}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <DetailCard
            title="Operational alerts"
            padded={false}
            action={<Link to="/noc" search={{ tab: "alerts" }} className="text-xs font-semibold text-info">Open alert console →</Link>}
          >
            <DataGrid
              rows={(data?.alerts ?? []) as any[]}
              empty={<EmptyState title="All clear" description="No unresolved alerts across monitored infrastructure." />}
              columns={[
                { header: "Severity", cell: (r: any) => <StatusBadge tone={toneForStatus(r.severity)}>{r.severity}</StatusBadge> },
                { header: "Alert", cell: (r: any) => <span className="font-medium">{r.title}</span> },
                { header: "Source", cell: (r: any) => <span className="capitalize">{String(r.source).replace(/_/g, " ")}</span> },
                { header: "Account", cell: (r: any) => r.account_number ?? "—" },
                { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{String(r.status).replace(/_/g, " ")}</StatusBadge> },
                { header: "Last seen", cell: (r: any) => shortDate(r.last_seen_at) },
              ]}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="tickets" className="mt-4">
          <DetailCard title="Open support tickets" padded={false}>
            <DataGrid
              rows={(data?.tickets ?? []) as any[]}
              onRowClick={(r: any) => navigate({ to: "/tickets/$id", params: { id: r.id } })}
              empty={<EmptyState title="No open tickets" description="Nothing waiting on technical support in this scope." />}
              columns={[
                { header: "Ticket", cell: (r: any) => r.ticket_number },
                { header: "Subject", cell: (r: any) => r.subject },
                { header: "Customer", cell: (r: any) => r.customer?.company_name ?? "—" },
                { header: "Priority", cell: (r: any) => <StatusBadge tone={toneForStatus(r.priority)}>{r.priority}</StatusBadge> },
                { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{String(r.status).replace(/_/g, " ")}</StatusBadge> },
              ]}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="equipment" className="mt-4">
          <DetailCard
            title="Equipment in your hands"
            padded={false}
            action={<span className="text-xs text-muted-foreground">Full register below</span>}
          >
            <DataGrid
              rows={(data?.equipment ?? []) as any[]}
              onRowClick={(r: any) => navigate({ to: "/techops/jobs/$id", params: { id: r.task_id } })}
              empty={<EmptyState title="No equipment allocated" description="You have no reserved or issued equipment outstanding." />}
              columns={[
                { header: "Item", cell: (r: any) => r.description },
                { header: "Qty", cell: (r: any) => r.quantity, align: "right" },
                { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge> },
              ]}
            />
          </DetailCard>
        </TabsContent>

        <EmbeddedPageContext.Provider value={true}>
          <TabsContent value="workorders" className="mt-4"><WorkOrdersPage /></TabsContent>
          <TabsContent value="equipment" className="mt-4"><EquipmentPage /></TabsContent>
        </EmbeddedPageContext.Provider>

        <TabsContent value="failures" className="mt-4">
          <DetailCard title="Failed automation & provisioning runs" padded={false}>
            <DataGrid
              rows={(data?.failedAutomation ?? []) as any[]}
              empty={<EmptyState title="No failures" description="Automation and provisioning jobs completed cleanly." />}
              columns={[
                { header: "Rule", cell: (r: any) => r.rule },
                { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge> },
                { header: "Error", cell: (r: any) => <span className="text-xs text-muted-foreground">{r.error ?? "—"}</span> },
                { header: "When", cell: (r: any) => shortDate(r.created_at) },
              ]}
            />
          </DetailCard>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
