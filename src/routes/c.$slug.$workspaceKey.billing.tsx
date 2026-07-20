import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkspaceContext, workspaceInvoices } from "@/lib/portal.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/c/$slug/$workspaceKey/billing")({ component: BillingPage });

function BillingPage() {
  const { slug, workspaceKey } = Route.useParams();
  const ctxFn = useServerFn(getWorkspaceContext);
  const { data: ctx } = useQuery({ queryKey: ["ws-ctx", slug, workspaceKey], queryFn: () => ctxFn({ data: { slug, workspaceKey } }) });
  const workspaceId = (ctx as any)?.workspace?.id;
  const fn = useServerFn(workspaceInvoices);
  const { data: invoices = [] } = useQuery({ queryKey: ["ws-invoices", workspaceId], queryFn: () => fn({ data: { workspaceId } }), enabled: !!workspaceId });
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-display font-bold">Billing</h1><p className="text-sm text-muted-foreground">Invoices issued by IMT Solutions for this workspace.</p></div>
      <Card><CardHeader><CardTitle className="text-base">Invoices ({(invoices as any[]).length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(invoices as any[]).length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}
          {(invoices as any[]).map((i: any) => (
            <div key={i.id} className="flex items-center justify-between border-b last:border-0 py-2 text-sm">
              <div><div className="font-medium">{i.invoice_number ?? i.id.slice(0,8)}</div><div className="text-xs text-muted-foreground">Issued {i.issued_on ?? "—"}</div></div>
              <div className="flex items-center gap-3"><Badge variant="outline" className="capitalize">{i.status}</Badge><span className="font-semibold">${Number(i.total ?? 0).toFixed(2)}</span></div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
