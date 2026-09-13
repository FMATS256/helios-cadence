import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { WorkspaceTabs } from "@/components/workspace-tabs";
import { PaymentsPage } from "@/components/workspaces/payments-workspace";
import { BillingPage } from "@/components/workspaces/billing-workspace";
import { SubmissionsWorkspace } from "@/components/workspaces/submissions-workspace";
import { getCustomerBalances } from "@/lib/finance.functions";
import { PageShell, SectionHeader, KpiRow, StatusBadge, money as fmtMoney } from "@/components/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, AlertTriangle, Users, Search, Download, Receipt } from "lucide-react";

const TABS = [
  { key: "payments", label: "Payments" },
  { key: "submissions", label: "Submissions" },
  { key: "refunds", label: "Refunds" },
  { key: "invoices", label: "Invoices" },
  { key: "balances", label: "Balances Due" },
] as const;


export const Route = createFileRoute("/payments")({
  validateSearch: (s: Record<string, unknown>): { tab?: string } =>
    typeof s.tab === "string" ? { tab: s.tab } : {},
  head: () => ({
    meta: [
      { title: "Payments & Receivables — IMT Operations" },
      { name: "description", content: "Record payments, generate invoices and track the balance due on every customer account in one workspace." },
      { property: "og:title", content: "Payments & Receivables — IMT Operations" },
      { property: "og:description", content: "Payment tracking, invoice generation and live customer balances for IMT Operations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentsWorkspace,
});

function PaymentsWorkspace() {
  const { tab } = Route.useSearch();
  const active = TABS.some((t) => t.key === tab) ? tab! : "payments";
  return (
    <div>
      <WorkspaceTabs tabs={TABS as any} active={active} to="/payments" />
      {active === "payments" && <PaymentsPage />}
      {active === "submissions" && (
        <PageShell>
          <SectionHeader
            eyebrow="Separation of duties"
            title="Payment Submissions"
            description="Account managers submit payment evidence; billing verifies, approves and records it against the invoice."
          />
          <SubmissionsWorkspace />
        </PageShell>
      )}
      {active === "invoices" && <BillingPage />}
      {active === "balances" && <BalancesPage />}
    </div>
  );
}

function BalancesPage() {
  const load = useServerFn(getCustomerBalances);
  const { data, isLoading } = useQuery({ queryKey: ["customer-balances"], queryFn: () => load({ data: {} }) });
  const [search, setSearch] = useState("");
  const [onlyDue, setOnlyDue] = useState(true);

  const rows = useMemo(() => {
    const list = (data?.balances ?? []) as any[];
    return list.filter((r) => {
      if (onlyDue && r.balance <= 0.005) return false;
      if (!search) return true;
      const v = search.toLowerCase();
      return [r.company_name, r.account_number].some((f) => String(f ?? "").toLowerCase().includes(v));
    });
  }, [data, search, onlyDue]);

  function exportCsv() {
    const headers = ["Account", "Customer", "Invoiced", "Paid", "Balance Due", "Overdue", "Open Invoices", "Oldest Due", "Last Payment"];
    const lines = [headers.join(",")].concat(
      rows.map((r) => [
        r.account_number, r.company_name, r.invoiced.toFixed(2), r.paid.toFixed(2),
        r.balance.toFixed(2), r.overdue.toFixed(2), r.open_invoices,
        r.oldest_due ?? "", r.last_payment_at ?? "",
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `balances-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const stats = data?.stats;

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Receivables"
        title="Balances Due"
        description="Live balance due per customer account, netted against every payment allocation."
        actions={<Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>}
      />

      <KpiRow
        items={[
          { icon: Wallet, label: "Total due", value: fmtMoney(stats?.totalDue ?? 0), tone: "warning" },
          { icon: AlertTriangle, label: "Overdue", value: fmtMoney(stats?.totalOverdue ?? 0), tone: "danger" },
          { icon: Users, label: "Accounts in debt", value: String(stats?.accountsInDebt ?? 0), tone: "info" },
          { icon: Receipt, label: "Accounts overdue", value: String(stats?.accountsOverdue ?? 0), tone: "danger" },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search customer or account…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant={onlyDue ? "default" : "outline"} size="sm" onClick={() => setOnlyDue((v) => !v)}>
              {onlyDue ? "Showing accounts with a balance" : "Showing all accounts"}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Invoiced</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance due</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead>Oldest due</TableHead>
                  <TableHead>Last payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Loading balances…</TableCell></TableRow>}
                {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No balances to show.</TableCell></TableRow>}
                {rows.map((r) => (
                  <TableRow key={r.customer_id}>
                    <TableCell className="font-medium">
                      <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="hover:underline">
                        {r.company_name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.account_number}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.invoiced)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.paid)}</TableCell>
                    <TableCell className={`text-right font-semibold ${r.balance > 0.005 ? "text-destructive" : ""}`}>{fmtMoney(r.balance)}</TableCell>
                    <TableCell className="text-right">
                      {r.overdue > 0.005 ? <StatusBadge tone="danger">{fmtMoney(r.overdue)}</StatusBadge> : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.oldest_due ? new Date(r.oldest_due).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.last_payment_at ? `${new Date(r.last_payment_at).toLocaleDateString()} · ${fmtMoney(r.last_payment_amount)}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
