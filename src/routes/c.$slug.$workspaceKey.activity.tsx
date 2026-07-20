import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkspaceContext, listWorkspaceAudit } from "@/lib/portal.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/c/$slug/$workspaceKey/activity")({ component: ActivityPage });

function ActivityPage() {
  const { slug, workspaceKey } = Route.useParams();
  const ctxFn = useServerFn(getWorkspaceContext);
  const { data: ctx } = useQuery({ queryKey: ["ws-ctx", slug, workspaceKey], queryFn: () => ctxFn({ data: { slug, workspaceKey } }) });
  const workspaceId = (ctx as any)?.workspace?.id;
  const fn = useServerFn(listWorkspaceAudit);
  const { data: audit = [] } = useQuery({ queryKey: ["ws-audit-full", workspaceId], queryFn: () => fn({ data: { workspaceId, limit: 200 } }), enabled: !!workspaceId });
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-display font-bold">Activity log</h1><p className="text-sm text-muted-foreground">Every action taken in this workspace, including IMT staff overrides.</p></div>
      <Card><CardHeader><CardTitle className="text-base">Events ({(audit as any[]).length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(audit as any[]).length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
          {(audit as any[]).map((r: any) => (
            <div key={r.id} className="flex items-center justify-between border-b last:border-0 py-2 text-sm">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="uppercase text-[10px]">{r.actor_kind}</Badge>
                <span className="font-medium">{r.action.replace(/_/g, " ")}</span>
                {r.resource_kind && <span className="text-muted-foreground">· {r.resource_kind}</span>}
              </div>
              <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
