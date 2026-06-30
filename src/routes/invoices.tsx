import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { CrudTable, type FieldDef, type ColumnDef } from "@/lib/crud-table";

export const Route = createFileRoute("/invoices")({
  head: () => ({ meta: [{ title: "Invoices — RoyEno CRM" }, { name: "description", content: "Issue and track customer invoices." }] }),
  component: InvoicesPage,
});

type Invoice = { id: string; number: string; client_name: string | null; amount: number; amount_paid: number; status: string; issue_date: string; due_date: string | null; };

const STATUSES = ["Draft", "Sent", "Partial", "Paid", "Overdue", "Void"] as const;
const tone: Record<string, "info" | "warning" | "success" | "danger" | "neutral"> = {
  Draft: "neutral", Sent: "info", Partial: "warning", Paid: "success", Overdue: "danger", Void: "neutral",
};

const fields: FieldDef[] = [
  { key: "number", label: "Invoice Number", required: true, placeholder: "INV-0001" },
  { key: "client_name", label: "Client" },
  { key: "amount", label: "Amount (USD)", type: "number", default: 0 },
  { key: "amount_paid", label: "Amount Paid (USD)", type: "number", default: 0 },
  { key: "status", label: "Status", type: "select", options: STATUSES, default: "Draft" },
  { key: "issue_date", label: "Issue Date", type: "date" },
  { key: "due_date", label: "Due Date", type: "date" },
  { key: "notes", label: "Notes", type: "textarea", colSpan: 2 },
];

const columns: ColumnDef<Invoice>[] = [
  { header: "Number", render: (r) => <span className="font-mono font-semibold text-sm">{r.number}</span> },
  { header: "Client", render: (r) => r.client_name ?? "—" },
  { header: "Issued", render: (r) => r.issue_date },
  { header: "Due", render: (r) => r.due_date ?? "—" },
  { header: "Status", render: (r) => <StatusPill tone={tone[r.status] ?? "neutral"}>{r.status}</StatusPill> },
  { header: "Paid", className: "text-right", render: (r) => <span className="text-sm">${Number(r.amount_paid).toLocaleString()}</span> },
  { header: "Total", className: "text-right", render: (r) => <span className="font-semibold text-solar">${Number(r.amount).toLocaleString()}</span> },
];

function InvoicesPage() {
  return (
    <PageContainer>
      <PageHeader eyebrow="Finance" title="Invoices" description="Bill customers and track outstanding balances." />
      <CrudTable<Invoice>
        table="invoices" queryKey="invoices" title="Invoices" addLabel="New Invoice" tourTag="add-invoice"
        fields={fields} columns={columns} searchKeys={["number", "client_name"]}
      />
    </PageContainer>
  );
}
