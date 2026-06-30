import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { CrudTable, type FieldDef, type ColumnDef } from "@/lib/crud-table";

export const Route = createFileRoute("/quotes")({
  head: () => ({ meta: [{ title: "Quotes — RoyEno CRM" }, { name: "description", content: "Issue and track customer quotes." }] }),
  component: QuotesPage,
});

type Quote = { id: string; number: string; client_name: string | null; system_summary: string | null; amount: number; status: string; valid_until: string | null; };

const STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired"] as const;
const tone: Record<string, "info" | "warning" | "success" | "danger" | "neutral"> = {
  Draft: "neutral", Sent: "info", Accepted: "success", Rejected: "danger", Expired: "warning",
};

const fields: FieldDef[] = [
  { key: "number", label: "Quote Number", required: true, placeholder: "Q-0001" },
  { key: "client_name", label: "Client", placeholder: "Client / company name" },
  { key: "system_summary", label: "System Summary", colSpan: 2, placeholder: "e.g. 8kW Hybrid + 10kWh battery" },
  { key: "amount", label: "Amount (USD)", type: "number", default: 0 },
  { key: "status", label: "Status", type: "select", options: STATUSES, default: "Draft" },
  { key: "valid_until", label: "Valid Until", type: "date" },
  { key: "notes", label: "Notes", type: "textarea", colSpan: 2 },
];

const columns: ColumnDef<Quote>[] = [
  { header: "Number", render: (r) => <span className="font-mono font-semibold text-sm">{r.number}</span> },
  { header: "Client", render: (r) => r.client_name ?? "—" },
  { header: "System", render: (r) => <span className="text-sm text-muted-foreground">{r.system_summary ?? "—"}</span> },
  { header: "Valid Until", render: (r) => r.valid_until ?? "—" },
  { header: "Status", render: (r) => <StatusPill tone={tone[r.status] ?? "neutral"}>{r.status}</StatusPill> },
  { header: "Amount", className: "text-right", render: (r) => <span className="font-semibold text-solar">${Number(r.amount).toLocaleString()}</span> },
];

function QuotesPage() {
  return (
    <PageContainer>
      <PageHeader eyebrow="Sales" title="Quotes" description="Issue customer quotes and track their lifecycle from draft to acceptance." />
      <CrudTable<Quote>
        table="quotes" queryKey="quotes" title="Quotes" addLabel="New Quote" tourTag="add-quote"
        fields={fields} columns={columns} searchKeys={["number", "client_name", "system_summary"]}
      />
    </PageContainer>
  );
}
