import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/page";
import { CrudTable, type FieldDef, type ColumnDef } from "@/lib/crud-table";

export const Route = createFileRoute("/payments")({
  head: () => ({ meta: [{ title: "Payments — RoyEno CRM" }, { name: "description", content: "Record and reconcile customer payments." }] }),
  component: PaymentsPage,
});

type Payment = { id: string; client_name: string | null; amount: number; method: string | null; reference: string | null; paid_on: string; };

const METHODS = ["Cash", "Bank Transfer", "EcoCash", "ZIPIT", "USD Cash", "Card", "Other"] as const;

const fields: FieldDef[] = [
  { key: "client_name", label: "Client", required: true },
  { key: "amount", label: "Amount (USD)", type: "number", default: 0, required: true },
  { key: "method", label: "Method", type: "select", options: METHODS },
  { key: "reference", label: "Reference / Receipt #" },
  { key: "paid_on", label: "Paid On", type: "date" },
  { key: "notes", label: "Notes", type: "textarea", colSpan: 2 },
];

const columns: ColumnDef<Payment>[] = [
  { header: "Client", render: (r) => <span className="font-semibold text-sm">{r.client_name ?? "—"}</span> },
  { header: "Method", render: (r) => r.method ?? "—" },
  { header: "Reference", render: (r) => <span className="font-mono text-xs">{r.reference ?? "—"}</span> },
  { header: "Paid On", render: (r) => r.paid_on },
  { header: "Amount", className: "text-right", render: (r) => <span className="font-semibold text-solar">${Number(r.amount).toLocaleString()}</span> },
];

function PaymentsPage() {
  return (
    <PageContainer>
      <PageHeader eyebrow="Finance" title="Payments" description="Record incoming payments and keep your books accurate." />
      <CrudTable<Payment>
        table="payments" queryKey="payments" title="Payments" addLabel="Record Payment" tourTag="add-payment"
        fields={fields} columns={columns} searchKeys={["client_name", "reference", "method"]} orderBy="paid_on"
      />
    </PageContainer>
  );
}
