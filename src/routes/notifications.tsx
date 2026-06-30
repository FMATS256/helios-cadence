import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Bell } from "lucide-react";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — IMT Operations" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useAuth();
  const { data: rows = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  return (
    <PageContainer>
      <PageHeader eyebrow="System" title="Notifications" description="Real-time alerts from across the platform." />
      <Card><CardContent className="p-0">
        {rows.length === 0 && <div className="p-12 text-center"><Bell className="h-8 w-8 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">No notifications yet.</p></div>}
        {rows.map((n: any) => (
          <div key={n.id} className={`flex items-start gap-4 p-4 border-b border-border last:border-0 ${!n.read_at ? "bg-solar/5" : ""}`}>
            <div className="h-10 w-10 rounded-lg bg-navy/10 text-navy flex items-center justify-center"><Bell className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{n.title}</p>
              {n.body && <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>}
              <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
            </div>
            <StatusPill tone="neutral">{n.kind}</StatusPill>
          </div>
        ))}
      </CardContent></Card>
    </PageContainer>
  );
}
