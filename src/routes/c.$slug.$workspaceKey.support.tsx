import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkspaceContext, workspaceTickets } from "@/lib/portal.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/c/$slug/$workspaceKey/support")({ component: SupportPage });

function SupportPage() {
  const { slug, workspaceKey } = Route.useParams();
  const ctxFn = useServerFn(getWorkspaceContext);
  const { data: ctx } = useQuery({ queryKey: ["ws-ctx", slug, workspaceKey], queryFn: () => ctxFn({ data: { slug, workspaceKey } }) });
  const workspaceId = (ctx as any)?.workspace?.id;
  const fn = useServerFn(workspaceTickets);
  const { data: tickets = [] } = useQuery({ queryKey: ["ws-tickets", workspaceId], queryFn: () => fn({ data: { workspaceId } }), enabled: !!workspaceId });
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-display font-bold">Support</h1><p className="text-sm text-muted-foreground">Tickets raised with the IMT support desk.</p></div>
      <Card><CardHeader><CardTitle className="text-base">Tickets ({(tickets as any[]).length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(tickets as any[]).length === 0 && <p className="text-sm text-muted-foreground">No tickets yet.</p>}
          {(tickets as any[]).map((t: any) => (
            <div key={t.id} className="flex items-center justify-between border-b last:border-0 py-2 text-sm">
              <div><div className="font-medium">{t.ticket_number ?? t.id.slice(0,8)} · {t.subject}</div><div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div></div>
              <div className="flex items-center gap-3"><Badge variant="outline" className="capitalize">{t.priority}</Badge><Badge variant="outline" className="capitalize">{t.status}</Badge></div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
