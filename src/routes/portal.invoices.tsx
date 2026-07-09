import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortal } from "@/hooks/use-portal";
import { StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt } from "lucide-react";

export const Route = createFileRoute("/portal/invoices")({
  head: () => ({ meta: [{ title: "My Invoices — IMT Portal" }] }),
  component: PortalInvoices,
});

function PortalInvoices() {
  const { customer } = usePortal();
  const { data: invoices = [] } = useQuery({
    queryKey: ["portal-invoices", customer?.id],
    enabled: !!customer?.id,
    queryFn: async () => (await supabase.from("invoices").select("*").eq("customer_id", customer!.id).order("issue_date", { ascending: false })).data ?? [],
  });
  const totalOwed = (invoices as any[]).filter((i) => i.status !== "paid").reduce((s, i) => s + Number(i.total || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">My invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">Outstanding balance: <span className="font-mono font-semibold text-foreground">{totalOwed.toFixed(2)}</span></p>
      </div>
      <Card><CardContent className="p-0">
        {invoices.length === 0 ? (
          <div className="p-12 text-center"><Receipt className="h-8 w-8 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">No invoices yet.</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Issued</TableHead><TableHead>Due</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {(invoices as any[]).map((i) => {
                const overdue = i.due_date && i.status !== "paid" && new Date(i.due_date) < new Date();
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono font-semibold">{i.invoice_number}</TableCell>
                    <TableCell>{new Date(i.issue_date).toLocaleDateString()}</TableCell>
                    <TableCell>{i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="font-mono">{i.currency} {Number(i.total).toFixed(2)}</TableCell>
                    <TableCell><StatusPill tone={i.status === "paid" ? "success" : overdue ? "danger" : "info"}>{overdue ? "overdue" : i.status}</StatusPill></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}
